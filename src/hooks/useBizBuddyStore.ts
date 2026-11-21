import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { filterByUser } from '../lib/analytics';
import { createSeedDatabase, getTodayIsoDate } from '../lib/seedData';
import type {
  BizBuddyDatabase,
  ChatMessageItem,
  ChatModelChoice,
  ChatPersona,
  FaqItem,
  PlanTier,
  Product,
  Transaction,
  TransactionType,
  UserProfile,
} from '../lib/types';

const STORAGE_KEY = 'bizbuddy_db_v2';
const ACTIVE_USER_KEY = 'bizbuddy_active_user_v1';

function loadInitialDatabase(): BizBuddyDatabase {
  if (typeof window === 'undefined') {
    return createSeedDatabase();
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as BizBuddyDatabase;
      if (
        parsed &&
        Array.isArray(parsed.users) &&
        Array.isArray(parsed.products) &&
        Array.isArray(parsed.transactions) &&
        Array.isArray(parsed.faqs)
      ) {
        return {
          ...parsed,
          chat_logs: Array.isArray(parsed.chat_logs) ? parsed.chat_logs : [],
          chat_messages: Array.isArray(parsed.chat_messages)
            ? parsed.chat_messages
            : createSeedDatabase().chat_messages,
        };
      }
    }
  } catch {
    // Fall back to fresh deterministic seed data
  }
  return createSeedDatabase();
}

function loadInitialUserId(users: UserProfile[]): string {
  if (typeof window !== 'undefined') {
    const saved = window.localStorage.getItem(ACTIVE_USER_KEY);
    if (saved && users.some((u) => u.id === saved)) {
      return saved;
    }
  }
  return users[0]?.id ?? 'usr_kopi_senja';
}

