import { computeTopProducts, computeTrackerSummary, formatRupiah } from './analytics';
import type { FaqItem, Product, Transaction } from './types';

/**
 * Strips customer phone numbers, emails, and sensitive PII tokens
 * before sending any context or prompt to an external LLM API (CONTEXT.md Section 4A).
 */
export function sanitizeForAI(input: string): string {
  return input
    .replace(/(\+62|62|0)8[1-9][0-9\-\s]{6,13}/g, '[KONTAK_DISAMARKAN]')
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL_DISAMARKAN]')
    .replace(/\b\d{12,16}\b/g, '[NOMOR_DISAMARKAN]');
}

export interface RuleMatchResult {
  matched: boolean;
  source: 'faq' | 'rule';
  answer: string;
}

const STOPWORDS = new Set([
  'yang', 'dan', 'di', 'ke', 'dari', 'untuk', 'pada', 'apa', 'berapa', 'bagaimana',
  'mana', 'kapan', 'apakah', 'ada', 'ini', 'itu', 'saya', 'kami', 'toko', 'saja',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

/**
 * Rule-Based First lookup (CONTEXT.md Section 5):
 * Checks tenant FAQs and deterministic store metrics before invoking AI.
 */
export function matchRuleBasedFaqOrMetric(
  question: string,
  context: {
    shopName: string;
    products: readonly Product[];
    transactions: readonly Transaction[];
    faqs: readonly FaqItem[];
    todayDate: string;
  }
): RuleMatchResult | null {
  const qLower = question.toLowerCase().trim();
  const qTokens = tokenize(qLower);

  // 1. Check store FAQ knowledge base first
  let bestFaq: { item: FaqItem; score: number } | null = null;
  for (const faq of context.faqs) {
    const faqTokens = tokenize(`${faq.question} ${faq.answer}`);
    if (faqTokens.length === 0) continue;
    let overlap = 0;
    for (const token of qTokens) {
      if (faqTokens.some((ft) => ft.includes(token) || token.includes(ft))) {
        overlap += 1;
      }
    }
    const score = overlap / Math.max(1, Math.min(qTokens.length, faqTokens.length));
    if (overlap >= 2 && score >= 0.5 && (!bestFaq || score > bestFaq.score)) {
      bestFaq = { item: faq, score };
    }
  }

  if (bestFaq) {
    return {
      matched: true,
      source: 'faq',
      answer: `${bestFaq.item.answer}\n\n(Sumber: Basis Pengetahuan FAQ ${context.shopName})`,
    };
  }

  // 2. Deterministic business metric rules
  if (/(laba|profit|untung|pemasukan|omzet).*(hari ini|saldo|sekarang)/.test(qLower) || qLower.includes('ringkasan keuangan')) {
    const summary = computeTrackerSummary(context.transactions, context.todayDate);
    return {
      matched: true,
      source: 'rule',
      answer:
        `Ringkasan keuangan ${context.shopName} per ${context.todayDate}:\n` +
        `• Pemasukan hari ini: ${formatRupiah(summary.periodSales)}\n` +
        `• Pengeluaran hari ini: ${formatRupiah(summary.periodExpenses)}\n` +
        `• Laba bersih hari ini: ${formatRupiah(summary.periodNetProfit)}\n` +
        `• Total saldo berjalan: ${formatRupiah(summary.totalBalance)}`,
    };
  }

  if (/(produk|menu|barang).*(laris|terlaris|menguntungkan|top)/.test(qLower)) {
    const top = computeTopProducts(context.transactions, context.products).filter((p) => p.unitsSold > 0);
    if (top.length === 0) {
      return {
        matched: true,
        source: 'rule',
        answer: `Belum ada transaksi penjualan produk yang tercatat untuk ${context.shopName}. Catat transaksi di tab Tracker untuk melihat peringkat produk terlaris.`,
      };
    }
    const lines = top.slice(0, 3).map(
      (p, idx) =>
        `${idx + 1}. ${p.name}: ${p.unitsSold} terjual · Omzet ${formatRupiah(p.revenue)} · Est. laba ${formatRupiah(p.estimatedProfit)}`
    );
    return {
      matched: true,
      source: 'rule',
      answer: `Produk terlaris di ${context.shopName}:\n${lines.join('\n')}`,
    };
  }

  if (/(stok|stock).*(menipis|habis|rendah|cek)/.test(qLower)) {
    const lowStock = context.products.filter((p) => p.stock <= 8);
    if (lowStock.length === 0) {
      return {
        matched: true,
        source: 'rule',
        answer: `Semua ${context.products.length} produk di katalog ${context.shopName} memiliki stok aman (> 8 unit).`,
      };
    }
    const list = lowStock.map((p) => `• ${p.name}: sisa ${p.stock} unit`).join('\n');
    return {
      matched: true,
      source: 'rule',
      answer: `Produk dengan stok perlu diperhatikan di ${context.shopName}:\n${list}`,
    };
  }

  return null;
}
