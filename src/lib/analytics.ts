import type { Product, Transaction } from './types';

/**
 * Strict Tenant Isolation helper mirroring Supabase RLS (.eq('user_id', user.id))
 */
export function filterByUser<T extends { user_id: string }>(rows: readonly T[], userId: string): T[] {
  return rows.filter((row) => row.user_id === userId);
}

export interface TrackerSummary {
  totalBalance: number;
  totalSales: number;
  totalExpenses: number;
  periodSales: number;
  periodExpenses: number;
  periodNetProfit: number;
  periodCount: number;
}

export function computeTrackerSummary(
  transactions: readonly Transaction[],
  targetDate?: string
): TrackerSummary {
  let totalSales = 0;
  let totalExpenses = 0;
  let periodSales = 0;
  let periodExpenses = 0;
  let periodCount = 0;

  for (const tx of transactions) {
    if (tx.type === 'sale') {
      totalSales += tx.amount;
      if (!targetDate || tx.date === targetDate) {
        periodSales += tx.amount;
        periodCount += 1;
      }
    } else {
      totalExpenses += tx.amount;
      if (!targetDate || tx.date === targetDate) {
        periodExpenses += tx.amount;
        periodCount += 1;
      }
    }
  }

  return {
    totalBalance: totalSales - totalExpenses,
    totalSales,
    totalExpenses,
    periodSales,
    periodExpenses,
    periodNetProfit: periodSales - periodExpenses,
    periodCount,
  };
}

export interface DailySeriesPoint {
  date: string;
  label: string;
  dateLabel: string;
  sales: number;
  expenses: number;
  profit: number;
}

function shiftIsoDate(baseDate: string, deltaDays: number): string {
  const [y, m, d] = baseDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return dt.toISOString().slice(0, 10);
}

const SHORT_DAY_NAMES = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const SHORT_MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

function formatShortDayLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${SHORT_DAY_NAMES[dt.getUTCDay()]} ${d}`;
}

function formatCalendarDateLabel(isoDate: string): string {
  const [, m, d] = isoDate.split('-').map(Number);
  return `${d} ${SHORT_MONTH_NAMES[(m - 1) % 12]}`;
}

export function computeDailySeries(
  transactions: readonly Transaction[],
  endDate: string,
  days = 7
): DailySeriesPoint[] {
  const buckets = new Map<string, { sales: number; expenses: number }>();

  for (let i = days - 1; i >= 0; i -= 1) {
    const dateKey = shiftIsoDate(endDate, -i);
    buckets.set(dateKey, { sales: 0, expenses: 0 });
  }

  for (const tx of transactions) {
    const bucket = buckets.get(tx.date);
    if (!bucket) continue;
    if (tx.type === 'sale') {
      bucket.sales += tx.amount;
    } else {
      bucket.expenses += tx.amount;
    }
  }

  return Array.from(buckets.entries()).map(([date, val]) => ({
    date,
    label: formatShortDayLabel(date),
    dateLabel: formatCalendarDateLabel(date),
    sales: val.sales,
    expenses: val.expenses,
    profit: val.sales - val.expenses,
  }));
}

export interface RevenueTrendSummary {
  totalRevenue: number;
  avgDailyRevenue: number;
  peakDay: DailySeriesPoint | null;
}

export function computeRevenueTrendSummary(
  series: readonly DailySeriesPoint[]
): RevenueTrendSummary {
  if (series.length === 0) {
    return { totalRevenue: 0, avgDailyRevenue: 0, peakDay: null };
  }

  let totalRevenue = 0;
  let peakDay: DailySeriesPoint = series[0];

  for (const point of series) {
    totalRevenue += point.sales;
    if (point.sales >= peakDay.sales) {
      peakDay = point;
    }
  }

  return {
    totalRevenue,
    avgDailyRevenue: Math.round(totalRevenue / series.length),
    peakDay,
  };
}

export interface WeeklyComparison {
  currentRevenue: number;
  previousRevenue: number;
  currentExpenses: number;
  previousExpenses: number;
  currentProfit: number;
  previousProfit: number;
  profitDeltaPct: number | null;
  revenueDeltaPct: number | null;
}

export function computeWeeklyComparison(
  transactions: readonly Transaction[],
  endDate: string
): WeeklyComparison {
  const currentStart = shiftIsoDate(endDate, -6);
  const prevStart = shiftIsoDate(endDate, -13);
  const prevEnd = shiftIsoDate(endDate, -7);

  let currentRevenue = 0;
  let currentExpenses = 0;
  let previousRevenue = 0;
  let previousExpenses = 0;

  for (const tx of transactions) {
    if (tx.date >= currentStart && tx.date <= endDate) {
      if (tx.type === 'sale') currentRevenue += tx.amount;
      else currentExpenses += tx.amount;
    } else if (tx.date >= prevStart && tx.date <= prevEnd) {
      if (tx.type === 'sale') previousRevenue += tx.amount;
      else previousExpenses += tx.amount;
    }
  }

  const currentProfit = currentRevenue - currentExpenses;
  const previousProfit = previousRevenue - previousExpenses;

  const profitDeltaPct =
    previousProfit === 0
      ? null
      : Number((((currentProfit - previousProfit) / Math.abs(previousProfit)) * 100).toFixed(1));

  const revenueDeltaPct =
    previousRevenue === 0
      ? null
      : Number((((currentRevenue - previousRevenue) / previousRevenue) * 100).toFixed(1));

  return {
    currentRevenue,
    previousRevenue,
    currentExpenses,
    previousExpenses,
    currentProfit,
    previousProfit,
    profitDeltaPct,
    revenueDeltaPct,
  };
}

export interface TopProductStat {
  productId: string;
  name: string;
  unitsSold: number;
  revenue: number;
  estimatedProfit: number;
  currentStock: number;
  currentPrice: number;
  unitCost: number;
}

export function computeTopProducts(
  transactions: readonly Transaction[],
  products: readonly Product[]
): TopProductStat[] {
  const productMap = new Map<string, Product>();
  for (const p of products) {
    productMap.set(p.id, p);
  }

  const stats = new Map<string, { unitsSold: number; revenue: number; estimatedProfit: number }>();

  for (const tx of transactions) {
    if (tx.type !== 'sale' || !tx.product_id) continue;
    const product = productMap.get(tx.product_id);
    if (!product) continue;

    const existing = stats.get(product.id) ?? {
      unitsSold: 0,
      revenue: 0,
      estimatedProfit: 0,
    };

    const qty = Math.max(1, tx.quantity || 1);
    const cogs = product.unit_cost * qty;
    existing.unitsSold += qty;
    existing.revenue += tx.amount;
    existing.estimatedProfit += tx.amount - cogs;
    stats.set(product.id, existing);
  }

  const result: TopProductStat[] = products.map((product) => {
    const s = stats.get(product.id) ?? { unitsSold: 0, revenue: 0, estimatedProfit: 0 };
    return {
      productId: product.id,
      name: product.name,
      unitsSold: s.unitsSold,
      revenue: s.revenue,
      estimatedProfit: s.estimatedProfit,
      currentStock: product.stock,
      currentPrice: product.price,
      unitCost: product.unit_cost,
    };
  });

  return result.sort((a, b) => b.revenue - a.revenue || b.unitsSold - a.unitsSold);
}

export function formatRupiah(amount: number): string {
  const abs = Math.abs(Math.round(amount));
  const formatted = new Intl.NumberFormat('id-ID').format(abs);
  return amount < 0 ? `-Rp ${formatted}` : `Rp ${formatted}`;
}

export function formatCompactRupiah(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) {
    return `${sign}Rp ${(abs / 1_000_000).toFixed(1).replace(/\.0$/, '')}jt`;
  }
  if (abs >= 1_000) {
    return `${sign}Rp ${Math.round(abs / 1_000)}rb`;
  }
  return `${sign}Rp ${Math.round(abs)}`;
}

export function transactionsToCsv(
  transactions: readonly Transaction[],
  products: readonly Product[]
): string {
  const productNames = new Map<string, string>(products.map((p) => [p.id, p.name]));
  const header = ['Tanggal', 'Tipe', 'Produk', 'Jumlah', 'Nominal (IDR)', 'Catatan'];

  const escapeCell = (val: string | number): string => {
    const str = String(val).replace(/"/g, '""');
    return /[",\n]/.test(str) ? `"${str}"` : str;
  };

  const rows = transactions.map((tx) => [
    tx.date,
    tx.type === 'sale' ? 'Pemasukan' : 'Pengeluaran',
    tx.product_id ? (productNames.get(tx.product_id) ?? '-') : '-',
    tx.quantity,
    tx.amount,
    tx.note,
  ]);

  return [header, ...rows].map((row) => row.map(escapeCell).join(',')).join('\n');
}
