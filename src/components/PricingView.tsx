import React, { useEffect, useMemo, useState } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import { formatRupiah } from '../lib/analytics';
import {
  calculateBreakEvenPoint,
  calculateProductNetMargin,
  calculateSuggestedPrice,
} from '../lib/pricing';
import type { Product } from '../lib/types';

interface PricingViewProps {
  products: Product[];
  onUpsertProduct: (payload: {
    id?: string;
    name: string;
    unit_cost: number;
    price: number;
    stock: number;
  }) => Product;
  onDeleteProduct: (id: string) => void;
}

export function PricingView({
  products,
  onUpsertProduct,
  onDeleteProduct,
}: PricingViewProps) {
  const [selectedProductId, setSelectedProductId] = useState<string>(products[0]?.id ?? '');
  const [unitCost, setUnitCost] = useState<number>(products[0]?.unit_cost ?? 9500);
  const [targetMarginPct, setTargetMarginPct] = useState<number>(45);
  const [extraFeePct, setExtraFeePct] = useState<number>(5);
  const [fixedCost, setFixedCost] = useState<number>(2500000);
  const [customSellingPrice, setCustomSellingPrice] = useState<number | null>(null);

  // Add Product Form State
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCost, setNewCost] = useState('10000');
  const [newPrice, setNewPrice] = useState('20000');
  const [newStock, setNewStock] = useState('20');
  const [formError, setFormError] = useState<string | null>(null);
  const [appliedFlash, setAppliedFlash] = useState(false);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId) ?? products[0] ?? null,
    [products, selectedProductId]
  );

  useEffect(() => {
    if (selectedProduct) {
      setSelectedProductId(selectedProduct.id);
      setUnitCost(selectedProduct.unit_cost);
      setCustomSellingPrice(null);
    }
  }, [selectedProduct?.id]);

  const productMargins = useMemo(() => {
    const entries = products.map((product) => ({
      product,
      margin: calculateProductNetMargin(product.unit_cost, product.price),
    }));
    const validEntries = entries.filter((entry) => entry.margin.valid);
    const avgNetMarginPct =
      validEntries.length > 0
        ? Number(
            (
              validEntries.reduce((sum, entry) => sum + entry.margin.netMarginPct, 0) /
              validEntries.length
            ).toFixed(1)
          )
        : 0;
    return { entries, avgNetMarginPct };
  }, [products]);

  const newProductMargin = useMemo(
    () => calculateProductNetMargin(Number(newCost) || 0, Number(newPrice) || 0),
    [newCost, newPrice]
  );

  const priceResult = useMemo(
    () =>
      calculateSuggestedPrice({
        unitCost,
        targetMarginPct,
        extraFeePct,
      }),
    [unitCost, targetMarginPct, extraFeePct]
  );

  const effectiveSellingPrice =
    customSellingPrice !== null
      ? customSellingPrice
      : priceResult.valid
      ? priceResult.recommendedPrice
      : selectedProduct?.price ?? 0;

  const bepResult = useMemo(
    () =>
      calculateBreakEvenPoint({
        fixedCost,
        sellingPrice: effectiveSellingPrice,
        unitCost,
        extraFeePct,
      }),
    [fixedCost, effectiveSellingPrice, unitCost, extraFeePct]
  );

  const handleSelectProduct = (product: Product) => {
    setSelectedProductId(product.id);
    setUnitCost(product.unit_cost);
    setCustomSellingPrice(null);
    setAppliedFlash(false);
  };

  const handleApplyToProduct = () => {
    if (!selectedProduct || !priceResult.valid || effectiveSellingPrice <= 0) return;
    onUpsertProduct({
      id: selectedProduct.id,
      name: selectedProduct.name,
      unit_cost: unitCost,
      price: effectiveSellingPrice,
      stock: selectedProduct.stock,
    });
    setAppliedFlash(true);
    window.setTimeout(() => setAppliedFlash(false), 2000);
  };

  const handleCreateProduct = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    const costNum = Number(newCost);
    const priceNum = Number(newPrice);
    const stockNum = Number(newStock);

    if (!trimmed) {
      setFormError('Nama produk wajib diisi.');
      return;
    }
    if (!Number.isFinite(costNum) || costNum <= 0 || !Number.isFinite(priceNum) || priceNum <= 0) {
      setFormError('Biaya modal dan harga jual harus lebih dari Rp 0.');
      return;
    }

    const created = onUpsertProduct({
      name: trimmed,
      unit_cost: costNum,
      price: priceNum,
      stock: Number.isFinite(stockNum) ? stockNum : 0,
    });
    setSelectedProductId(created.id);
    setUnitCost(created.unit_cost);
    setCustomSellingPrice(null);
    setNewName('');
    setFormError(null);
    setShowAddForm(false);
  };

  const getMarginColorClass = (valid: boolean, pct: number) => {
    if (!valid || pct <= 0) return 'text-rose-400';
    if (pct >= 25) return 'text-emerald-400';
    return 'text-amber-300';
  };

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-[#F4F1FA]">
            Kalkulator Harga Jual &amp; Titik Impas (BEP)
          </h2>
          <p className="text-sm text-[#A39BBF] mt-0.5">
            Hitung harga saran berbasis margin bersih dan terapkan langsung ke katalog produk.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddForm((v) => !v)}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-xl border border-[#2B2640] bg-[#171522] text-sm font-semibold text-[#F4F1FA] hover:bg-[#231F36] whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4 text-orange-400" />
          <span>{showAddForm ? 'Tutup Form' : 'Tambah Produk'}</span>
        </button>
      </div>

      {/* Optional Add Product Drawer */}
      {showAddForm && (
        <form
          onSubmit={handleCreateProduct}
          className="bg-[#171522] rounded-2xl border border-[#2B2640] p-5 space-y-4"
        >
          <h3 className="font-display text-sm font-bold text-[#F4F1FA]">Produk Baru ke Katalog</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label htmlFor="new-prod-name" className="block text-xs font-medium text-[#A39BBF] mb-1">
                Nama Produk
              </label>
              <input
                id="new-prod-name"
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Es Kopi Pandan"
                className="w-full px-3 py-2 min-h-[44px] rounded-xl bg-[#14121F] border border-[#2B2640] text-base sm:text-sm text-[#F4F1FA] placeholder:text-[#7D759B] focus:outline-none focus:border-violet-400"
              />
            </div>
            <div>
              <label htmlFor="new-prod-cost" className="block text-xs font-medium text-[#A39BBF] mb-1">
                Biaya Modal / Unit (Rp)
              </label>
              <input
                id="new-prod-cost"
                type="number"
                min={100}
                value={newCost}
                onChange={(e) => setNewCost(e.target.value)}
                className="w-full px-3 py-2 min-h-[44px] rounded-xl bg-[#14121F] border border-[#2B2640] font-mono text-base sm:text-sm text-[#F4F1FA] focus:outline-none focus:border-violet-400"
              />
            </div>
            <div>
              <label htmlFor="new-prod-price" className="block text-xs font-medium text-[#A39BBF] mb-1">
                Harga Jual Awal (Rp)
              </label>
              <input
                id="new-prod-price"
                type="number"
                min={100}
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                className="w-full px-3 py-2 min-h-[44px] rounded-xl bg-[#14121F] border border-[#2B2640] font-mono text-base sm:text-sm text-[#F4F1FA] focus:outline-none focus:border-violet-400"
              />
            </div>
            <div>
              <label htmlFor="new-prod-stock" className="block text-xs font-medium text-[#A39BBF] mb-1">
                Stok Awal (Unit)
              </label>
              <input
                id="new-prod-stock"
                type="number"
                min={0}
                value={newStock}
                onChange={(e) => setNewStock(e.target.value)}
                className="w-full px-3 py-2 min-h-[44px] rounded-xl bg-[#14121F] border border-[#2B2640] font-mono text-base sm:text-sm text-[#F4F1FA] focus:outline-none focus:border-violet-400"
              />
            </div>
          </div>
          {formError && <p className="text-xs font-medium text-rose-400">{formError}</p>}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-xs text-[#A39BBF] font-mono tabular-nums">
              Estimasi Margin Bersih:{' '}
              <span
                className={`font-bold ${getMarginColorClass(
                  newProductMargin.valid,
                  newProductMargin.netMarginPct
                )}`}
              >
                {newProductMargin.valid
                  ? `${newProductMargin.netMarginPct}% (${formatRupiah(newProductMargin.profitPerUnit)}/unit)`
                  : '-'}
              </span>
            </p>
            <button
              type="submit"
              className="px-5 py-2.5 min-h-[44px] rounded-xl bg-orange-500 text-slate-950 text-sm font-semibold hover:bg-orange-400"
            >
              Simpan Produk
            </button>
          </div>
        </form>
      )}

      {/* Main 2-Column Desktop / Single-Column Mobile Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Product Selector & Inputs (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* Product Selector */}
          <div className="bg-[#171522] rounded-2xl border border-[#2B2640] p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <span className="text-xs font-semibold text-[#A39BBF]">
                1. Pilih Produk dari Katalog ({products.length})
              </span>
              {products.length > 0 && (
                <span className="text-xs font-mono tabular-nums text-[#A39BBF]">
                  Rata-rata margin bersih:{' '}
                  <span className="font-bold text-orange-300">
                    {productMargins.avgNetMarginPct}%
                  </span>
                </span>
              )}
            </div>

            {products.length === 0 ? (
              <p className="text-sm text-[#A39BBF]">
                Belum ada produk. Tambahkan produk pertama di atas untuk mulai menghitung.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {productMargins.entries.map(({ product, margin }) => {
                  const isActive = selectedProduct?.id === product.id;
                  const marginColor = getMarginColorClass(margin.valid, margin.netMarginPct);
                  return (
                    <div
                      key={product.id}
                      className={`flex items-center justify-between gap-2 rounded-xl border p-3 transition-colors ${
                        isActive
                          ? 'border-violet-400/70 bg-violet-500/15'
                          : 'border-[#2B2640] bg-[#1D1A2B] hover:border-violet-500/40'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleSelectProduct(product)}
                        className="flex-1 text-left min-w-0"
                      >
                        <p className="text-sm font-semibold text-[#F4F1FA] truncate">
                          {product.name}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-[#A39BBF] font-mono tabular-nums mt-1">
                          <span className="whitespace-nowrap">
                            Modal {formatRupiah(product.unit_cost)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="whitespace-nowrap">
                            Jual {formatRupiah(product.price)}
                          </span>
                        </div>
                        <p className="text-xs font-mono tabular-nums mt-1 flex flex-wrap items-center gap-x-1.5">
                          <span
                            data-testid={`product-margin-${product.id}`}
                            className={`font-bold whitespace-nowrap ${marginColor}`}
                          >
                            {margin.valid ? `Margin ${margin.netMarginPct}%` : 'Margin -'}
                          </span>
                          {margin.valid && (
                            <>
                              <span aria-hidden="true" className="text-[#7D759B]">
                                ·
                              </span>
                              <span className="text-[#A39BBF] whitespace-nowrap">
                                Laba {formatRupiah(margin.profitPerUnit)}/unit
                              </span>
                            </>
                          )}
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteProduct(product.id)}
                        aria-label={`Hapus produk ${product.name}`}
                        className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[#7D759B] hover:text-rose-400 hover:bg-rose-500/15 shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Formula Inputs */}
          <div className="bg-[#171522] rounded-2xl border border-[#2B2640] p-5 space-y-5">
            <span className="block text-xs font-semibold text-[#A39BBF]">
              2. Komponen Biaya &amp; Target Margin
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="calc-unit-cost" className="block text-xs font-medium text-[#E4DFF2] mb-1">
                  Biaya Modal per Unit (Rp)
                </label>
                <input
                  id="calc-unit-cost"
                  type="number"
                  min={0}
                  step={500}
                  value={unitCost}
                  onChange={(e) => {
                    setUnitCost(Number(e.target.value) || 0);
                    setCustomSellingPrice(null);
                  }}
                  className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-[#14121F] border border-[#2B2640] font-mono tabular-nums text-base sm:text-sm font-semibold text-[#F4F1FA] focus:outline-none focus:border-violet-400"
                />
                <span className="block text-[11px] font-mono tabular-nums text-[#A39BBF] mt-1">
                  {formatRupiah(unitCost)} / unit
                </span>
              </div>

              <div>
                <label htmlFor="calc-fixed-cost" className="block text-xs font-medium text-[#E4DFF2] mb-1">
                  Biaya Tetap Bulanan (Rp)
                </label>
                <input
                  id="calc-fixed-cost"
                  type="number"
                  min={0}
                  step={100000}
                  value={fixedCost}
                  onChange={(e) => setFixedCost(Number(e.target.value) || 0)}
                  className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-[#14121F] border border-[#2B2640] font-mono tabular-nums text-base sm:text-sm font-semibold text-[#F4F1FA] focus:outline-none focus:border-violet-400"
                />
                <span className="block text-[11px] font-mono tabular-nums text-[#A39BBF] mt-1">
                  {formatRupiah(fixedCost)} / bulan
                </span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="calc-margin" className="text-xs font-medium text-[#E4DFF2]">
                  Target Margin Laba Bersih
                </label>
                <span className="font-mono tabular-nums text-sm font-bold text-orange-300">
                  {targetMarginPct}%
                </span>
              </div>
              <input
                id="calc-margin"
                type="range"
                min={5}
                max={80}
                step={1}
                value={targetMarginPct}
                onChange={(e) => {
                  setTargetMarginPct(Number(e.target.value));
                  setCustomSellingPrice(null);
                }}
                className="w-full accent-orange-400 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="calc-extra-fee" className="text-xs font-medium text-[#E4DFF2]">
                  % Biaya Tambahan (QRIS, Kemasan, Aplikasi)
                </label>
                <span className="font-mono tabular-nums text-sm font-bold text-violet-300">
                  {extraFeePct}%
                </span>
              </div>
              <input
                id="calc-extra-fee"
                type="range"
                min={0}
                max={35}
                step={1}
                value={extraFeePct}
                onChange={(e) => {
                  setExtraFeePct(Number(e.target.value));
                  setCustomSellingPrice(null);
                }}
                className="w-full accent-violet-400 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Right: Deterministic Formula Output & Apply CTA (5 cols) */}
        <div className="lg:col-span-5 bg-[#171522] rounded-2xl border border-[#2B2640] p-5 sm:p-6 space-y-5">
          <div>
            <p className="text-xs font-medium text-[#A39BBF]">
              Harga Saran Jual · {selectedProduct ? selectedProduct.name : 'Simulasi Produk'}
            </p>
            {priceResult.valid ? (
              <>
                <p
                  data-testid="suggested-price"
                  className="font-mono tabular-nums text-3xl font-bold text-orange-300 mt-1"
                >
                  {formatRupiah(priceResult.recommendedPrice)}
                </p>
                <p className="text-xs text-[#A39BBF] mt-1 font-mono tabular-nums">
                  Hitungan eksak: {formatRupiah(priceResult.exactPrice)} (dibulatkan ke Rp 500)
                </p>
              </>
            ) : (
              <p role="alert" className="text-sm font-semibold text-rose-400 mt-2">
                {priceResult.error}
              </p>
            )}
          </div>

          <div className="pt-4 border-t border-[#252136]">
            <label htmlFor="calc-custom-price" className="block text-xs font-medium text-[#E4DFF2] mb-1">
              Simulasi Harga Jual Final (Rp)
            </label>
            <input
              id="calc-custom-price"
              type="number"
              min={0}
              step={500}
              value={effectiveSellingPrice}
              onChange={(e) => setCustomSellingPrice(Number(e.target.value) || 0)}
              className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-[#14121F] border border-[#2B2640] font-mono tabular-nums text-base font-bold text-[#F4F1FA] focus:outline-none focus:border-violet-400"
            />
          </div>

          {/* BEP & Profit Breakdown */}
          <div className="pt-4 border-t border-[#252136] space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[#A39BBF]">Laba Bersih per Unit</span>
              <span
                className={`font-mono tabular-nums font-bold ${
                  bepResult.profitPerUnit > 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {formatRupiah(bepResult.profitPerUnit)} ({bepResult.netMarginPct}%)
              </span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-[#A39BBF]">Titik Impas (BEP Unit / Bln)</span>
              <span
                data-testid="bep-units"
                className="font-mono tabular-nums font-bold text-[#F4F1FA]"
              >
                {bepResult.valid ? `${bepResult.bepUnits} unit` : '-'}
              </span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-[#A39BBF]">Omzet Minimal Impas</span>
              <span className="font-mono tabular-nums font-semibold text-[#E4DFF2]">
                {bepResult.valid ? formatRupiah(bepResult.bepRevenue) : '-'}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs pt-2 border-t border-[#252136]">
              <span className="text-[#A39BBF]">Status Kesehatan Margin</span>
              <span
                className={`font-semibold ${
                  !bepResult.valid
                    ? 'text-rose-400'
                    : bepResult.netMarginPct >= 25
                    ? 'text-emerald-400'
                    : 'text-amber-300'
                }`}
              >
                {!bepResult.valid
                  ? 'Rugi / Tidak Valid'
                  : bepResult.netMarginPct >= 25
                  ? 'Margin Sehat'
                  : 'Margin Tipis'}
              </span>
            </div>

            {!bepResult.valid && bepResult.error && (
              <p role="alert" className="text-xs text-rose-200 bg-rose-500/15 border border-rose-500/35 px-3 py-2 rounded-lg">
                {bepResult.error}
              </p>
            )}
          </div>

          <button
            type="button"
            disabled={!selectedProduct || !bepResult.valid}
            onClick={handleApplyToProduct}
            className="w-full px-5 py-3 min-h-[48px] rounded-xl bg-orange-500 text-slate-950 text-sm font-semibold hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
          >
            {appliedFlash ? (
              <>
                <Check className="w-4 h-4 text-slate-950" />
                <span>Harga Diterapkan ke Katalog</span>
              </>
            ) : (
              <span>
                Terapkan Harga ke {selectedProduct ? selectedProduct.name : 'Produk'}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
