import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  Circle,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  User,
  Zap,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { computeTrackerSummary } from '../lib/analytics';
import { sanitizeForAI } from '../lib/chatbotRules';
import { getTodayIsoDate } from '../lib/seedData';
import type {
  ChatMessageItem,
  ChatModelChoice,
  ChatPersona,
  PlanTier,
  Product,
  Transaction,
} from '../lib/types';

interface ChatbotViewProps {
  userId: string;
  shopName: string;
  category: string;
  plan: PlanTier;
  products: Product[];
  transactions: Transaction[];
  chatMessages: ChatMessageItem[];
  onAppendMessages: (msgs: ChatMessageItem[]) => void;
  onAddLocalTurn: (payload: {
    threadId: string;
    persona: ChatPersona;
    modelUsed: ChatModelChoice;
    userMessage: string;
    modelReply: string;
    source: 'ai' | 'faq' | 'rule';
  }) => void;
  onClearThread: (threadId?: string) => void;
  onToggleResolved: (messageId: string) => void;
}

const PERSONA_OPTIONS: Array<{
  id: ChatPersona;
  label: string;
  subtitle: string;
  defaultModel: ChatModelChoice;
}> = [
  {
    id: 'advisor',
    label: 'Konsultan Bisnis',
    subtitle: 'Arus kas, stok & omzet',
    defaultModel: 'gemini-4-hydrogen',
  },
  {
    id: 'pricing',
    label: 'Strategis Harga',
    subtitle: 'Margin bersih & bundling',
    defaultModel: 'gemini-4-hydrogen',
  },
];

const SUGGESTED_PROMPTS_BY_PERSONA: Record<ChatPersona, string[]> = {
  advisor: [
    'Ringkasan performa toko hari ini & stok menipis',
    'Produk mana yang paling menguntungkan minggu ini?',
    'Buat rencana aksi 3 hari untuk menaikkan omzet',
  ],
  pricing: [
    'Analisis produk dengan margin tertinggi dan saran bundling',
    'Kalau biaya kemasan naik Rp 1.000, produk mana perlu penyesuaian harga?',
    'Ide paket hemat untuk meningkatkan nilai rata-rata order',
  ],
};

