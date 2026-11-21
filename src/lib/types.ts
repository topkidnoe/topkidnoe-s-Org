export type NavModule = 'tracker' | 'pricing' | 'dashboard' | 'chatbot';

export type PlanTier = 'free' | 'pro';

export type TransactionType = 'sale' | 'expense';

export type ChatPersona = 'advisor' | 'pricing';

export type ChatModelChoice = 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';

export interface UserProfile {
  id: string;
  email?: string;
  name: string;
  shop_name: string;
  category: string;
  plan: PlanTier;
  created_at: string;
}

export interface Product {
  id: string;
  user_id: string;
  name: string;
  unit_cost: number;
  price: number;
  stock: number;
  created_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  product_id: string | null;
  type: TransactionType;
  amount: number;
  quantity: number;
  date: string; // YYYY-MM-DD
  created_at: string; // ISO timestamp for ordering
  note: string;
}

export interface FaqItem {
  id: string;
  user_id: string;
  question: string;
  answer: string;
  created_at: string;
}

export interface ChatLog {
  id: string;
  user_id: string;
  question: string;
  answer: string;
  resolved: boolean;
  source: 'faq' | 'ai' | 'cache' | 'rule';
  created_at: string;
}

export interface ChatMessageItem {
  id: string;
  user_id: string;
  thread_id: string;
  role: 'user' | 'model';
  content: string;
  persona: ChatPersona;
  model_used: ChatModelChoice;
  source: 'ai' | 'faq' | 'rule';
  resolved: boolean;
  created_at: string;
}

export interface BizBuddyDatabase {
  users: UserProfile[];
  products: Product[];
  transactions: Transaction[];
  faqs: FaqItem[];
  chat_logs: ChatLog[];
  chat_messages?: ChatMessageItem[];
}
