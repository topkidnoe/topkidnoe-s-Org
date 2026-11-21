import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, type Content } from '@google/genai';
import {
  clearChatThreadForUser,
  createFaqForUser,
  createTransactionForUser,
  deleteFaqForUser,
  deleteProductForUser,
  deleteTransactionForUser,
  getStoreDataForUser,
  resetUserDataToStarter,
  saveChatTurnForUser,
  seedStarterDataForUserIfEmpty,
  toggleChatMessageResolved,
  updateUserProfile,
  upsertProductForUser,
} from './src/db/repository.ts';
import { getOrCreateUser } from './src/db/users.ts';
import { type AuthRequest, optionalAuth, requireAuth } from './src/middleware/auth.ts';
import type { ChatModelChoice, ChatPersona } from './src/lib/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const FREE_DAILY_QUOTA = 20;
const PRO_DAILY_QUOTA = 100;

const dailyQuotaCounter = new Map<string, number>();

function sanitizePromptText(input: string): string {
  return input
    .replace(/(\+62|62|0)8[1-9][0-9\-\s]{6,13}/g, '[KONTAK_DISAMARKAN]')
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL_DISAMARKAN]')
    .replace(/\b\d{12,16}\b/g, '[NOMOR_DISAMARKAN]');
}

function getTodayKey(userId: string): string {
  const day = new Date().toISOString().slice(0, 10);
  return `${userId}:${day}`;
}

