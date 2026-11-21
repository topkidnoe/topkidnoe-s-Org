import React, { useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { computeTrackerSummary, formatRupiah } from '../lib/analytics';
import { getTodayIsoDate } from '../lib/seedData';
import type { Product, Transaction } from '../lib/types';

interface TrackerViewProps {
  transactions: Transaction[];
  products: Product[];
  onOpenQuickEntry: () => void;
  onDeleteTransaction: (id: string) => void;
}

type DateScope = 'today' | '7d' | 'all';
type TypeFilter = 'all' | 'sale' | 'expense';

function formatReadableDate(isoDate: string, todayDate: string): string {
  if (isoDate === todayDate) return 'Hari ini';
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function shiftDays(isoDate: string, delta: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}

export function TrackerView({
  transactions,
  products,
  onOpenQuickEntry,
  onDeleteTransaction,
}: TrackerViewProps) {
  const todayDate = getTodayIsoDate();
  const [dateScope, setDateScope] = useState<DateScope>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const productMap = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products]
  );

  const summary = useMemo(
    () => computeTrackerSummary(transactions, todayDate),
    [transactions, todayDate]
  );

  const filteredTransactions = useMemo(() => {
    const sevenDaysAgo = shiftDays(todayDate, -6);
    const q = searchQuery.trim().toLowerCase();

    return transactions.filter((tx) => {
      if (dateScope === 'today' && tx.date !== todayDate) return false;
      if (dateScope === '7d' && tx.date < sevenDaysAgo) return false;
      if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
      if (q) {
        const productName = tx.product_id ? productMap.get(tx.product_id)?.name ?? '' : '';
        const haystack = `${tx.note} ${productName}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [transactions, dateScope, typeFilter, searchQuery, todayDate, productMap]);

  return (
    <div className="space-y-6">
      {/* Primary Hero Summary + <10s Quick Entry CTA */}
      <section
        aria-label="Ringkasan saldo berjalan"
        className="bg-[#171522] rounded-2xl border border-[#2B2640] p-5 sm:p-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-[#A39BBF]">
              Saldo Berjalan · {summary.periodCount} transaksi hari ini
            </p>
            <p
              data-testid="running-balance"
              className="font-mono tabular-nums text-3xl sm:text-4xl font-bold text-[#F4F1FA] mt-1"
            >
              {formatRupiah(summary.totalBalance)}
            </p>
          </div>

          <button
            type="button"
            onClick={onOpenQuickEntry}
            className="md:hidden w-full inline-flex items-center justify-center gap-2 px-5 py-3 min-h-[48px] rounded-xl bg-orange-500 text-slate-950 text-sm font-semibold hover:bg-orange-400 active:scale-[0.98] transition-all whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Catat Cepat (&lt; 10 dtk)</span>
          </button>

          <p className="hidden md:block text-xs text-[#A39BBF] text-right">
            Sinkron otomatis dengan Dashboard &amp; stok produk
          </p>
        </div>

        {/* 3 Single-Elevation Metric Columns separated by hairline */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-5 mt-5 border-t border-[#2B2640]">
          <div>
            <p className="text-xs text-[#A39BBF]">Pemasukan Hari Ini</p>
            <p className="font-mono tabular-nums text-lg font-bold text-emerald-400 mt-0.5">
              +{formatRupiah(summary.periodSales)}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#A39BBF]">Pengeluaran Hari Ini</p>
            <p className="font-mono tabular-nums text-lg font-bold text-rose-400 mt-0.5">
              -{formatRupiah(summary.periodExpenses)}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#A39BBF]">Laba Bersih Hari Ini</p>
            <p
              className={`font-mono tabular-nums text-lg font-bold mt-0.5 ${
                summary.periodNetProfit >= 0 ? 'text-orange-300' : 'text-rose-400'
              }`}
            >
              {formatRupiah(summary.periodNetProfit)}
            </p>
          </div>
        </div>
      </section>

      {/* Filter Toolbar */}
      <section aria-label="Filter transaksi" className="space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center p-1 bg-[#171522] border border-[#2B2640] rounded-xl">
              {(
                [
                  { id: 'today', label: 'Hari Ini' },
                  { id: '7d', label: '7 Hari' },
                  { id: 'all', label: 'Semua' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setDateScope(opt.id)}
                  className={`px-3 py-1.5 min-h-[36px] text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                    dateScope === opt.id
                      ? 'bg-violet-500/25 text-violet-100 font-semibold'
                      : 'text-[#A39BBF] hover:text-[#F4F1FA]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="inline-flex items-center p-1 bg-[#171522] border border-[#2B2640] rounded-xl">
              {(
                [
                  { id: 'all', label: 'Semua' },
                  { id: 'sale', label: 'Pemasukan' },
                  { id: 'expense', label: 'Pengeluaran' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setTypeFilter(opt.id)}
                  className={`px-3 py-1.5 min-h-[36px] text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                    typeFilter === opt.id
                      ? 'bg-violet-500/25 text-violet-100 font-semibold'
                      : 'text-[#A39BBF] hover:text-[#F4F1FA]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="relative w-full md:w-64">
            <Search className="w-4 h-4 text-[#7D759B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Cari catatan atau produk transaksi"
              placeholder="Cari transaksi atau produk..."
              className="w-full pl-9 pr-3 py-2 min-h-[40px] rounded-xl bg-[#171522] border border-[#2B2640] text-base sm:text-sm text-[#F4F1FA] placeholder:text-[#7D759B] focus:outline-none focus:border-violet-400"
            />
          </div>
        </div>

        {/* Single-Column Transaction Ledger */}
        <div className="bg-[#171522] rounded-2xl border border-[#2B2640] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#2B2640] flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-[#F4F1FA]">
              Buku Kas Operasional
            </h2>
            <span className="text-xs text-[#A39BBF] tabular-nums">
              {filteredTransactions.length} entri
            </span>
          </div>

          {filteredTransactions.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm font-medium text-[#E4DFF2]">
                Belum ada transaksi yang sesuai filter ini.
              </p>
              <p className="text-xs text-[#A39BBF] mt-1">
                Catat pemasukan atau pengeluaran baru untuk memperbarui saldo dan analitik secara otomatis.
              </p>
              <button
                type="button"
                onClick={onOpenQuickEntry}
                className="mt-4 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-xl bg-orange-500 text-slate-950 text-xs font-semibold hover:bg-orange-400"
              >
                <Plus className="w-4 h-4" />
                Catat Transaksi Pertama
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-[#252136]" data-testid="transaction-list">
              {filteredTransactions.map((tx) => {
                const product = tx.product_id ? productMap.get(tx.product_id) : null;
                const isSale = tx.type === 'sale';

                return (
                  <li
                    key={tx.id}
                    className="px-4 sm:px-5 py-3.5 min-h-[64px] flex items-center justify-between gap-3 hover:bg-[#1E1B2E]/80 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          isSale
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : 'bg-rose-500/15 text-rose-300'
                        }`}
                      >
                        {isSale ? (
                          <ArrowUpRight className="w-4 h-4" />
                        ) : (
                          <ArrowDownRight className="w-4 h-4" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-[#F4F1FA] truncate">
                          {tx.note || (product ? product.name : isSale ? 'Pemasukan' : 'Pengeluaran')}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-1.5 text-xs text-[#A39BBF] mt-0.5">
                          <span>{isSale ? 'Pemasukan' : 'Pengeluaran'}</span>
                          <span aria-hidden="true">·</span>
                          <span>{formatReadableDate(tx.date, todayDate)}</span>
                          {product && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="truncate max-w-[160px]">
                                {product.name} ({tx.quantity} unit)
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`font-mono tabular-nums text-sm font-bold whitespace-nowrap ${
                          isSale ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {isSale ? '+' : '-'}
                        {formatRupiah(tx.amount)}
                      </span>
                      <button
                        type="button"
                        onClick={() => onDeleteTransaction(tx.id)}
                        aria-label={`Hapus transaksi ${tx.note || tx.id}`}
                        className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-[#7D759B] hover:text-rose-300 hover:bg-rose-500/15 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
