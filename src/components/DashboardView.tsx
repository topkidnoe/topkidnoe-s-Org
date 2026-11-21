import React, { useMemo, useState } from 'react';
import { Download, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  computeDailySeries,
  computeRevenueTrendSummary,
  computeTopProducts,
  computeWeeklyComparison,
  formatCompactRupiah,
  formatRupiah,
  transactionsToCsv,
  type DailySeriesPoint,
} from '../lib/analytics';
import { getTodayIsoDate } from '../lib/seedData';
import type { PlanTier, Product, Transaction } from '../lib/types';

interface DashboardViewProps {
  shopName: string;
  plan: PlanTier;
  transactions: Transaction[];
  products: Product[];
  onUpgradePlan: () => void;
}

interface RevenueTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: DailySeriesPoint }>;
}

function RevenueTrendTooltip({ active, payload }: RevenueTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;

  return (
    <div className="bg-[#1E1B2E] border border-[#342E4C] rounded-xl shadow-lg px-3.5 py-2.5 text-xs space-y-1">
      <p className="font-semibold text-[#F4F1FA]">
        {point.label} · {point.dateLabel}
      </p>
      <div className="flex items-center justify-between gap-4">
        <span className="text-[#A39BBF]">Pendapatan</span>
        <span className="font-mono tabular-nums font-bold text-orange-300">
          {formatRupiah(point.sales)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-[#A39BBF]">Pengeluaran</span>
        <span className="font-mono tabular-nums font-semibold text-rose-400">
          {formatRupiah(point.expenses)}
        </span>
      </div>
    </div>
  );
}

export function DashboardView({
  shopName,
  plan,
  transactions,
  products,
  onUpgradePlan,
}: DashboardViewProps) {
  const todayDate = getTodayIsoDate();
  const [selectedDayIdx, setSelectedDayIdx] = useState<number>(6);

  const dailySeries = useMemo(
    () => computeDailySeries(transactions, todayDate, 7),
    [transactions, todayDate]
  );

  const revenueSeries30d = useMemo(
    () => computeDailySeries(transactions, todayDate, 30),
    [transactions, todayDate]
  );

  const trendSummary30d = useMemo(
    () => computeRevenueTrendSummary(revenueSeries30d),
    [revenueSeries30d]
  );

  const weekly = useMemo(
    () => computeWeeklyComparison(transactions, todayDate),
    [transactions, todayDate]
  );

  const topProducts = useMemo(
    () => computeTopProducts(transactions, products),
    [transactions, products]
  );

  const inventoryValue = useMemo(
    () => products.reduce((sum, p) => sum + p.unit_cost * p.stock, 0),
    [products]
  );

  const maxChartVal = useMemo(() => {
    const peak = dailySeries.reduce(
      (max, pt) => Math.max(max, pt.sales, pt.expenses),
      0
    );
    return Math.max(peak, 50000);
  }, [dailySeries]);

  const activeDay = dailySeries[selectedDayIdx] ?? dailySeries[dailySeries.length - 1];

  const handleExportCsv = () => {
    const csv = transactionsToCsv(transactions, products);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${shopName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-transaksi.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-[#F4F1FA]">
            Dashboard Analitik &amp; Laba Mingguan
          </h2>
          <p className="text-sm text-[#A39BBF] mt-0.5">
            Agregasi langsung dari catatan Tracker dan katalog produk {shopName}.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {plan === 'free' && (
            <button
              type="button"
              onClick={onUpgradePlan}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-xl border border-violet-400/50 bg-violet-500/15 text-violet-200 text-xs font-semibold hover:bg-violet-500/25 whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5 text-orange-300" />
              Aktifkan Pro
            </button>
          )}
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[44px] rounded-xl border border-[#2B2640] bg-[#171522] text-[#E4DFF2] text-xs font-semibold hover:bg-[#231F36] whitespace-nowrap"
          >
            <Download className="w-4 h-4 text-orange-400" />
            Unduh CSV
          </button>
        </div>
      </div>

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-[#171522] rounded-2xl border border-[#2B2640] p-5">
          <p className="text-xs font-medium text-[#A39BBF]">Omzet 7 Hari Terakhir</p>
          <p className="font-mono tabular-nums text-2xl font-bold text-[#F4F1FA] mt-1">
            {formatRupiah(weekly.currentRevenue)}
          </p>
          <p className="text-xs text-[#A39BBF] mt-1.5 flex items-center gap-1">
            {weekly.revenueDeltaPct !== null ? (
              <>
                {weekly.revenueDeltaPct >= 0 ? (
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
                )}
                <span
                  className={`font-mono tabular-nums font-semibold ${
                    weekly.revenueDeltaPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {weekly.revenueDeltaPct >= 0 ? '+' : ''}
                  {weekly.revenueDeltaPct}%
                </span>
                <span>vs minggu lalu</span>
              </>
            ) : (
              <span>Periode berjalan</span>
            )}
          </p>
        </div>

        <div className="bg-[#171522] rounded-2xl border border-[#2B2640] p-5">
          <p className="text-xs font-medium text-[#A39BBF]">Pengeluaran 7 Hari</p>
          <p className="font-mono tabular-nums text-2xl font-bold text-rose-400 mt-1">
            {formatRupiah(weekly.currentExpenses)}
          </p>
          <p className="text-xs text-[#A39BBF] mt-1.5 font-mono tabular-nums">
            Minggu lalu: {formatRupiah(weekly.previousExpenses)}
          </p>
        </div>

        <div className="bg-[#171522] rounded-2xl border border-[#2B2640] p-5">
          <p className="text-xs font-medium text-[#A39BBF]">Laba Bersih Mingguan</p>
          <p
            className={`font-mono tabular-nums text-2xl font-bold mt-1 ${
              weekly.currentProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {formatRupiah(weekly.currentProfit)}
          </p>
          <p className="text-xs text-[#A39BBF] mt-1.5 font-mono tabular-nums">
            Minggu lalu: {formatRupiah(weekly.previousProfit)}
          </p>
        </div>

        <div className="bg-[#171522] rounded-2xl border border-[#2B2640] p-5">
          <p className="text-xs font-medium text-[#A39BBF]">Modal Stok Tersedia</p>
          <p className="font-mono tabular-nums text-2xl font-bold text-orange-300 mt-1">
            {formatRupiah(inventoryValue)}
          </p>
          <p className="text-xs text-[#A39BBF] mt-1.5">
            {products.length} produk aktif di katalog
          </p>
        </div>
      </div>

      {/* 30-Day Daily Revenue Trend Line Chart (Recharts) */}
      <section
        aria-label="Tren pendapatan harian 30 hari terakhir"
        data-testid="revenue-trend-30d"
        className="bg-[#171522] rounded-2xl border border-[#2B2640] p-5 sm:p-6"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#252136]">
          <div>
            <h3 className="font-display text-base font-bold text-[#F4F1FA]">
              Tren Pendapatan Harian (30 Hari Terakhir)
            </h3>
            <p className="text-xs text-[#A39BBF] mt-0.5">
              Pergerakan omzet harian dari seluruh transaksi pemasukan {shopName}.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4 sm:gap-6 text-xs">
            <div>
              <span className="text-[#A39BBF] block">Total 30 Hari</span>
              <span className="font-mono tabular-nums font-bold text-[#F4F1FA] text-sm">
                {formatRupiah(trendSummary30d.totalRevenue)}
              </span>
            </div>
            <div>
              <span className="text-[#A39BBF] block">Rata-rata / Hari</span>
              <span className="font-mono tabular-nums font-bold text-orange-300 text-sm">
                {formatRupiah(trendSummary30d.avgDailyRevenue)}
              </span>
            </div>
            <div>
              <span className="text-[#A39BBF] block">
                Puncak ({trendSummary30d.peakDay?.dateLabel ?? '-'})
              </span>
              <span className="font-mono tabular-nums font-bold text-violet-300 text-sm">
                {formatRupiah(trendSummary30d.peakDay?.sales ?? 0)}
              </span>
            </div>
          </div>
        </div>

        <div className="pt-5 h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={revenueSeries30d}
              margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#2B2640" />
              <XAxis
                dataKey="dateLabel"
                interval={4}
                tickLine={false}
                axisLine={{ stroke: '#2B2640' }}
                tick={{ fontSize: 11, fill: '#A39BBF', fontFamily: 'JetBrains Mono, monospace' }}
              />
              <YAxis
                width={76}
                tickFormatter={(val: number) => formatCompactRupiah(val)}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: '#A39BBF', fontFamily: 'JetBrains Mono, monospace' }}
              />
              <Tooltip content={<RevenueTrendTooltip />} />
              <Line
                type="monotone"
                dataKey="sales"
                name="Pendapatan Harian"
                stroke="#FB923C"
                strokeWidth={2.5}
                dot={{ r: 2.5, fill: '#FB923C', strokeWidth: 0 }}
                activeDot={{ r: 5, fill: '#FB923C', stroke: '#171522', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Main Chart + Top Products Grid (Single column on mobile, 12-col on desktop) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Daily Cashflow Bar Chart (7 cols) */}
        <section
          aria-label="Grafik penjualan harian"
          className="lg:col-span-7 bg-[#171522] rounded-2xl border border-[#2B2640] p-5 sm:p-6"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-[#252136]">
            <div>
              <h3 className="font-display text-base font-bold text-[#F4F1FA]">
                Arus Kas Harian (7 Hari)
              </h3>
              <p className="text-xs text-[#A39BBF] mt-0.5">
                Ketuk batang hari untuk melihat rincian penjualan &amp; pengeluaran.
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-[#A39BBF]">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-violet-400 inline-block" />
                Pemasukan
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-rose-400 inline-block" />
                Pengeluaran
              </span>
            </div>
          </div>

          {/* Selected Day Readout */}
          {activeDay && (
            <div className="grid grid-cols-3 gap-3 py-3.5 border-b border-[#252136] text-xs">
              <div>
                <span className="text-[#A39BBF] block">{activeDay.label} · Pemasukan</span>
                <span className="font-mono tabular-nums font-bold text-violet-300 text-sm">
                  {formatRupiah(activeDay.sales)}
                </span>
              </div>
              <div>
                <span className="text-[#A39BBF] block">Pengeluaran</span>
                <span className="font-mono tabular-nums font-bold text-rose-400 text-sm">
                  {formatRupiah(activeDay.expenses)}
                </span>
              </div>
              <div>
                <span className="text-[#A39BBF] block">Laba Harian</span>
                <span className="font-mono tabular-nums font-bold text-orange-300 text-sm">
                  {formatRupiah(activeDay.profit)}
                </span>
              </div>
            </div>
          )}

          {/* Responsive Bar Chart (No horizontal scroll) */}
          <div className="pt-5">
            <div className="grid grid-cols-7 gap-2 items-end h-52 border-b border-[#2B2640] pb-2">
              {dailySeries.map((point, idx) => {
                const salesHeightPct = Math.max(4, Math.round((point.sales / maxChartVal) * 100));
                const expHeightPct = Math.max(4, Math.round((point.expenses / maxChartVal) * 100));
                const isSelected = idx === selectedDayIdx;

                return (
                  <button
                    key={point.date}
                    type="button"
                    onClick={() => setSelectedDayIdx(idx)}
                    aria-label={`${point.label}: pemasukan ${formatRupiah(point.sales)}, pengeluaran ${formatRupiah(point.expenses)}`}
                    className={`h-full flex flex-col justify-end items-center gap-2 p-1.5 rounded-xl transition-colors ${
                      isSelected ? 'bg-[#201C32]' : 'hover:bg-[#1C192A]'
                    }`}
                  >
                    <div className="w-full h-36 flex items-end justify-center gap-1 pt-2">
                      <div
                        style={{ height: point.sales > 0 ? `${salesHeightPct}%` : '2px' }}
                        className={`w-2.5 sm:w-3.5 transition-all ${
                          point.sales > 0 ? 'bg-violet-400 rounded-t-md' : 'bg-[#2B2640] rounded-none'
                        }`}
                        title={`Pemasukan: ${formatCompactRupiah(point.sales)}`}
                      />
                      <div
                        style={{ height: point.expenses > 0 ? `${expHeightPct}%` : '2px' }}
                        className={`w-2.5 sm:w-3.5 transition-all ${
                          point.expenses > 0 ? 'bg-rose-400 rounded-t-md' : 'bg-[#2B2640] rounded-none'
                        }`}
                        title={`Pengeluaran: ${formatCompactRupiah(point.expenses)}`}
                      />
                    </div>
                    <span
                      className={`text-[11px] font-mono tabular-nums whitespace-nowrap ${
                        isSelected ? 'font-bold text-orange-300' : 'text-[#A39BBF]'
                      }`}
                    >
                      {point.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Top Selling Products (5 cols) */}
        <section
          aria-label="Produk terlaris dan stok"
          className="lg:col-span-5 bg-[#171522] rounded-2xl border border-[#2B2640] overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-[#252136] flex items-center justify-between">
            <h3 className="font-display text-base font-bold text-[#F4F1FA]">
              Produk Terlaris &amp; Stok
            </h3>
            <span className="text-xs text-[#A39BBF]">Berdasarkan omzet</span>
          </div>

          {topProducts.length === 0 ? (
            <div className="p-6 text-center text-sm text-[#A39BBF]">
              Belum ada produk di katalog toko ini.
            </div>
          ) : (
            <ul className="divide-y divide-[#252136]">
              {topProducts.map((item, idx) => {
                const lowStock = item.currentStock <= 6;
                return (
                  <li key={item.productId} className="px-5 py-3.5 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[#F4F1FA] truncate">
                        {idx + 1}. {item.name}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-1.5 text-xs text-[#A39BBF] mt-0.5 font-mono tabular-nums">
                        <span>{item.unitsSold} terjual</span>
                        <span aria-hidden="true">·</span>
                        <span>Est. laba {formatCompactRupiah(item.estimatedProfit)}</span>
                        <span aria-hidden="true">·</span>
                        <span className={lowStock ? 'text-orange-300 font-semibold' : ''}>
                          Stok {item.currentStock}{lowStock ? ' (Menipis)' : ''}
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="font-mono tabular-nums text-sm font-bold text-[#F4F1FA]">
                        {formatRupiah(item.revenue)}
                      </p>
                      <p className="font-mono tabular-nums text-[11px] text-[#A39BBF]">
                        @{formatCompactRupiah(item.currentPrice)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
