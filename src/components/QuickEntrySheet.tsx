import React, { useEffect, useState } from 'react';
import { Delete, Minus, Plus, X } from 'lucide-react';
import { formatRupiah } from '../lib/analytics';
import { getTodayIsoDate } from '../lib/seedData';
import type { Product, TransactionType } from '../lib/types';

interface QuickEntrySheetProps {
  open: boolean;
  onClose: () => void;
  products: Product[];
  onSubmit: (payload: {
    type: TransactionType;
    product_id: string | null;
    amount: number;
    quantity: number;
    date: string;
    note: string;
  }) => void;
}

const QUICK_EXPENSE_PRESETS = [
  'Belanja bahan baku',
  'Kemasan & plastik',
  'Listrik & air',
  'Ongkir & kurir',
];

export function QuickEntrySheet({
  open,
  onClose,
  products,
  onSubmit,
}: QuickEntrySheetProps) {
  const [type, setType] = useState<TransactionType>('sale');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [amountStr, setAmountStr] = useState<string>('0');
  const [note, setNote] = useState<string>('');
  const [date, setDate] = useState<string>(() => getTodayIsoDate());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setDate(getTodayIsoDate());
    }
  }, [open]);

  if (!open) return null;

  const selectedProduct = products.find((p) => p.id === selectedProductId) ?? null;
  const parsedAmount = Number(amountStr.replace(/\D/g, '')) || 0;

  const handleSelectType = (nextType: TransactionType) => {
    setType(nextType);
    setError(null);
    if (nextType === 'expense') {
      setSelectedProductId(null);
      setQuantity(1);
      setAmountStr('0');
    } else if (products[0]) {
      const first = products[0];
      setSelectedProductId(first.id);
      setQuantity(1);
      setAmountStr(String(first.price));
    }
  };

  const handleSelectProduct = (product: Product) => {
    setType('sale');
    setSelectedProductId(product.id);
    setError(null);
    setAmountStr(String(product.price * quantity));
  };

  const handleQuantityChange = (delta: number) => {
    const nextQty = Math.max(1, quantity + delta);
    setQuantity(nextQty);
    if (selectedProduct && type === 'sale') {
      setAmountStr(String(selectedProduct.price * nextQty));
    }
  };

  const handleKeypadPress = (digit: string) => {
    setError(null);
    if (digit === 'backspace') {
      setAmountStr((prev) => (prev.length <= 1 ? '0' : prev.slice(0, -1)));
      return;
    }
    if (digit === 'clear') {
      setAmountStr('0');
      return;
    }
    setAmountStr((prev) => {
      const clean = prev === '0' ? '' : prev;
      const candidate = `${clean}${digit}`;
      return candidate.length > 9 ? prev : candidate || '0';
    });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (parsedAmount <= 0) {
      setError('Masukkan nominal transaksi lebih dari Rp 0.');
      return;
    }

    const defaultNote =
      type === 'sale'
        ? selectedProduct
          ? `Penjualan ${selectedProduct.name}`
          : 'Penjualan langsung'
        : 'Pengeluaran operasional';

    onSubmit({
      type,
      product_id: type === 'sale' ? selectedProductId : null,
      amount: parsedAmount,
      quantity,
      date,
      note: note.trim() || defaultNote,
    });

    // Reset fast for next entry and close immediately (Optimistic UI)
    setSelectedProductId(null);
    setQuantity(1);
    setAmountStr('0');
    setNote('');
    setError(null);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/70 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-entry-title"
    >
      <div className="w-full md:max-w-lg bg-[#171522] rounded-t-3xl md:rounded-2xl border border-[#2B2640] shadow-2xl max-h-[92dvh] flex flex-col overflow-hidden">
        {/* Drag handle on mobile */}
        <div className="md:hidden pt-3 pb-1 flex justify-center">
          <div className="w-10 h-1.5 rounded-full bg-[#342E4C]" />
        </div>

        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#252136] flex items-center justify-between gap-4">
          <h2 id="quick-entry-title" className="font-display text-lg font-bold text-[#F4F1FA]">
            Catat Transaksi Cepat
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup panel catat transaksi"
            className="min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-center rounded-xl text-[#A39BBF] hover:bg-[#231F36] hover:text-[#F4F1FA]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Type Toggle */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-[#14121F] border border-[#2B2640] rounded-xl">
            <button
              type="button"
              onClick={() => handleSelectType('sale')}
              className={`min-h-[44px] rounded-lg text-sm font-semibold transition-colors ${
                type === 'sale'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                  : 'text-[#A39BBF] hover:text-[#F4F1FA]'
              }`}
            >
              Pemasukan
            </button>
            <button
              type="button"
              onClick={() => handleSelectType('expense')}
              className={`min-h-[44px] rounded-lg text-sm font-semibold transition-colors ${
                type === 'expense'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-400/40'
                  : 'text-[#A39BBF] hover:text-[#F4F1FA]'
              }`}
            >
              Pengeluaran
            </button>
          </div>

          {/* Product Chips (Sale) or Expense Presets */}
          {type === 'sale' ? (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-[#A39BBF]">
                  Pilih produk (opsional)
                </span>
                {selectedProduct && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedProductId(null);
                      setQuantity(1);
                    }}
                    className="text-xs font-medium text-[#A39BBF] hover:text-[#F4F1FA]"
                  >
                    Hapus pilihan
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {products.map((product) => {
                  const active = selectedProductId === product.id;
                  return (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => handleSelectProduct(product)}
                      className={`px-3 py-2 min-h-[40px] rounded-xl text-left border text-xs transition-colors ${
                        active
                          ? 'bg-violet-500/20 border-violet-400/70 text-[#F4F1FA] font-semibold'
                          : 'bg-[#1D1A2B] border-[#2B2640] text-[#E4DFF2] hover:border-violet-500/40'
                      }`}
                    >
                      <span className="block whitespace-nowrap">{product.name}</span>
                      <span
                        className={`block font-mono tabular-nums text-[11px] ${
                          active ? 'text-orange-300' : 'text-[#A39BBF]'
                        }`}
                      >
                        {formatRupiah(product.price)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div>
              <span className="block text-xs font-medium text-[#A39BBF] mb-2">
                Kategori cepat pengeluaran
              </span>
              <div className="flex flex-wrap gap-2">
                {QUICK_EXPENSE_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setNote(preset)}
                    className={`px-3 py-2 min-h-[40px] rounded-xl border text-xs transition-colors ${
                      note === preset
                        ? 'bg-rose-500/20 border-rose-400/60 text-rose-200 font-semibold'
                        : 'bg-[#1D1A2B] border-[#2B2640] text-[#E4DFF2] hover:border-violet-500/40'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Amount Display + Quantity Stepper */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-stretch">
            <div className="sm:col-span-2 p-3.5 rounded-xl bg-[#14121F] border border-[#2B2640]">
              <label
                htmlFor="quick-entry-amount"
                className="block text-xs font-medium text-[#A39BBF] mb-1"
              >
                Nominal ({type === 'sale' ? 'Pemasukan' : 'Pengeluaran'})
              </label>
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-sm font-semibold text-orange-300">Rp</span>
                <input
                  id="quick-entry-amount"
                  type="text"
                  inputMode="numeric"
                  value={new Intl.NumberFormat('id-ID').format(parsedAmount)}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '');
                    setAmountStr(digits || '0');
                    setError(null);
                  }}
                  className="w-full bg-transparent font-mono tabular-nums text-2xl font-bold text-[#F4F1FA] focus:outline-none"
                />
              </div>
            </div>

            {type === 'sale' ? (
              <div className="p-3.5 rounded-xl bg-[#14121F] border border-[#2B2640] flex flex-col justify-between">
                <span className="text-xs font-medium text-[#A39BBF]">Jumlah unit</span>
                <div className="flex items-center justify-between gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => handleQuantityChange(-1)}
                    aria-label="Kurangi jumlah unit"
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg bg-[#1D1A2B] border border-[#2B2640] text-[#F4F1FA] hover:bg-[#252136]"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="font-mono tabular-nums text-lg font-bold text-[#F4F1FA]">
                    {quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleQuantityChange(1)}
                    aria-label="Tambah jumlah unit"
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg bg-[#1D1A2B] border border-[#2B2640] text-[#F4F1FA] hover:bg-[#252136]"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-[#14121F] border border-[#2B2640] flex flex-col justify-between">
                <label htmlFor="quick-entry-date" className="text-xs font-medium text-[#A39BBF]">
                  Tanggal
                </label>
                <input
                  id="quick-entry-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-1 bg-transparent font-mono text-base sm:text-xs font-medium text-[#F4F1FA] focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* Numeric Keypad for <10s Thumb-Zone Input */}
          <div className="grid grid-cols-3 gap-2" aria-label="Keypad numerik nominal">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', 'backspace'].map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => handleKeypadPress(key)}
                aria-label={key === 'backspace' ? 'Hapus satu digit' : `Angka ${key}`}
                className="min-h-[44px] rounded-xl border border-[#2B2640] bg-[#1D1A2B] font-mono text-base font-semibold text-[#F4F1FA] hover:bg-[#252136] active:bg-[#2D2842] flex items-center justify-center transition-colors"
              >
                {key === 'backspace' ? <Delete className="w-5 h-5 text-[#A39BBF]" /> : key}
              </button>
            ))}
          </div>

          {/* Note Input */}
          <div>
            <label htmlFor="quick-entry-note" className="block text-xs font-medium text-[#A39BBF] mb-1">
              Catatan singkat (opsional)
            </label>
            <input
              id="quick-entry-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                type === 'sale' ? 'Contoh: QRIS meja 3 / Takeaway' : 'Contoh: Beli susu UHT 2 karton'
              }
              className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-[#14121F] border border-[#2B2640] text-base sm:text-sm text-[#F4F1FA] placeholder:text-[#7D759B] focus:outline-none focus:border-violet-400"
            />
          </div>

          {error && (
            <p role="alert" className="text-xs font-medium text-rose-200 bg-rose-500/15 border border-rose-500/35 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}

          {/* Fixed Bottom CTA */}
          <div className="pt-1 pb-safe flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleKeypadPress('clear')}
              className="px-4 py-3 min-h-[48px] rounded-xl border border-[#2B2640] bg-[#1D1A2B] text-sm font-medium text-[#E4DFF2] hover:bg-[#252136]"
            >
              Reset
            </button>
            <button
              type="submit"
              className="flex-1 px-5 py-3 min-h-[48px] rounded-xl bg-orange-500 text-slate-950 text-sm font-semibold hover:bg-orange-400 active:scale-[0.98] transition-all"
            >
              Simpan Transaksi
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
