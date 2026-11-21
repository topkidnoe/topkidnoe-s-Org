import React from 'react';
import {
  BarChart3,
  Calculator,
  MessageSquareText,
  Plus,
  ReceiptText,
  Store,
} from 'lucide-react';
import type { NavModule, UserProfile } from '../lib/types';

interface AppShellProps {
  activeModule: NavModule;
  onSelectModule: (mod: NavModule) => void;
  currentUser: UserProfile;
  isAuthenticated?: boolean;
  onOpenQuickEntry: () => void;
  onOpenAccountModal: () => void;
  syncNotice: string | null;
  children: React.ReactNode;
}

const NAV_ITEMS: Array<{
  id: NavModule;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'tracker', label: 'Tracker Harian', shortLabel: 'Tracker', icon: ReceiptText },
  { id: 'pricing', label: 'Kalkulator Harga', shortLabel: 'Pricing', icon: Calculator },
  { id: 'dashboard', label: 'Dashboard Analitik', shortLabel: 'Dashboard', icon: BarChart3 },
  { id: 'chatbot', label: 'Asisten Toko AI', shortLabel: 'Asisten', icon: MessageSquareText },
];

export function AppShell({
  activeModule,
  onSelectModule,
  currentUser,
  isAuthenticated = false,
  onOpenQuickEntry,
  onOpenAccountModal,
  syncNotice,
  children,
}: AppShellProps) {
  const activeMeta = NAV_ITEMS.find((item) => item.id === activeModule) ?? NAV_ITEMS[0];

  return (
    <div className="min-h-[100dvh] bg-[#0E0D15] text-[#F4F1FA] flex flex-col lg:flex-row">
      {/* Desktop Left Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-[#14121F] border-r border-[#2B2640] z-30">
        <div className="h-16 px-6 flex items-center border-b border-[#2B2640]">
          <span className="font-display text-xl font-bold tracking-tight text-[#F4F1FA] whitespace-nowrap shrink-0">
            Biz<span className="text-orange-400">Buddy</span>
          </span>
        </div>

        <nav aria-label="Navigasi utama" className="flex-1 px-3 py-5 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeModule === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectModule(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 min-h-[44px] rounded-xl text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400 ${
                  isActive
                    ? 'bg-violet-500/15 text-violet-200 font-semibold'
                    : 'text-[#A39BBF] hover:bg-[#1E1B2E] hover:text-[#F4F1FA]'
                }`}
              >
                <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-orange-400' : 'text-[#7D759B]'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[#2B2640]">
          <button
            type="button"
            onClick={onOpenAccountModal}
            className="w-full text-left p-3 rounded-xl border border-[#2B2640] bg-[#191627] hover:border-violet-500/40 hover:bg-[#201C32] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-violet-500/20 text-orange-300 border border-violet-500/30 flex items-center justify-center shrink-0">
                <Store className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[#F4F1FA] truncate">
                  {currentUser.shop_name}
                </p>
                <p className="text-xs text-[#A39BBF] truncate">
                  {isAuthenticated ? currentUser.email || currentUser.name : `${currentUser.name} · Mode Demo`}
                </p>
              </div>
            </div>
          </button>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 lg:pl-64 flex flex-col min-h-[100dvh] min-w-0">
        {/* Sticky Top Header */}
        <header className="sticky top-0 z-30 h-14 md:h-16 bg-[#14121F]/90 backdrop-blur-md border-b border-[#2B2640] px-3.5 sm:px-6 lg:px-8 flex items-center justify-between gap-2 md:gap-8">
          {/* Zone 1: Brand / Active View Title */}
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="lg:hidden font-display text-lg font-bold tracking-tight text-[#F4F1FA] whitespace-nowrap shrink-0">
              Biz<span className="text-orange-400">Buddy</span>
            </span>
            <h1 className="hidden lg:block font-display text-base font-semibold text-[#F4F1FA] whitespace-nowrap truncate">
              {activeMeta.label}
            </h1>
          </div>

          {/* Zone 2: Tablet text nav links */}
          <nav
            aria-label="Navigasi modul cepat"
            className="hidden md:flex lg:hidden items-center gap-6 text-sm font-medium text-[#A39BBF]"
          >
            {NAV_ITEMS.map((item) => {
              const isActive = activeModule === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectModule(item.id)}
                  className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'border-orange-400 text-[#F4F1FA] font-semibold'
                      : 'border-transparent hover:text-[#F4F1FA]'
                  }`}
                >
                  {item.shortLabel}
                </button>
              );
            })}
          </nav>

          {/* Desktop context metadata text */}
          <div className="hidden lg:flex items-center gap-2 text-sm text-[#A39BBF] whitespace-nowrap min-w-0">
            <span className="truncate">{currentUser.shop_name}</span>
            <span aria-hidden="true">·</span>
            <span className="truncate">{currentUser.category}</span>
          </div>

          {/* Zone 3: Account Switcher & Quick Entry Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onOpenAccountModal}
              aria-label={`Kelola akun dan toko (${currentUser.shop_name})`}
              className="lg:hidden inline-flex items-center justify-center min-h-[40px] px-2.5 py-1.5 rounded-xl border border-[#2B2640] bg-[#191627] text-xs font-medium text-[#E4DFF2] hover:bg-[#221E34] whitespace-nowrap shrink-0"
            >
              <Store className="w-4 h-4 mr-1.5 text-orange-400 shrink-0" />
              <span className="max-w-[96px] sm:max-w-[140px] truncate">{currentUser.shop_name}</span>
            </button>

            <button
              type="button"
              onClick={onOpenQuickEntry}
              aria-label="Catat Transaksi"
              className="md:hidden inline-flex items-center justify-center min-h-[40px] min-w-[40px] px-2.5 rounded-xl bg-orange-500 text-slate-950 text-xs font-semibold hover:bg-orange-400 active:scale-[0.98] transition-all shrink-0"
            >
              <Plus className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onOpenQuickEntry}
              className="hidden md:inline-flex items-center justify-center gap-1.5 px-4 py-2 min-h-[40px] rounded-xl bg-orange-500 text-slate-950 text-sm font-semibold hover:bg-orange-400 active:scale-[0.98] transition-all whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400"
            >
              <Plus className="w-4 h-4" />
              <span>Catat Transaksi</span>
            </button>
          </div>
        </header>

        {/* Optimistic Sync Feedback Toast */}
        {syncNotice && (
          <div
            role="status"
            aria-live="polite"
            className="fixed bottom-20 md:bottom-6 right-4 lg:right-8 z-50 pointer-events-none bg-[#231F36] border border-violet-500/40 text-[#F4F1FA] text-xs font-medium px-4 py-2.5 rounded-xl shadow-lg"
          >
            {syncNotice}
          </div>
        )}

        {/* Main Content Viewport */}
        <main className="flex-1 w-full max-w-6xl mx-auto px-3.5 sm:px-6 lg:px-8 py-4 sm:py-7 pb-24 md:pb-10 min-w-0">
          {children}
        </main>
      </div>

      {/* Mobile Fixed Bottom Tab Bar with Safe Area Inset */}
      <nav
        aria-label="Navigasi bawah mobile"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#14121F]/95 backdrop-blur-md border-t border-[#2B2640] pb-safe"
      >
        <div className="h-16 grid grid-cols-4 items-center">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeModule === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectModule(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`h-full min-h-[48px] flex flex-col items-center justify-center gap-1 px-1 transition-colors focus-visible:outline-2 focus-visible:outline-violet-400 ${
                  isActive ? 'text-orange-400' : 'text-[#8C84AA] hover:text-[#F4F1FA]'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className={`text-[11px] leading-none whitespace-nowrap ${isActive ? 'font-semibold' : 'font-medium'}`}>
                  {item.shortLabel}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
