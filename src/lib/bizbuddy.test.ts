import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBreakEvenPoint,
  calculateProductNetMargin,
  calculateSuggestedPrice,
} from './pricing';
import {
  computeDailySeries,
  computeRevenueTrendSummary,
  computeTopProducts,
  computeTrackerSummary,
  computeWeeklyComparison,
  filterByUser,
  formatRupiah,
  transactionsToCsv,
} from './analytics';
import { matchRuleBasedFaqOrMetric, sanitizeForAI } from './chatbotRules';
import { createSeedDatabase } from './seedData';

test('calculateSuggestedPrice follows exact CONTEXT.md formula and rounds psychological price', () => {
  // unitCost = 9500, targetMargin = 45% (0.45), extraFee = 5% (0.05) -> denominator = 0.5
  // exactPrice = 9500 / 0.5 = 19000
  const res = calculateSuggestedPrice({
    unitCost: 9500,
    targetMarginPct: 45,
    extraFeePct: 5,
  });
  assert.equal(res.valid, true);
  assert.equal(res.exactPrice, 19000);
  assert.equal(res.recommendedPrice, 19000);
  assert.equal(res.denominator, 0.5);
});

test('calculateSuggestedPrice rejects margin + extraFee >= 100%', () => {
  const res = calculateSuggestedPrice({
    unitCost: 10000,
    targetMarginPct: 80,
    extraFeePct: 20,
  });
  assert.equal(res.valid, false);
  assert.ok(res.error);
});

test('calculateProductNetMargin calculates net profit and margin percentage from cost and selling price', () => {
  // Kopi Susu Gula Aren: cost 9500, price 22000 -> profit 12500, margin = 56.8%
  const healthy = calculateProductNetMargin(9500, 22000);
  assert.equal(healthy.valid, true);
  assert.equal(healthy.profitPerUnit, 12500);
  assert.equal(healthy.netMarginPct, 56.8);

  // With 5% extra fee: 22000 - 9500 - 1100 = 11400 -> 51.8%
  const withFee = calculateProductNetMargin(9500, 22000, 5);
  assert.equal(withFee.valid, true);
  assert.equal(withFee.profitPerUnit, 11400);
  assert.equal(withFee.netMarginPct, 51.8);

  // Loss scenario: cost 15000, price 12000 -> profit -3000, margin = -25%
  const loss = calculateProductNetMargin(15000, 12000);
  assert.equal(loss.valid, true);
  assert.equal(loss.profitPerUnit, -3000);
  assert.equal(loss.netMarginPct, -25);

  // Invalid zero selling price
  const invalid = calculateProductNetMargin(10000, 0);
  assert.equal(invalid.valid, false);
  assert.equal(invalid.netMarginPct, 0);
});

test('calculateBreakEvenPoint computes profitPerUnit and BEP units accurately', () => {
  // sellingPrice = 22000, unitCost = 9500, extraFeePct = 5% (1100) -> profitPerUnit = 11400
  // fixedCost = 2280000 -> BEP = ceil(2280000 / 11400) = 200 units
  const res = calculateBreakEvenPoint({
    fixedCost: 2280000,
    sellingPrice: 22000,
    unitCost: 9500,
    extraFeePct: 5,
  });
  assert.equal(res.valid, true);
  assert.equal(res.profitPerUnit, 11400);
  assert.equal(res.bepUnits, 200);
  assert.equal(res.bepRevenue, 4400000);
});

test('calculateBreakEvenPoint flags non-positive profit per unit', () => {
  const res = calculateBreakEvenPoint({
    fixedCost: 1000000,
    sellingPrice: 10000,
    unitCost: 9500,
    extraFeePct: 10,
  });
  assert.equal(res.valid, false);
  assert.equal(res.profitPerUnit, -500);
});

test('filterByUser enforces strict tenant isolation across tables', () => {
  const db = createSeedDatabase('2026-11-18');
  const kopiProducts = filterByUser(db.products, 'usr_kopi_senja');
  const bakmiProducts = filterByUser(db.products, 'usr_bakmi_berkah');

  assert.equal(kopiProducts.length, 5);
  assert.equal(bakmiProducts.length, 3);
  assert.ok(kopiProducts.every((p) => p.user_id === 'usr_kopi_senja'));
  assert.ok(bakmiProducts.every((p) => p.user_id === 'usr_bakmi_berkah'));
});

