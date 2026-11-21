import { relations } from 'drizzle-orm';
import { boolean, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  uid: text('uid').primaryKey(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  shopName: text('shop_name').notNull(),
  category: text('category').notNull(),
  plan: text('plan').notNull().default('free'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const products = pgTable('products', {
  id: text('id').primaryKey(),
  userUid: text('user_uid')
    .references(() => users.uid, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  unitCost: integer('unit_cost').notNull(),
  price: integer('price').notNull(),
  stock: integer('stock').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const transactions = pgTable('transactions', {
  id: text('id').primaryKey(),
  userUid: text('user_uid')
    .references(() => users.uid, { onDelete: 'cascade' })
    .notNull(),
  productId: text('product_id'),
  type: text('type').notNull(),
  amount: integer('amount').notNull(),
  quantity: integer('quantity').notNull().default(1),
  date: text('date').notNull(),
  note: text('note').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const faqs = pgTable('faqs', {
  id: text('id').primaryKey(),
  userUid: text('user_uid')
    .references(() => users.uid, { onDelete: 'cascade' })
    .notNull(),
  question: text('question').notNull(),
  answer: text('answer').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const chatMessages = pgTable('chat_messages', {
  id: text('id').primaryKey(),
  userUid: text('user_uid')
    .references(() => users.uid, { onDelete: 'cascade' })
    .notNull(),
  threadId: text('thread_id').notNull(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  persona: text('persona').notNull().default('advisor'),
  modelUsed: text('model_used').notNull().default('gemini-4-hydrogen'),
  source: text('source').notNull().default('ai'),
  resolved: boolean('resolved').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  products: many(products),
  transactions: many(transactions),
  faqs: many(faqs),
  chatMessages: many(chatMessages),
}));

export const productsRelations = relations(products, ({ one }) => ({
  owner: one(users, {
    fields: [products.userUid],
    references: [users.uid],
  }),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  owner: one(users, {
    fields: [transactions.userUid],
    references: [users.uid],
  }),
}));

export const faqsRelations = relations(faqs, ({ one }) => ({
  owner: one(users, {
    fields: [faqs.userUid],
    references: [users.uid],
  }),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  owner: one(users, {
    fields: [chatMessages.userUid],
    references: [users.uid],
  }),
}));