function makeId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function useBizBuddyStore() {
  const { firebaseUser, idToken, getFreshToken } = useAuth();
  const isAuthenticated = Boolean(firebaseUser && idToken);

  const [db, setDb] = useState<BizBuddyDatabase>(() => loadInitialDatabase());
  const [activeUserId, setActiveUserId] = useState<string>(() =>
    loadInitialUserId(loadInitialDatabase().users)
  );
  const [cloudStore, setCloudStore] = useState<{
    user: UserProfile;
    products: Product[];
    transactions: Transaction[];
    faqs: FaqItem[];
    chatMessages: ChatMessageItem[];
  } | null>(null);
  const [cloudLoading, setCloudLoading] = useState<boolean>(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const flashNotice = useCallback((message: string) => {
    setSyncNotice(message);
    window.setTimeout(() => {
      setSyncNotice((prev) => (prev === message ? null : prev));
    }, 2400);
  }, []);

  // Load authenticated user's isolated store from Cloud SQL when signed in
  const refreshCloudStore = useCallback(async () => {
    const token = await getFreshToken();
    if (!token) return;
    setCloudLoading(true);
    try {
      const res = await fetch('/api/store', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { error?: string };
        flashNotice(errData.error || 'Gagal memuat data toko.');
        return;
      }
      const data = (await res.json()) as {
        user: UserProfile | null;
        products: Product[];
        transactions: Transaction[];
        faqs: FaqItem[];
        chatMessages: ChatMessageItem[];
      };
      if (data.user) {
        setCloudStore({
          user: data.user,
          products: data.products ?? [],
          transactions: data.transactions ?? [],
          faqs: data.faqs ?? [],
          chatMessages: data.chatMessages ?? [],
        });
      }
    } catch {
      flashNotice('Gagal menyinkronkan data toko.');
    } finally {
      setCloudLoading(false);
    }
  }, [flashNotice, getFreshToken]);

  useEffect(() => {
    if (isAuthenticated) {
      void refreshCloudStore();
    } else {
      setCloudStore(null);
    }
  }, [isAuthenticated, refreshCloudStore]);

  useEffect(() => {
    if (isAuthenticated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch {
      // Ignore storage quota errors
    }
  }, [db, isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) return;
    try {
      window.localStorage.setItem(ACTIVE_USER_KEY, activeUserId);
    } catch {
      // Ignore storage errors
    }
  }, [activeUserId, isAuthenticated]);

  const currentUser = useMemo(() => {
    if (cloudStore) return cloudStore.user;
    return db.users.find((u) => u.id === activeUserId) ?? db.users[0];
  }, [cloudStore, db.users, activeUserId]);

  const products = useMemo(() => {
    if (cloudStore) return cloudStore.products;
    return filterByUser(db.products, currentUser.id);
  }, [cloudStore, db.products, currentUser.id]);

  const transactions = useMemo(() => {
    if (cloudStore) {
      return [...cloudStore.transactions].sort((a, b) =>
        b.created_at.localeCompare(a.created_at)
      );
    }
    return filterByUser(db.transactions, currentUser.id).sort((a, b) =>
      b.created_at.localeCompare(a.created_at)
    );
  }, [cloudStore, db.transactions, currentUser.id]);

  const faqs = useMemo(() => {
    if (cloudStore) {
      return [...cloudStore.faqs].sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
    return filterByUser(db.faqs, currentUser.id).sort((a, b) =>
      b.created_at.localeCompare(a.created_at)
    );
  }, [cloudStore, db.faqs, currentUser.id]);

  const chatMessages = useMemo(() => {
    if (cloudStore) {
      return [...cloudStore.chatMessages].sort((a, b) =>
        a.created_at.localeCompare(b.created_at)
      );
    }
    return filterByUser(db.chat_messages ?? [], currentUser.id).sort((a, b) =>
      a.created_at.localeCompare(b.created_at)
    );
  }, [cloudStore, db.chat_messages, currentUser.id]);

  // Add transaction (Cloud SQL when signed in, local preview state otherwise)
  const addTransaction = useCallback(
    (payload: {
      type: TransactionType;
      product_id: string | null;
      amount: number;
      quantity: number;
      date?: string;
      note: string;
    }) => {
      const today = payload.date || getTodayIsoDate();
      const optimisticTx: Transaction = {
        id: makeId('tx'),
        user_id: currentUser.id,
        product_id: payload.product_id,
        type: payload.type,
        amount: Math.round(payload.amount),
        quantity: Math.max(1, Math.round(payload.quantity)),
        date: today,
        created_at: new Date().toISOString(),
        note: payload.note.trim(),
      };

      if (cloudStore) {
        setCloudStore((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            products: prev.products.map((p) =>
              payload.type === 'sale' && payload.product_id && p.id === payload.product_id
                ? { ...p, stock: Math.max(0, p.stock - optimisticTx.quantity) }
                : p
            ),
            transactions: [optimisticTx, ...prev.transactions],
          };
        });
        flashNotice(
          payload.type === 'sale' ? 'Pemasukan tercatat' : 'Pengeluaran tercatat'
        );

        void (async () => {
          const token = await getFreshToken();
          if (!token) return;
          const res = await fetch('/api/transactions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              type: payload.type,
              product_id: payload.product_id,
              amount: optimisticTx.amount,
              quantity: optimisticTx.quantity,
              date: today,
              note: optimisticTx.note,
            }),
          });
          if (res.ok) {
            const saved = (await res.json()) as {
              transaction: Transaction;
              updatedStock: number | null;
            };
            setCloudStore((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                transactions: prev.transactions.map((t) =>
                  t.id === optimisticTx.id ? saved.transaction : t
                ),
                products:
                  saved.updatedStock !== null && payload.product_id
                    ? prev.products.map((p) =>
                        p.id === payload.product_id ? { ...p, stock: saved.updatedStock! } : p
                      )
                    : prev.products,
              };
            });
          } else {
            void refreshCloudStore();
            flashNotice('Gagal menyimpan transaksi ke server');
          }
        })();

        return optimisticTx;
      }

      setDb((prev) => {
        const nextProducts = prev.products.map((product) => {
          if (
            payload.type === 'sale' &&
            payload.product_id &&
            product.id === payload.product_id &&
            product.user_id === currentUser.id
          ) {
            return {
              ...product,
              stock: Math.max(0, product.stock - optimisticTx.quantity),
            };
          }
          return product;
        });

        return {
          ...prev,
          products: nextProducts,
          transactions: [optimisticTx, ...prev.transactions],
        };
      });

      flashNotice(
        payload.type === 'sale' ? 'Pemasukan tercatat secara instan' : 'Pengeluaran tercatat secara instan'
      );
      return optimisticTx;
    },
    [cloudStore, currentUser.id, flashNotice, getFreshToken, refreshCloudStore]
  );

  const deleteTransaction = useCallback(
    (transactionId: string) => {
      if (cloudStore) {
        const target = cloudStore.transactions.find((t) => t.id === transactionId);
        if (!target) return;
        setCloudStore((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            products: prev.products.map((p) =>
              target.type === 'sale' && target.product_id && p.id === target.product_id
                ? { ...p, stock: p.stock + target.quantity }
                : p
            ),
            transactions: prev.transactions.filter((t) => t.id !== transactionId),
          };
        });
        flashNotice('Transaksi dihapus');
        void (async () => {
          const token = await getFreshToken();
          if (!token) return;
          const res = await fetch(`/api/transactions/${encodeURIComponent(transactionId)}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) {
            void refreshCloudStore();
            flashNotice('Gagal menghapus transaksi');
          }
        })();
        return;
      }

      setDb((prev) => {
        const target = prev.transactions.find(
          (tx) => tx.id === transactionId && tx.user_id === currentUser.id
        );
        if (!target) return prev;

        const nextProducts = prev.products.map((product) => {
          if (
            target.type === 'sale' &&
            target.product_id &&
            product.id === target.product_id &&
            product.user_id === currentUser.id
          ) {
            return {
              ...product,
              stock: product.stock + target.quantity,
            };
          }
          return product;
        });

        return {
          ...prev,
          products: nextProducts,
          transactions: prev.transactions.filter(
            (tx) => !(tx.id === transactionId && tx.user_id === currentUser.id)
          ),
        };
      });
      flashNotice('Transaksi dihapus');
    },
    [cloudStore, currentUser.id, flashNotice, getFreshToken, refreshCloudStore]
  );

  const upsertProduct = useCallback(
    (payload: {
      id?: string;
      name: string;
      unit_cost: number;
      price: number;
      stock: number;
    }): Product => {
      const optimisticId = payload.id ?? makeId('prd');
      const savedProduct: Product = {
        id: optimisticId,
        user_id: currentUser.id,
        name: payload.name.trim(),
        unit_cost: Math.round(payload.unit_cost),
        price: Math.round(payload.price),
        stock: Math.max(0, Math.round(payload.stock)),
        created_at: new Date().toISOString(),
      };

      if (cloudStore) {
        setCloudStore((prev) => {
          if (!prev) return prev;
          const exists = prev.products.some((p) => p.id === optimisticId);
          return {
            ...prev,
            products: exists
              ? prev.products.map((p) => (p.id === optimisticId ? savedProduct : p))
              : [...prev.products, savedProduct],
          };
        });
        flashNotice(payload.id ? 'Produk & harga diperbarui' : 'Produk baru ditambahkan');
        void (async () => {
          const token = await getFreshToken();
          if (!token) return;
          const res = await fetch('/api/products', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
          });
          if (res.ok) {
            const data = (await res.json()) as { product: Product };
            setCloudStore((prev) => {
              if (!prev) return prev;
              const hasTemp = prev.products.some((p) => p.id === optimisticId);
              return {
                ...prev,
                products: hasTemp
                  ? prev.products.map((p) => (p.id === optimisticId ? data.product : p))
                  : [...prev.products, data.product],
              };
            });
          } else {
            void refreshCloudStore();
            flashNotice('Gagal menyimpan produk');
          }
        })();
        return savedProduct;
      }

      setDb((prev) => {
        if (payload.id) {
          return {
            ...prev,
            products: prev.products.map((p) =>
              p.id === payload.id && p.user_id === currentUser.id
                ? { ...p, ...savedProduct, created_at: p.created_at }
                : p
            ),
          };
        }
        return { ...prev, products: [...prev.products, savedProduct] };
      });
      flashNotice(payload.id ? 'Produk & harga diperbarui' : 'Produk baru ditambahkan');
      return savedProduct;
    },
    [cloudStore, currentUser.id, flashNotice, getFreshToken, refreshCloudStore]
  );

  const deleteProduct = useCallback(
    (productId: string) => {
      if (cloudStore) {
        setCloudStore((prev) =>
          prev ? { ...prev, products: prev.products.filter((p) => p.id !== productId) } : prev
        );
        flashNotice('Produk dihapus dari katalog');
        void (async () => {
          const token = await getFreshToken();
          if (!token) return;
          const res = await fetch(`/api/products/${encodeURIComponent(productId)}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) {
            void refreshCloudStore();
            flashNotice('Gagal menghapus produk');
          }
        })();
        return;
      }

      setDb((prev) => ({
        ...prev,
        products: prev.products.filter(
          (p) => !(p.id === productId && p.user_id === currentUser.id)
        ),
      }));
      flashNotice('Produk dihapus dari katalog');
    },
    [cloudStore, currentUser.id, flashNotice, getFreshToken, refreshCloudStore]
  );

  const addFaq = useCallback(
    (question: string, answer: string) => {
      const item: FaqItem = {
        id: makeId('faq'),
        user_id: currentUser.id,
        question: question.trim(),
        answer: answer.trim(),
        created_at: new Date().toISOString(),
      };

      if (cloudStore) {
        setCloudStore((prev) => (prev ? { ...prev, faqs: [item, ...prev.faqs] } : prev));
        flashNotice('FAQ toko ditambahkan');
        void (async () => {
          const token = await getFreshToken();
          if (!token) return;
          const res = await fetch('/api/faqs', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ question: item.question, answer: item.answer }),
          });
          if (res.ok) {
            const data = (await res.json()) as { faq: FaqItem };
            setCloudStore((prev) =>
              prev
                ? {
                    ...prev,
                    faqs: prev.faqs.map((f) => (f.id === item.id ? data.faq : f)),
                  }
                : prev
            );
          } else {
            void refreshCloudStore();
            flashNotice('Gagal menyimpan FAQ');
          }
        })();
        return item;
      }

      setDb((prev) => ({ ...prev, faqs: [item, ...prev.faqs] }));
      flashNotice('FAQ toko ditambahkan');
      return item;
    },
    [cloudStore, currentUser.id, flashNotice, getFreshToken, refreshCloudStore]
  );

  const deleteFaq = useCallback(
    (faqId: string) => {
      if (cloudStore) {
        setCloudStore((prev) =>
          prev ? { ...prev, faqs: prev.faqs.filter((f) => f.id !== faqId) } : prev
        );
        flashNotice('FAQ dihapus');
        void (async () => {
          const token = await getFreshToken();
          if (!token) return;
          const res = await fetch(`/api/faqs/${encodeURIComponent(faqId)}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) {
            void refreshCloudStore();
            flashNotice('Gagal menghapus FAQ');
          }
        })();
        return;
      }

      setDb((prev) => ({
        ...prev,
        faqs: prev.faqs.filter((f) => !(f.id === faqId && f.user_id === currentUser.id)),
      }));
      flashNotice('FAQ dihapus');
    },
    [cloudStore, currentUser.id, flashNotice, getFreshToken, refreshCloudStore]
  );

  const appendChatMessages = useCallback(
    (newMessages: ChatMessageItem[]) => {
      if (cloudStore) {
        setCloudStore((prev) =>
          prev
            ? {
                ...prev,
                chatMessages: [...prev.chatMessages, ...newMessages],
              }
            : prev
        );
        return;
      }

      setDb((prev) => ({
        ...prev,
        chat_messages: [...(prev.chat_messages ?? []), ...newMessages],
      }));
    },
    [cloudStore]
  );

  const addLocalChatTurn = useCallback(
    (payload: {
      threadId: string;
      persona: ChatPersona;
      modelUsed: ChatModelChoice;
      userMessage: string;
      modelReply: string;
      source: 'ai' | 'faq' | 'rule';
    }) => {
      const now = Date.now();
      const userMsg: ChatMessageItem = {
        id: makeId('msg'),
        user_id: currentUser.id,
        thread_id: payload.threadId,
        role: 'user',
        content: payload.userMessage,
        persona: payload.persona,
        model_used: payload.modelUsed,
        source: payload.source,
        resolved: true,
        created_at: new Date(now).toISOString(),
      };
      const modelMsg: ChatMessageItem = {
        id: makeId('msg'),
        user_id: currentUser.id,
        thread_id: payload.threadId,
        role: 'model',
        content: payload.modelReply,
        persona: payload.persona,
        model_used: payload.modelUsed,
        source: payload.source,
        resolved: true,
        created_at: new Date(now + 1).toISOString(),
      };
      appendChatMessages([userMsg, modelMsg]);
    },
    [appendChatMessages, currentUser.id]
  );

  const clearChatThread = useCallback(
    (threadId = 'default') => {
      if (cloudStore) {
        setCloudStore((prev) =>
          prev
            ? {
                ...prev,
                chatMessages: prev.chatMessages.filter((m) => m.thread_id !== threadId),
              }
            : prev
        );
        flashNotice('Percakapan baru dimulai');
        void (async () => {
          const token = await getFreshToken();
          if (!token) return;
          await fetch(`/api/chat/threads/${encodeURIComponent(threadId)}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          });
        })();
        return;
      }

      setDb((prev) => ({
        ...prev,
        chat_messages: (prev.chat_messages ?? []).filter(
          (m) => !(m.user_id === currentUser.id && m.thread_id === threadId)
        ),
      }));
      flashNotice('Percakapan baru dimulai');
    },
    [cloudStore, currentUser.id, flashNotice, getFreshToken]
  );

  const toggleChatMessageResolved = useCallback(
    (messageId: string) => {
      if (cloudStore) {
        setCloudStore((prev) =>
          prev
            ? {
                ...prev,
                chatMessages: prev.chatMessages.map((m) =>
                  m.id === messageId ? { ...m, resolved: !m.resolved } : m
                ),
              }
            : prev
        );
        void (async () => {
          const token = await getFreshToken();
          if (!token) return;
          await fetch(`/api/chat/messages/${encodeURIComponent(messageId)}/resolved`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}` },
          });
        })();
        return;
      }

      setDb((prev) => ({
        ...prev,
        chat_messages: (prev.chat_messages ?? []).map((m) =>
          m.id === messageId && m.user_id === currentUser.id
            ? { ...m, resolved: !m.resolved }
            : m
        ),
      }));
    },
    [cloudStore, currentUser.id, getFreshToken]
  );

  const setUserPlan = useCallback(
    (plan: PlanTier) => {
      if (cloudStore) {
        setCloudStore((prev) =>
          prev ? { ...prev, user: { ...prev.user, plan } } : prev
        );
        flashNotice(plan === 'pro' ? 'Paket BizBuddy Pro aktif' : 'Beralih ke paket Gratis');
        void (async () => {
          const token = await getFreshToken();
          if (!token) return;
          await fetch('/api/user', {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ plan }),
          });
        })();
        return;
      }

      setDb((prev) => ({
        ...prev,
        users: prev.users.map((u) => (u.id === currentUser.id ? { ...u, plan } : u)),
      }));
      flashNotice(plan === 'pro' ? 'Paket BizBuddy Pro aktif' : 'Beralih ke paket Gratis');
    },
    [cloudStore, currentUser.id, flashNotice, getFreshToken]
  );

  const updateShopProfile = useCallback(
    (payload: { shop_name: string; category: string }) => {
      if (cloudStore) {
        setCloudStore((prev) =>
          prev
            ? {
                ...prev,
                user: {
                  ...prev.user,
                  shop_name: payload.shop_name.trim(),
                  category: payload.category.trim(),
                },
              }
            : prev
        );
        flashNotice('Profil toko diperbarui');
        void (async () => {
          const token = await getFreshToken();
          if (!token) return;
          await fetch('/api/user', {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
          });
        })();
        return;
      }

      setDb((prev) => ({
        ...prev,
        users: prev.users.map((u) =>
          u.id === currentUser.id
            ? {
                ...u,
                shop_name: payload.shop_name.trim(),
                category: payload.category.trim(),
              }
            : u
        ),
      }));
      flashNotice('Profil toko diperbarui');
    },
    [cloudStore, currentUser.id, flashNotice, getFreshToken]
  );

  const resetDemoData = useCallback(() => {
    if (cloudStore) {
      void (async () => {
        const token = await getFreshToken();
        if (!token) return;
        const res = await fetch('/api/store/reset', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = (await res.json()) as {
            user: UserProfile | null;
            products: Product[];
            transactions: Transaction[];
            faqs: FaqItem[];
            chatMessages: ChatMessageItem[];
          };
          if (data.user) {
            setCloudStore({
              user: data.user,
              products: data.products ?? [],
              transactions: data.transactions ?? [],
              faqs: data.faqs ?? [],
              chatMessages: data.chatMessages ?? [],
            });
            flashNotice('Data toko direset ke contoh awal');
          }
        }
      })();
      return;
    }

    const fresh = createSeedDatabase();
    setDb(fresh);
    setActiveUserId(fresh.users[0].id);
    flashNotice('Data demo direset ke kondisi awal');
  }, [cloudStore, flashNotice, getFreshToken]);

  return {
    isAuthenticated,
    cloudLoading,
    users: cloudStore ? [cloudStore.user] : db.users,
    currentUser,
    setActiveUserId,
    products,
    transactions,
    faqs,
    chatMessages,
    syncNotice,
    addTransaction,
    deleteTransaction,
    upsertProduct,
    deleteProduct,
    addFaq,
    deleteFaq,
    appendChatMessages,
    addLocalChatTurn,
    clearChatThread,
    toggleChatMessageResolved,
    setUserPlan,
    updateShopProfile,
    resetDemoData,
  };
}
