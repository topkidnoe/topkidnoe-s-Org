import React, { useEffect, useState } from 'react';
import { Check, LogIn, LogOut, RotateCcw, ShieldCheck, Store, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import type { PlanTier, UserProfile } from '../lib/types';

interface AccountModalProps {
  open: boolean;
  onClose: () => void;
  users: UserProfile[];
  currentUser: UserProfile;
  isAuthenticated: boolean;
  onSelectUser: (userId: string) => void;
  onSelectPlan: (plan: PlanTier) => void;
  onUpdateShopProfile: (payload: { shop_name: string; category: string }) => void;
  onResetDemoData: () => void;
}

export function AccountModal({
  open,
  onClose,
  users,
  currentUser,
  isAuthenticated,
  onSelectUser,
  onSelectPlan,
  onUpdateShopProfile,
  onResetDemoData,
}: AccountModalProps) {
  const { firebaseUser, authError, signInWithGoogle, signOutUser } = useAuth();
  const [shopName, setShopName] = useState(currentUser.shop_name);
  const [category, setCategory] = useState(currentUser.category);

  useEffect(() => {
    setShopName(currentUser.shop_name);
    setCategory(currentUser.category);
  }, [currentUser.shop_name, currentUser.category, open]);

  if (!open) return null;

  const handleSaveShop = (e: React.FormEvent) => {
    e.preventDefault();
    if (!shopName.trim()) return;
    onUpdateShopProfile({
      shop_name: shopName.trim(),
      category: category.trim() || 'Usaha Mikro & Retail',
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/70 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-modal-title"
    >
      <div className="w-full md:max-w-xl bg-[#171522] rounded-t-3xl md:rounded-2xl border border-[#2B2640] shadow-2xl max-h-[92dvh] flex flex-col overflow-hidden pb-safe">
        <div className="px-5 sm:px-6 py-4 border-b border-[#2B2640] flex items-center justify-between">
          <div>
            <h2 id="account-modal-title" className="font-display text-lg font-bold text-[#F4F1FA]">
              Profil Toko &amp; Akun
            </h2>
            <p className="text-xs text-[#A39BBF] mt-0.5">
              Masuk dengan Google untuk menyimpan data toko secara persisten antar perangkat.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal profil toko"
            className="min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-center rounded-xl text-[#A39BBF] hover:bg-[#231F36] hover:text-[#F4F1FA]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6 overflow-y-auto space-y-6">
          {/* Google Sign-In Section */}
          <section aria-labelledby="google-auth-heading">
            <h3 id="google-auth-heading" className="text-sm font-semibold text-[#F4F1FA] mb-2">
              Autentikasi Akun Pemilik
            </h3>

            {isAuthenticated && firebaseUser ? (
              <div className="p-4 rounded-xl border border-violet-400/50 bg-violet-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#F4F1FA] truncate">
                    {firebaseUser.displayName || currentUser.name}
                  </p>
                  <p className="text-xs text-[#A39BBF] truncate">
                    {firebaseUser.email}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void signOutUser()}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-xl border border-[#2B2640] bg-[#1D1A2B] text-xs font-semibold text-[#E4DFF2] hover:bg-[#252136] shrink-0"
                >
                  <LogOut className="w-4 h-4 text-orange-400" />
                  <span>Keluar</span>
                </button>
              </div>
            ) : (
              <div className="p-4 rounded-xl border border-[#2B2640] bg-[#1D1A2B] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#F4F1FA]">
                    Simpan Data ke Akun Google Anda
                  </p>
                  <p className="text-xs text-[#A39BBF] mt-0.5">
                    Saat ini Anda menggunakan mode pratinjau demo. Masuk agar catatan &amp; chat tersimpan aman.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void signInWithGoogle()}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-orange-500 text-slate-950 text-xs font-semibold hover:bg-orange-400 whitespace-nowrap shrink-0"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Masuk dengan Google</span>
                </button>
              </div>
            )}

            {authError && (
              <p role="alert" className="mt-2 text-xs text-rose-300 bg-rose-500/15 border border-rose-500/35 px-3 py-2 rounded-lg">
                {authError}
              </p>
            )}
          </section>

          {/* Editable Shop Info when signed in OR Demo Tenant Switcher */}
          {isAuthenticated ? (
            <section aria-labelledby="shop-profile-heading" className="pt-4 border-t border-[#2B2640]">
              <h3 id="shop-profile-heading" className="text-sm font-semibold text-[#F4F1FA] mb-3">
                Identitas Toko Anda
              </h3>
              <form onSubmit={handleSaveShop} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="account-shop-name" className="block text-xs font-medium text-[#A39BBF] mb-1">
                      Nama Toko
                    </label>
                    <input
                      id="account-shop-name"
                      type="text"
                      value={shopName}
                      onChange={(e) => setShopName(e.target.value)}
                      className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-[#14121F] border border-[#2B2640] text-base sm:text-sm text-[#F4F1FA] focus:outline-none focus:border-violet-400"
                    />
                  </div>
                  <div>
                    <label htmlFor="account-shop-cat" className="block text-xs font-medium text-[#A39BBF] mb-1">
                      Kategori Usaha
                    </label>
                    <input
                      id="account-shop-cat"
                      type="text"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-[#14121F] border border-[#2B2640] text-base sm:text-sm text-[#F4F1FA] focus:outline-none focus:border-violet-400"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="px-4 py-2 min-h-[44px] rounded-xl bg-violet-500/25 border border-violet-400/60 text-xs font-semibold text-violet-100 hover:bg-violet-500/35"
                  >
                    Simpan Profil Toko
                  </button>
                </div>
              </form>
            </section>
          ) : (
            <section aria-labelledby="tenant-switch-heading" className="pt-4 border-t border-[#2B2640]">
              <h3 id="tenant-switch-heading" className="text-sm font-semibold text-[#F4F1FA] mb-2">
                Pilih Toko Pratinjau (Mode Demo)
              </h3>
              <div className="space-y-2">
                {users.map((user) => {
                  const isSelected = user.id === currentUser.id;
                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => {
                        onSelectUser(user.id);
                        onClose();
                      }}
                      className={`w-full p-3.5 rounded-xl border text-left flex items-center justify-between gap-3 transition-colors ${
                        isSelected
                          ? 'border-violet-400/70 bg-violet-500/15'
                          : 'border-[#2B2640] hover:border-violet-500/40 bg-[#1D1A2B]'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                            isSelected
                              ? 'bg-orange-500 text-slate-950'
                              : 'bg-[#252136] text-[#A39BBF]'
                          }`}
                        >
                          <Store className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[#F4F1FA] truncate">
                            {user.shop_name}
                          </p>
                          <p className="text-xs text-[#A39BBF] truncate">
                            {user.name} · {user.category}
                          </p>
                        </div>
                      </div>
                      {isSelected && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-orange-300 shrink-0">
                          <Check className="w-4 h-4" />
                          Aktif
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Freemium Plan Selector */}
          <section aria-labelledby="plan-heading" className="pt-4 border-t border-[#2B2640]">
            <h3 id="plan-heading" className="text-sm font-semibold text-[#F4F1FA] mb-2">
              Paket Langganan BizBuddy
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => onSelectPlan('free')}
                className={`p-4 rounded-xl border text-left transition-colors ${
                  currentUser.plan === 'free'
                    ? 'border-violet-400/70 bg-violet-500/15'
                    : 'border-[#2B2640] bg-[#1D1A2B] hover:border-violet-500/40'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-[#F4F1FA]">Gratis</span>
                  <span className="font-mono text-xs font-semibold text-[#A39BBF]">Rp 0/bln</span>
                </div>
                <p className="text-xs text-[#A39BBF] mt-1.5 leading-relaxed">
                  Tracker harian, kalkulator harga &amp; BEP, serta 20 pesan AI/hari.
                </p>
              </button>

              <button
                type="button"
                onClick={() => onSelectPlan('pro')}
                className={`p-4 rounded-xl border text-left transition-colors ${
                  currentUser.plan === 'pro'
                    ? 'border-orange-400/70 bg-orange-500/15'
                    : 'border-[#2B2640] bg-[#1D1A2B] hover:border-orange-400/40'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-[#F4F1FA]">BizBuddy Pro</span>
                  <span className="font-mono text-xs font-semibold text-orange-300">
                    Rp 19.000/bln
                  </span>
                </div>
                <p className="text-xs text-[#A39BBF] mt-1.5 leading-relaxed">
                  Ekspor CSV penuh, wawasan laba lanjutan, dan 100 pesan AI/hari.
                </p>
              </button>
            </div>
          </section>

          {/* Privacy & Isolation Note + Reset */}
          <div className="pt-4 border-t border-[#2B2640] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2 text-xs text-[#A39BBF]">
              <ShieldCheck className="w-4 h-4 text-violet-300 shrink-0 mt-0.5" />
              <span>
                Data produk, transaksi, dan percakapan AI terisolasi ketat untuk akun toko Anda.
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                onResetDemoData();
                onClose();
              }}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-xl border border-[#2B2640] bg-[#1D1A2B] text-xs font-medium text-[#E4DFF2] hover:bg-[#252136] whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Data Contoh
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
