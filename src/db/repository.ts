import crypto from 'node:crypto';
import { and, asc, desc, eq } from 'drizzle-orm';
import { createSeedDatabase } from '../lib/seedData.ts';
import type {
  ChatMessageItem,
  ChatModelChoice,
  ChatPersona,
  FaqItem,
  PlanTier,
  Product,
  Transaction,
  TransactionType,
  UserProfile,
} from '../lib/types.ts';
import { db } from './index.ts';
import { chatMessages, faqs, products, transactions, users } from './schema.ts';

function makeDbId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 10)}`;
}

export async function seedStarterDataForUserIfEmpty(uid: string) {
  try {
    const existingProducts = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.userUid, uid))
      .limit(1);

    const existingTx = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.userUid, uid))
      .limit(1);

    if (existingProducts.length > 0 || existingTx.length > 0) {
      return;
    }

    const seed = createSeedDatabase();
    const templateUserId = 'usr_kopi_senja';
    const seedProducts = seed.products.filter((p) => p.user_id === templateUserId);
    const seedTransactions = seed.transactions.filter((t) => t.user_id === templateUserId);
    const seedFaqs = seed.faqs.filter((f) => f.user_id === templateUserId);

    const productIdMap = new Map<string, string>();
    const newProducts = seedProducts.map((p) => {
      const nextId = makeDbId('prd');
      productIdMap.set(p.id, nextId);
      return {
        id: nextId,
        userUid: uid,
        name: p.name,
        unitCost: p.unit_cost,
        price: p.price,
        stock: p.stock,
      };
    });

    if (newProducts.length > 0) {
      await db.insert(products).values(newProducts);
    }

    const newTransactions = seedTransactions.map((t) => ({
      id: makeDbId('tx'),
      userUid: uid,
      productId: t.product_id ? productIdMap.get(t.product_id) ?? null : null,
      type: t.type,
      amount: t.amount,
      quantity: t.quantity,
      date: t.date,
      note: t.note,
      createdAt: new Date(t.created_at),
    }));

    if (newTransactions.length > 0) {
      await db.insert(transactions).values(newTransactions);
    }

    const newFaqs = seedFaqs.map((f) => ({
      id: makeDbId('faq'),
      userUid: uid,
      question: f.question,
      answer: f.answer,
    }));

    if (newFaqs.length > 0) {
      await db.insert(faqs).values(newFaqs);
    }
  } catch (error) {
    console.error('Database seed failed:', error);
    throw new Error('Gagal menyiapkan data awal toko di database.', { cause: error });
  }
}

export async function getStoreDataForUser(uid: string): Promise<{
  user: UserProfile | null;
  products: Product[];
  transactions: Transaction[];
  faqs: FaqItem[];
  chatMessages: ChatMessageItem[];
}> {
  try {
    const [userRows, productRows, txRows, faqRows, msgRows] = await Promise.all([
      db.select().from(users).where(eq(users.uid, uid)).limit(1),
      db.select().from(products).where(eq(products.userUid, uid)).orderBy(asc(products.createdAt)),
      db.select().from(transactions).where(eq(transactions.userUid, uid)).orderBy(desc(transactions.createdAt)),
      db.select().from(faqs).where(eq(faqs.userUid, uid)).orderBy(desc(faqs.createdAt)),
      db.select().from(chatMessages).where(eq(chatMessages.userUid, uid)).orderBy(asc(chatMessages.createdAt)),
    ]);

    const u = userRows[0];
    return {
      user: u
        ? {
            id: u.uid,
            email: u.email,
            name: u.name,
            shop_name: u.shopName,
            category: u.category,
            plan: u.plan === 'pro' ? 'pro' : 'free',
            created_at: u.createdAt.toISOString(),
          }
        : null,
      products: productRows.map((p) => ({
        id: p.id,
        user_id: p.userUid,
        name: p.name,
        unit_cost: p.unitCost,
        price: p.price,
        stock: p.stock,
        created_at: p.createdAt.toISOString(),
      })),
      transactions: txRows.map((t) => ({
        id: t.id,
        user_id: t.userUid,
        product_id: t.productId,
        type: t.type === 'expense' ? 'expense' : 'sale',
        amount: t.amount,
        quantity: t.quantity,
        date: t.date,
        created_at: t.createdAt.toISOString(),
        note: t.note,
      })),
      faqs: faqRows.map((f) => ({
        id: f.id,
        user_id: f.userUid,
        question: f.question,
        answer: f.answer,
        created_at: f.createdAt.toISOString(),
      })),
      chatMessages: msgRows.map((m) => ({
        id: m.id,
        user_id: m.userUid,
        thread_id: m.threadId,
        role: m.role === 'model' ? 'model' : 'user',
        content: m.content,
        persona: (m.persona === 'pricing' ? 'pricing' : 'advisor') as ChatPersona,
        model_used: (m.modelUsed === 'gemini-3.1-flash-lite'
          ? 'gemini-3.1-flash-lite'
          : 'gemini-4-hydrogen') as ChatModelChoice,
        source: (m.source === 'faq' || m.source === 'rule' ? m.source : 'ai'),
        resolved: m.resolved,
        created_at: m.createdAt.toISOString(),
      })),
    };
  } catch (error) {
    console.error('Database query failed in getStoreDataForUser:', error);
    throw new Error('Gagal memuat data toko dari database.', { cause: error });
  }
}

export async function updateUserProfile(
  uid: string,
  updates: { name?: string; shopName?: string; category?: string; plan?: PlanTier }
): Promise<UserProfile | null> {
  try {
    const patch: Partial<typeof users.$inferInsert> = {};
    if (updates.name !== undefined && updates.name.trim()) patch.name = updates.name.trim();
    if (updates.shopName !== undefined && updates.shopName.trim()) patch.shopName = updates.shopName.trim();
    if (updates.category !== undefined && updates.category.trim()) patch.category = updates.category.trim();
    if (updates.plan !== undefined) patch.plan = updates.plan === 'pro' ? 'pro' : 'free';

    const rows = await db
      .update(users)
      .set(patch)
      .where(eq(users.uid, uid))
      .returning();

    const u = rows[0];
    if (!u) return null;
    return {
      id: u.uid,
      email: u.email,
      name: u.name,
      shop_name: u.shopName,
      category: u.category,
      plan: u.plan === 'pro' ? 'pro' : 'free',
      created_at: u.createdAt.toISOString(),
    };
  } catch (error) {
    console.error('Database query failed in updateUserProfile:', error);
    throw new Error('Gagal memperbarui profil toko di database.', { cause: error });
  }
}

export async function upsertProductForUser(
  uid: string,
  payload: { id?: string; name: string; unit_cost: number; price: number; stock: number }
): Promise<Product> {
  try {
    const cleanName = payload.name.trim();
    const unitCost = Math.max(0, Math.round(payload.unit_cost));
    const price = Math.max(0, Math.round(payload.price));
    const stock = Math.max(0, Math.round(payload.stock));

    if (payload.id) {
      const updated = await db
        .update(products)
        .set({ name: cleanName, unitCost, price, stock })
        .where(and(eq(products.id, payload.id), eq(products.userUid, uid)))
        .returning();

      if (updated[0]) {
        const p = updated[0];
        return {
          id: p.id,
          user_id: p.userUid,
          name: p.name,
          unit_cost: p.unitCost,
          price: p.price,
          stock: p.stock,
          created_at: p.createdAt.toISOString(),
        };
      }
    }

    const newId = makeDbId('prd');
    const inserted = await db
      .insert(products)
      .values({
        id: newId,
        userUid: uid,
        name: cleanName,
        unitCost,
        price,
        stock,
      })
      .returning();

    const p = inserted[0];
    return {
      id: p.id,
      user_id: p.userUid,
      name: p.name,
      unit_cost: p.unitCost,
      price: p.price,
      stock: p.stock,
      created_at: p.createdAt.toISOString(),
    };
  } catch (error) {
    console.error('Database query failed in upsertProductForUser:', error);
    throw new Error('Gagal menyimpan produk ke database.', { cause: error });
  }
}

export async function deleteProductForUser(uid: string, productId: string): Promise<boolean> {
  try {
    const deleted = await db
      .delete(products)
      .where(and(eq(products.id, productId), eq(products.userUid, uid)))
      .returning({ id: products.id });
    return deleted.length > 0;
  } catch (error) {
    console.error('Database query failed in deleteProductForUser:', error);
    throw new Error('Gagal menghapus produk dari database.', { cause: error });
  }
}

export async function createTransactionForUser(
  uid: string,
  payload: {
    type: TransactionType;
    product_id: string | null;
    amount: number;
    quantity: number;
    date: string;
    note: string;
  }
): Promise<{ transaction: Transaction; updatedStock: number | null }> {
  try {
    return await db.transaction(async (txDb) => {
      const newId = makeDbId('tx');
      const qty = Math.max(1, Math.round(payload.quantity));
      const amt = Math.max(1, Math.round(payload.amount));

      const inserted = await txDb
        .insert(transactions)
        .values({
          id: newId,
          userUid: uid,
          productId: payload.product_id,
          type: payload.type,
          amount: amt,
          quantity: qty,
          date: payload.date,
          note: payload.note.trim(),
        })
        .returning();

      let updatedStock: number | null = null;
      if (payload.type === 'sale' && payload.product_id) {
        const prodRows = await txDb
          .select()
          .from(products)
          .where(and(eq(products.id, payload.product_id), eq(products.userUid, uid)))
          .limit(1);

        if (prodRows[0]) {
          updatedStock = Math.max(0, prodRows[0].stock - qty);
          await txDb
            .update(products)
            .set({ stock: updatedStock })
            .where(and(eq(products.id, payload.product_id), eq(products.userUid, uid)));
        }
      }

      const t = inserted[0];
      return {
        transaction: {
          id: t.id,
          user_id: t.userUid,
          product_id: t.productId,
          type: t.type === 'expense' ? 'expense' : 'sale',
          amount: t.amount,
          quantity: t.quantity,
          date: t.date,
          created_at: t.createdAt.toISOString(),
          note: t.note,
        },
        updatedStock,
      };
    });
  } catch (error) {
    console.error('Database query failed in createTransactionForUser:', error);
    throw new Error('Gagal mencatat transaksi ke database.', { cause: error });
  }
}

export async function deleteTransactionForUser(uid: string, txId: string): Promise<boolean> {
  try {
    return await db.transaction(async (txDb) => {
      const existing = await txDb
        .select()
        .from(transactions)
        .where(and(eq(transactions.id, txId), eq(transactions.userUid, uid)))
        .limit(1);

      const target = existing[0];
      if (!target) return false;

      if (target.type === 'sale' && target.productId) {
        const prodRows = await txDb
          .select()
          .from(products)
          .where(and(eq(products.id, target.productId), eq(products.userUid, uid)))
          .limit(1);

        if (prodRows[0]) {
          await txDb
            .update(products)
            .set({ stock: prodRows[0].stock + target.quantity })
            .where(and(eq(products.id, target.productId), eq(products.userUid, uid)));
        }
      }

      await txDb
        .delete(transactions)
        .where(and(eq(transactions.id, txId), eq(transactions.userUid, uid)));
      return true;
    });
  } catch (error) {
    console.error('Database query failed in deleteTransactionForUser:', error);
    throw new Error('Gagal menghapus transaksi dari database.', { cause: error });
  }
}

export async function createFaqForUser(
  uid: string,
  question: string,
  answer: string
): Promise<FaqItem> {
  try {
    const inserted = await db
      .insert(faqs)
      .values({
        id: makeDbId('faq'),
        userUid: uid,
        question: question.trim(),
        answer: answer.trim(),
      })
      .returning();

    const f = inserted[0];
    return {
      id: f.id,
      user_id: f.userUid,
      question: f.question,
      answer: f.answer,
      created_at: f.createdAt.toISOString(),
    };
  } catch (error) {
    console.error('Database query failed in createFaqForUser:', error);
    throw new Error('Gagal menyimpan FAQ ke database.', { cause: error });
  }
}

export async function deleteFaqForUser(uid: string, faqId: string): Promise<boolean> {
  try {
    const deleted = await db
      .delete(faqs)
      .where(and(eq(faqs.id, faqId), eq(faqs.userUid, uid)))
      .returning({ id: faqs.id });
    return deleted.length > 0;
  } catch (error) {
    console.error('Database query failed in deleteFaqForUser:', error);
    throw new Error('Gagal menghapus FAQ dari database.', { cause: error });
  }
}

export async function saveChatTurnForUser(
  uid: string,
  params: {
    threadId: string;
    persona: ChatPersona;
    modelUsed: ChatModelChoice;
    userMessage: string;
    modelReply: string;
    source: 'ai' | 'faq' | 'rule';
  }
): Promise<ChatMessageItem[]> {
  try {
    const now = new Date();
    const replyTime = new Date(now.getTime() + 1);
    const rows = await db
      .insert(chatMessages)
      .values([
        {
          id: makeDbId('msg'),
          userUid: uid,
          threadId: params.threadId,
          role: 'user',
          content: params.userMessage,
          persona: params.persona,
          modelUsed: params.modelUsed,
          source: params.source,
          resolved: true,
          createdAt: now,
        },
        {
          id: makeDbId('msg'),
          userUid: uid,
          threadId: params.threadId,
          role: 'model',
          content: params.modelReply,
          persona: params.persona,
          modelUsed: params.modelUsed,
          source: params.source,
          resolved: true,
          createdAt: replyTime,
        },
      ])
      .returning();

    return rows.map((m) => ({
      id: m.id,
      user_id: m.userUid,
      thread_id: m.threadId,
      role: m.role === 'model' ? 'model' : 'user',
      content: m.content,
      persona: params.persona,
      model_used: params.modelUsed,
      source: params.source,
      resolved: m.resolved,
      created_at: m.createdAt.toISOString(),
    }));
  } catch (error) {
    console.error('Database query failed in saveChatTurnForUser:', error);
    throw new Error('Gagal menyimpan riwayat chat ke database.', { cause: error });
  }
}

export async function clearChatThreadForUser(uid: string, threadId: string): Promise<void> {
  try {
    await db
      .delete(chatMessages)
      .where(and(eq(chatMessages.userUid, uid), eq(chatMessages.threadId, threadId)));
  } catch (error) {
    console.error('Database query failed in clearChatThreadForUser:', error);
    throw new Error('Gagal membersihkan riwayat percakapan.', { cause: error });
  }
}

export async function toggleChatMessageResolved(uid: string, messageId: string): Promise<boolean> {
  try {
    const rows = await db
      .select()
      .from(chatMessages)
      .where(and(eq(chatMessages.id, messageId), eq(chatMessages.userUid, uid)))
      .limit(1);
    if (!rows[0]) return false;
    await db
      .update(chatMessages)
      .set({ resolved: !rows[0].resolved })
      .where(and(eq(chatMessages.id, messageId), eq(chatMessages.userUid, uid)));
    return true;
  } catch (error) {
    console.error('Database query failed in toggleChatMessageResolved:', error);
    throw new Error('Gagal memperbarui status pesan.', { cause: error });
  }
}

export async function resetUserDataToStarter(uid: string): Promise<void> {
  try {
    await db.transaction(async (txDb) => {
      await txDb.delete(chatMessages).where(eq(chatMessages.userUid, uid));
      await txDb.delete(faqs).where(eq(faqs.userUid, uid));
      await txDb.delete(transactions).where(eq(transactions.userUid, uid));
      await txDb.delete(products).where(eq(products.userUid, uid));
    });
    await seedStarterDataForUserIfEmpty(uid);
  } catch (error) {
    console.error('Database query failed in resetUserDataToStarter:', error);
    throw new Error('Gagal mereset data toko di database.', { cause: error });
  }
}