function resolvePersonaAndModel(
  personaRaw: string | undefined,
  speedMode: string | undefined
): { persona: ChatPersona; model: ChatModelChoice; roleDirective: string } {
  const persona: ChatPersona = personaRaw === 'pricing' ? 'pricing' : 'advisor';

  if (persona === 'pricing') {
    return {
      persona,
      model: speedMode === 'fast' ? 'gemini-3.1-flash-lite' : 'gemini-4-hydrogen',
      roleDirective:
        'Peranmu adalah Strategis Harga & Margin UMKM untuk pemilik usaha. Fokus pada analisis margin bersih, bundling produk, rekomendasi penyesuaian harga, serta target titik impas (BEP) yang realistis.',
    };
  }

  return {
    persona: 'advisor',
    model: speedMode === 'fast' ? 'gemini-3.1-flash-lite' : 'gemini-4-hydrogen',
    roleDirective:
      'Peranmu adalah Konsultan Keuangan Harian & Operasional Toko untuk pemilik usaha. Bantu pemilik usaha memahami arus kas, produk terlaris, stok menipis, dan langkah taktis menaikkan laba.',
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '512kb' }));

  // Authenticated Cloud SQL store bootstrap & synchronization
  app.get('/api/store', requireAuth, async (req: AuthRequest, res) => {
    try {
      const decoded = req.user!;
      const email = decoded.email || `${decoded.uid}@users.bizbuddy.local`;
      await getOrCreateUser({
        uid: decoded.uid,
        email,
        name: typeof decoded.name === 'string' ? decoded.name : undefined,
      });
      await seedStarterDataForUserIfEmpty(decoded.uid);
      const store = await getStoreDataForUser(decoded.uid);
      res.json(store);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gagal memuat data toko.';
      res.status(500).json({ error: message });
    }
  });

  app.patch('/api/user', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const body = req.body as {
        name?: string;
        shop_name?: string;
        category?: string;
        plan?: 'free' | 'pro';
      };
      const updated = await updateUserProfile(uid, {
        name: body.name,
        shopName: body.shop_name,
        category: body.category,
        plan: body.plan,
      });
      if (!updated) {
        res.status(404).json({ error: 'Profil toko tidak ditemukan.' });
        return;
      }
      res.json({ user: updated });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gagal memperbarui profil.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/products', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const body = req.body as {
        id?: string;
        name?: string;
        unit_cost?: number;
        price?: number;
        stock?: number;
      };
      if (!body.name || !body.name.trim()) {
        res.status(400).json({ error: 'Nama produk wajib diisi.' });
        return;
      }
      const product = await upsertProductForUser(uid, {
        id: body.id,
        name: body.name,
        unit_cost: Number(body.unit_cost) || 0,
        price: Number(body.price) || 0,
        stock: Number(body.stock) || 0,
      });
      res.json({ product });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gagal menyimpan produk.';
      res.status(500).json({ error: message });
    }
  });

  app.delete('/api/products/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const removed = await deleteProductForUser(uid, req.params.id);
      if (!removed) {
        res.status(404).json({ error: 'Produk tidak ditemukan.' });
        return;
      }
      res.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gagal menghapus produk.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/transactions', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const body = req.body as {
        type?: 'sale' | 'expense';
        product_id?: string | null;
        amount?: number;
        quantity?: number;
        date?: string;
        note?: string;
      };
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        res.status(400).json({ error: 'Nominal transaksi harus lebih besar dari Rp 0.' });
        return;
      }
      const result = await createTransactionForUser(uid, {
        type: body.type === 'expense' ? 'expense' : 'sale',
        product_id: body.product_id ?? null,
        amount,
        quantity: Number(body.quantity) || 1,
        date: body.date || new Date().toISOString().slice(0, 10),
        note: body.note || 'Transaksi toko',
      });
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gagal mencatat transaksi.';
      res.status(500).json({ error: message });
    }
  });

  app.delete('/api/transactions/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const removed = await deleteTransactionForUser(uid, req.params.id);
      if (!removed) {
        res.status(404).json({ error: 'Transaksi tidak ditemukan.' });
        return;
      }
      res.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gagal menghapus transaksi.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/faqs', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const body = req.body as { question?: string; answer?: string };
      if (!body.question?.trim() || !body.answer?.trim()) {
        res.status(400).json({ error: 'Pertanyaan dan jawaban FAQ wajib diisi.' });
        return;
      }
      const faq = await createFaqForUser(uid, body.question, body.answer);
      res.json({ faq });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gagal menyimpan FAQ.';
      res.status(500).json({ error: message });
    }
  });

  app.delete('/api/faqs/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const removed = await deleteFaqForUser(uid, req.params.id);
      if (!removed) {
        res.status(404).json({ error: 'FAQ tidak ditemukan.' });
        return;
      }
      res.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gagal menghapus FAQ.';
      res.status(500).json({ error: message });
    }
  });

  app.delete('/api/chat/threads/:threadId', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      await clearChatThreadForUser(uid, req.params.threadId);
      res.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gagal membersihkan percakapan.';
      res.status(500).json({ error: message });
    }
  });

  app.patch('/api/chat/messages/:id/resolved', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const updated = await toggleChatMessageResolved(uid, req.params.id);
      if (!updated) {
        res.status(404).json({ error: 'Pesan tidak ditemukan.' });
        return;
      }
      res.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gagal memperbarui status pesan.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/store/reset', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      await resetUserDataToStarter(uid);
      const store = await getStoreDataForUser(uid);
      res.json(store);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gagal mereset data toko.';
      res.status(500).json({ error: message });
    }
  });

  // AI Quota Check
  app.get('/api/quota', optionalAuth, (req: AuthRequest, res) => {
    const userId =
      req.user?.uid || (typeof req.query.userId === 'string' ? req.query.userId : 'anonymous');
    const plan = req.query.plan === 'pro' ? 'pro' : 'free';
    const limit = plan === 'pro' ? PRO_DAILY_QUOTA : FREE_DAILY_QUOTA;
    const used = dailyQuotaCounter.get(getTodayKey(userId)) ?? 0;
    res.json({ used, limit, remaining: Math.max(0, limit - used) });
  });

  // Multi-Turn Gemini Chat Endpoint (ai.chats.create + conversation history + role systemInstruction)
  app.post('/api/chat', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const body = req.body as {
        userId?: string;
        plan?: 'free' | 'pro';
        threadId?: string;
        persona?: string;
        speedMode?: 'standard' | 'fast';
        question?: string;
        history?: Array<{ role: 'user' | 'model'; text: string }>;
        context?: {
          shopName?: string;
          category?: string;
          summary?: {
            totalBalance: number;
            periodSales: number;
            periodExpenses: number;
            periodNetProfit: number;
          };
          products?: Array<{ name: string; unit_cost: number; price: number; stock: number }>;
          faqs?: Array<{ question: string; answer: string }>;
        };
      };

      const tenantId = req.user?.uid || (body.userId || '').trim();
      const question = sanitizePromptText((body.question || '').trim());
      if (!tenantId || !question) {
        res.status(400).json({ error: 'Identitas toko dan pesan wajib diisi.' });
        return;
      }

      const plan = body.plan === 'pro' ? 'pro' : 'free';
      const limit = plan === 'pro' ? PRO_DAILY_QUOTA : FREE_DAILY_QUOTA;
      const quotaKey = getTodayKey(tenantId);
      const currentUsed = dailyQuotaCounter.get(quotaKey) ?? 0;

      if (currentUsed >= limit) {
        res.status(429).json({
          error: `Batas kuota harian (${limit} pesan AI) telah tercapai. Silakan coba lagi besok.`,
          quota: { used: currentUsed, limit, remaining: 0 },
        });
        return;
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        res.status(503).json({
          error:
            'Layanan AI Gemini belum memiliki GEMINI_API_KEY di server. Pastikan secret sudah diatur di Settings > Secrets.',
          code: 'MISSING_API_KEY',
          quota: { used: currentUsed, limit, remaining: Math.max(0, limit - currentUsed) },
        });
        return;
      }

      const { persona, model, roleDirective } = resolvePersonaAndModel(
        body.persona,
        body.speedMode
      );

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const shopName = body.context?.shopName || 'Toko UMKM';
      const productsList = (body.context?.products ?? [])
        .map((p) => {
          const marginPct = p.price > 0 ? (((p.price - p.unit_cost) / p.price) * 100).toFixed(1) : '0';
          return `- ${p.name}: harga jual Rp${p.price}, modal Rp${p.unit_cost}, margin bersih ${marginPct}%, stok ${p.stock} unit`;
        })
        .join('\n');
      const summary = body.context?.summary;

      const systemInstruction =
        `Kamu adalah asisten bisnis BizBuddy khusus untuk pemilik usaha "${shopName}" (${body.context?.category || 'UMKM'}). ` +
        `${roleDirective} ` +
        `Jawab dalam bahasa Indonesia yang profesional, lugas, terstruktur (maksimal 3-4 paragraf pendek atau poin jelas), dan selalu mengacu pada angka nyata toko di bawah ini. ` +
        `Pertahankan konteks percakapan sebelumnya agar jawaban lanjutan nyambung. ` +
        `Jika data tidak ada di konteks, sampaikan secara jujur.\n\n` +
        `Ringkasan Keuangan Hari Ini:\n` +
        `- Saldo berjalan: Rp${summary?.totalBalance ?? 0}\n` +
        `- Pemasukan hari ini: Rp${summary?.periodSales ?? 0}\n` +
        `- Pengeluaran hari ini: Rp${summary?.periodExpenses ?? 0}\n` +
        `- Laba bersih hari ini: Rp${summary?.periodNetProfit ?? 0}\n\n` +
        `Katalog Produk:\n${productsList || '(Belum ada produk)'}`;

      const formattedHistory: Content[] = (body.history ?? [])
        .filter((h) => h && typeof h.text === 'string' && h.text.trim().length > 0)
        .slice(-20)
        .map((h) => ({
          role: h.role === 'model' ? 'model' : 'user',
          parts: [{ text: sanitizePromptText(h.text.trim()) }],
        }));

      const chat = ai.chats.create({
        model,
        config: {
          systemInstruction,
        },
        history: formattedHistory,
      });

      const response = await chat.sendMessage({
        message: question,
      });

      const answer = (response.text || '').trim();
      if (!answer) {
        res.status(502).json({ error: 'Respons dari asisten AI kosong. Silakan coba ulang.' });
        return;
      }

      const nextUsed = currentUsed + 1;
      dailyQuotaCounter.set(quotaKey, nextUsed);

      let savedMessages = undefined;
      if (req.user?.uid) {
        const threadId = (body.threadId || 'default').trim() || 'default';
        savedMessages = await saveChatTurnForUser(req.user.uid, {
          threadId,
          persona,
          modelUsed: model,
          userMessage: question,
          modelReply: answer,
          source: 'ai',
        });
      }

      res.json({
        answer,
        persona,
        modelUsed: model,
        savedMessages,
        quota: { used: nextUsed, limit, remaining: Math.max(0, limit - nextUsed) },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Terjadi kesalahan saat memproses asisten AI.';
      res.status(500).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`BizBuddy server running at http://localhost:${PORT}`);
  });
}

startServer();