export function ChatbotView({
  userId,
  shopName,
  category,
  plan,
  products,
  transactions,
  chatMessages,
  onAppendMessages,
  onAddLocalTurn,
  onClearThread,
  onToggleResolved,
}: ChatbotViewProps) {
  const { getFreshToken } = useAuth();
  const todayDate = getTodayIsoDate();
  const [persona, setPersona] = useState<ChatPersona>('advisor');
  const [speedMode, setSpeedMode] = useState<'standard' | 'fast'>('standard');
  const [question, setQuestion] = useState('');
  const [pendingUserText, setPendingUserText] = useState<string | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [quota, setQuota] = useState<{ used: number; limit: number; remaining: number }>({
    used: 0,
    limit: plan === 'pro' ? 100 : 20,
    remaining: plan === 'pro' ? 100 : 20,
  });

  const threadEndRef = useRef<HTMLDivElement | null>(null);

  const summary = useMemo(
    () => computeTrackerSummary(transactions, todayDate),
    [transactions, todayDate]
  );

  const threadMessages = useMemo(
    () => chatMessages.filter((m) => m.thread_id === 'default'),
    [chatMessages]
  );

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [threadMessages.length, pendingUserText, loadingAi]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const token = await getFreshToken();
        const headers: Record<string, string> = token
          ? { Authorization: `Bearer ${token}` }
          : {};
        const res = await fetch(
          `/api/quota?userId=${encodeURIComponent(userId)}&plan=${plan}`,
          { headers }
        );
        if (!res.ok) return;
        const data = (await res.json()) as { used?: number; limit: number; remaining: number };
        if (!cancelled && typeof data.used === 'number') {
          setQuota({ used: data.used, limit: data.limit, remaining: data.remaining });
        }
      } catch {
        // Ignore offline quota check
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, plan, getFreshToken]);

  const activePersonaMeta =
    PERSONA_OPTIONS.find((opt) => opt.id === persona) ?? PERSONA_OPTIONS[0];
  const effectiveModel: ChatModelChoice =
    speedMode === 'fast' ? 'gemini-3.1-flash-lite' : 'gemini-4-hydrogen';

  const sendMessage = async (rawInput: string) => {
    const cleanInput = rawInput.trim();
    if (!cleanInput || loadingAi) return;

    setErrorMsg(null);
    const sanitizedQuestion = sanitizeForAI(cleanInput);
    setQuestion('');
    setPendingUserText(sanitizedQuestion);
    setLoadingAi(true);

    try {
      const token = await getFreshToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const historyPayload = threadMessages.slice(-20).map((msg) => ({
        role: msg.role,
        text: msg.content,
      }));

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          userId,
          plan,
          threadId: 'default',
          persona,
          speedMode,
          question: sanitizedQuestion,
          history: historyPayload,
          context: {
            shopName,
            category,
            summary: {
              totalBalance: summary.totalBalance,
              periodSales: summary.periodSales,
              periodExpenses: summary.periodExpenses,
              periodNetProfit: summary.periodNetProfit,
            },
            products: products.map((p) => ({
              name: p.name,
              unit_cost: p.unit_cost,
              price: p.price,
              stock: p.stock,
            })),
          },
        }),
      });

      const data = (await res.json()) as {
        answer?: string;
        modelUsed?: ChatModelChoice;
        savedMessages?: ChatMessageItem[];
        error?: string;
        quota?: { used: number; limit: number; remaining: number };
      };

      if (data.quota) {
        setQuota(data.quota);
      }

      if (!res.ok || !data.answer) {
        setErrorMsg(data.error || 'Gagal mendapatkan jawaban dari asisten AI Gemini.');
        setQuestion(cleanInput);
        return;
      }

      if (Array.isArray(data.savedMessages) && data.savedMessages.length > 0) {
        onAppendMessages(data.savedMessages);
      } else {
        onAddLocalTurn({
          threadId: 'default',
          persona,
          modelUsed: data.modelUsed ?? effectiveModel,
          userMessage: sanitizedQuestion,
          modelReply: data.answer,
          source: 'ai',
        });
      }
    } catch {
      setErrorMsg('Koneksi ke server asisten AI gagal. Periksa jaringan Anda lalu coba lagi.');
      setQuestion(cleanInput);
    } finally {
      setPendingUserText(null);
      setLoadingAi(false);
    }
  };

  const handleSubmitChat = (e: React.FormEvent) => {
    e.preventDefault();
    void sendMessage(question);
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-xl font-bold text-[#F4F1FA]">
            Asisten Bisnis AI
          </h2>
          <p className="text-xs text-[#A39BBF] mt-0.5 flex flex-wrap items-center gap-x-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-violet-400 inline shrink-0" />
            <span>Konsultan keuangan &amp; strategi untuk {shopName}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums text-orange-300">
              Kuota AI: {quota.used}/{quota.limit} hari ini
            </span>
          </p>
        </div>
      </div>

      <div className="bg-[#171522] rounded-2xl border border-[#2B2640] flex flex-col overflow-hidden">
        {/* Role Selector & Thread Controls */}
        <div className="p-3.5 sm:p-4 border-b border-[#252136] space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-orange-400 shrink-0" />
              <span className="text-xs font-semibold text-[#F4F1FA]">
                Fokus Analisis Asisten
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setSpeedMode((prev) => (prev === 'standard' ? 'fast' : 'standard'))
                }
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[34px] rounded-lg border text-[11px] font-medium transition-colors whitespace-nowrap ${
                  speedMode === 'fast'
                    ? 'border-orange-400/60 bg-orange-500/15 text-orange-200'
                    : 'border-[#2B2640] bg-[#1D1A2B] text-[#A39BBF] hover:text-[#F4F1FA]'
                }`}
                title="Mode cepat menggunakan gemini-3.1-flash-lite, mode standar menggunakan gemini-4-hydrogen"
              >
                <Zap className="w-3 h-3" />
                <span>{speedMode === 'fast' ? 'Mode Cepat' : 'Mode Standar'}</span>
              </button>

              {threadMessages.length > 0 && (
                <button
                  type="button"
                  onClick={() => onClearThread('default')}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[34px] rounded-lg border border-[#2B2640] bg-[#1D1A2B] text-[11px] font-medium text-[#A39BBF] hover:text-[#F4F1FA] hover:bg-[#252136] whitespace-nowrap"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Percakapan Baru</span>
                </button>
              )}
            </div>
          </div>

          <div
            role="radiogroup"
            aria-label="Pilih peran asisten bisnis"
            className="grid grid-cols-2 gap-2"
          >
            {PERSONA_OPTIONS.map((opt) => {
              const active = persona === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setPersona(opt.id)}
                  className={`px-3 py-2 min-h-[44px] rounded-xl border text-left transition-colors ${
                    active
                      ? 'border-violet-400/70 bg-violet-500/20 text-[#F4F1FA]'
                      : 'border-[#2B2640] bg-[#1D1A2B] text-[#A39BBF] hover:border-violet-500/40 hover:text-[#F4F1FA]'
                  }`}
                >
                  <p className="text-xs font-semibold truncate">{opt.label}</p>
                  <p className="text-[11px] opacity-80 truncate">{opt.subtitle}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Scrollable Multi-Turn Conversation Thread */}
        <div
          data-testid="chat-thread-scroll"
          className="flex-1 h-[min(45dvh,400px)] md:h-[440px] overflow-y-auto px-3.5 sm:px-5 py-4 space-y-4 bg-[#14121F]/60"
        >
          {threadMessages.length === 0 && !pendingUserText ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto py-8 space-y-2">
              <div className="w-11 h-11 rounded-2xl bg-violet-500/20 border border-violet-400/40 flex items-center justify-center text-orange-300">
                <Bot className="w-5 h-5" />
              </div>
              <p className="text-sm font-semibold text-[#F4F1FA]">
                Mulai Diskusi dengan {activePersonaMeta.label}
              </p>
              <p className="text-xs text-[#A39BBF] leading-relaxed">
                Asisten mengingat konteks percakapan sebelumnya serta membaca data katalog dan transaksi {shopName} untuk membantu keputusan bisnis Anda.
              </p>
            </div>
          ) : (
            <>
              {threadMessages.map((msg) => {
                const isUser = msg.role === 'user';
                return (
                  <div
                    key={msg.id}
                    className={`flex items-start gap-2.5 ${
                      isUser ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    {!isUser && (
                      <div className="w-8 h-8 rounded-xl bg-violet-500/20 border border-violet-400/40 flex items-center justify-center text-orange-300 shrink-0 mt-0.5">
                        <Bot className="w-4 h-4" />
                      </div>
                    )}

                    <div
                      className={`max-w-[88%] sm:max-w-[78%] rounded-2xl px-3.5 py-2.5 border text-sm leading-relaxed ${
                        isUser
                          ? 'bg-violet-500/20 border-violet-400/40 text-[#F4F1FA] rounded-tr-sm'
                          : 'bg-[#1D1A2B] border-[#2B2640] text-[#E4DFF2] rounded-tl-sm'
                      }`}
                    >
                      <p className="whitespace-pre-line break-words">{msg.content}</p>

                      <div className="mt-2 pt-1.5 border-t border-white/5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#8C84AA]">
                        <span className="font-mono">
                          {isUser
                            ? 'Anda'
                            : `${
                                PERSONA_OPTIONS.find((p) => p.id === msg.persona)?.label ??
                                'Konsultan Bisnis'
                              } · ${msg.model_used}`}
                        </span>
                        <div className="flex items-center gap-2">
                          {!isUser && (
                            <button
                              type="button"
                              onClick={() => onToggleResolved(msg.id)}
                              className={`inline-flex items-center gap-1 font-medium transition-colors ${
                                msg.resolved ? 'text-emerald-400' : 'text-orange-300'
                              }`}
                            >
                              {msg.resolved ? (
                                <CheckCircle2 className="w-3 h-3" />
                              ) : (
                                <Circle className="w-3 h-3" />
                              )}
                              <span>{msg.resolved ? 'Terjawab' : 'Tindak Lanjut'}</span>
                            </button>
                          )}
                          <span className="font-mono">
                            {new Date(msg.created_at).toLocaleTimeString('id-ID', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </div>
                    </div>

                    {isUser && (
                      <div className="w-8 h-8 rounded-xl bg-orange-500/20 border border-orange-400/40 flex items-center justify-center text-orange-300 shrink-0 mt-0.5">
                        <User className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                );
              })}

              {pendingUserText && (
                <div className="flex items-start justify-end gap-2.5">
                  <div className="max-w-[88%] sm:max-w-[78%] rounded-2xl rounded-tr-sm px-3.5 py-2.5 border bg-violet-500/20 border-violet-400/40 text-sm text-[#F4F1FA]">
                    <p className="whitespace-pre-line break-words">{pendingUserText}</p>
                  </div>
                  <div className="w-8 h-8 rounded-xl bg-orange-500/20 border border-orange-400/40 flex items-center justify-center text-orange-300 shrink-0 mt-0.5">
                    <User className="w-4 h-4" />
                  </div>
                </div>
              )}

              {loadingAi && (
                <div className="flex items-start justify-start gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-violet-500/20 border border-violet-400/40 flex items-center justify-center text-orange-300 shrink-0 mt-0.5">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="rounded-2xl rounded-tl-sm px-4 py-3 border bg-[#1D1A2B] border-[#2B2640] text-xs text-[#A39BBF]">
                    {activePersonaMeta.label} sedang menyiapkan analisis ({effectiveModel})...
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={threadEndRef} />
        </div>

        {/* Starter Prompts + Message Composer */}
        <div className="p-3.5 sm:p-4 border-t border-[#252136] space-y-3 bg-[#171522]">
          <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
            {SUGGESTED_PROMPTS_BY_PERSONA[persona].map((prompt) => (
              <button
                key={prompt}
                type="button"
                disabled={loadingAi}
                onClick={() => void sendMessage(prompt)}
                className="px-3 py-1.5 min-h-[36px] rounded-xl border border-[#2B2640] bg-[#1D1A2B] text-xs font-medium text-[#E4DFF2] hover:bg-[#252136] hover:border-violet-500/40 transition-colors text-left whitespace-nowrap sm:whitespace-normal shrink-0 disabled:opacity-50"
              >
                {prompt}
              </button>
            ))}
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-xs text-rose-200"
            >
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmitChat} className="flex flex-col sm:flex-row gap-2">
            <label htmlFor="chatbot-input" className="sr-only">
              Tulis pertanyaan bisnis atau lanjutan analisis
            </label>
            <input
              id="chatbot-input"
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={`Diskusi dengan ${activePersonaMeta.label.toLowerCase()} tentang omzet, margin, atau stok...`}
              className="flex-1 px-4 py-2.5 min-h-[46px] rounded-xl bg-[#14121F] border border-[#2B2640] text-base sm:text-sm text-[#F4F1FA] placeholder:text-[#7D759B] focus:outline-none focus:border-violet-400"
            />
            <button
              type="submit"
              disabled={loadingAi || !question.trim()}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 min-h-[46px] rounded-xl bg-orange-500 text-slate-950 text-sm font-semibold hover:bg-orange-400 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Send className="w-4 h-4" />
              <span>{loadingAi ? 'Memproses...' : 'Kirim'}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