test('Tracker and Dashboard aggregations compute sales, expenses, series, and top products', () => {
  const db = createSeedDatabase('2026-11-18');
  const txs = filterByUser(db.transactions, 'usr_kopi_senja');
  const products = filterByUser(db.products, 'usr_kopi_senja');

  const todaySummary = computeTrackerSummary(txs, '2026-11-18');
  assert.equal(todaySummary.periodSales, 66000 + 48000);
  assert.equal(todaySummary.periodExpenses, 85000);
  assert.equal(todaySummary.periodNetProfit, 29000);

  const series = computeDailySeries(txs, '2026-11-18', 7);
  assert.equal(series.length, 7);
  assert.equal(series[6].date, '2026-11-18');
  assert.equal(series[6].sales, 114000);

  const weekly = computeWeeklyComparison(txs, '2026-11-18');
  assert.ok(weekly.currentRevenue > 0);
  assert.ok(weekly.previousRevenue > 0);

  const top = computeTopProducts(txs, products);
  assert.equal(top[0].name, 'Kopi Susu Gula Aren');
  assert.ok(top[0].unitsSold > 0);

  const series30 = computeDailySeries(txs, '2026-11-18', 30);
  assert.equal(series30.length, 30);
  assert.equal(series30[0].date, '2026-10-20');
  assert.equal(series30[0].dateLabel, '20 Okt');
  assert.equal(series30[29].date, '2026-11-18');
  assert.equal(series30[29].dateLabel, '18 Nov');

  const trend = computeRevenueTrendSummary(series30);
  assert.ok(trend.totalRevenue > 1_000_000);
  assert.ok(trend.avgDailyRevenue > 0);
  assert.ok(trend.peakDay && trend.peakDay.sales >= 264000);
});

test('sanitizeForAI masks phone numbers and email addresses', () => {
  const raw = 'Pelanggan Budi 081234567890 atau +6281199887766 email budi@toko.id pesan kopi';
  const cleaned = sanitizeForAI(raw);
  assert.equal(cleaned.includes('081234567890'), false);
  assert.equal(cleaned.includes('+6281199887766'), false);
  assert.equal(cleaned.includes('budi@toko.id'), false);
  assert.ok(cleaned.includes('[KONTAK_DISAMARKAN]'));
  assert.ok(cleaned.includes('[EMAIL_DISAMARKAN]'));
});

test('matchRuleBasedFaqOrMetric resolves tenant FAQ and metric queries deterministically', () => {
  const db = createSeedDatabase('2026-11-18');
  const products = filterByUser(db.products, 'usr_kopi_senja');
  const transactions = filterByUser(db.transactions, 'usr_kopi_senja');
  const faqs = filterByUser(db.faqs, 'usr_kopi_senja');

  const faqMatch = matchRuleBasedFaqOrMetric('Jam buka Kopi Senja kapan saja?', {
    shopName: 'Kopi Senja Kemang',
    products,
    transactions,
    faqs,
    todayDate: '2026-11-18',
  });
  assert.ok(faqMatch?.matched);
  assert.equal(faqMatch?.source, 'faq');
  assert.ok(faqMatch?.answer.includes('07.30'));

  const metricMatch = matchRuleBasedFaqOrMetric('Produk mana yang paling laris?', {
    shopName: 'Kopi Senja Kemang',
    products,
    transactions,
    faqs,
    todayDate: '2026-11-18',
  });
  assert.ok(metricMatch?.matched);
  assert.equal(metricMatch?.source, 'rule');
  assert.ok(metricMatch?.answer.includes('Kopi Susu Gula Aren'));
});

test('formatRupiah and transactionsToCsv format Indonesian currency and CSV cleanly', () => {
  assert.equal(formatRupiah(22000), 'Rp 22.000');
  assert.equal(formatRupiah(-5000), '-Rp 5.000');

  const db = createSeedDatabase('2026-11-18');
  const csv = transactionsToCsv(
    filterByUser(db.transactions, 'usr_bakmi_berkah'),
    filterByUser(db.products, 'usr_bakmi_berkah')
  );
  assert.ok(csv.startsWith('Tanggal,Tipe,Produk,Jumlah,Nominal (IDR),Catatan'));
  assert.ok(csv.includes('Bakmi Ayam Jamur Komplit'));
});
