import { db } from './index.ts';
import { users } from './schema.ts';

export async function getOrCreateUser(params: {
  uid: string;
  email: string;
  name?: string;
  shopName?: string;
  category?: string;
}) {
  try {
    const cleanName = (params.name || params.email.split('@')[0] || 'Pemilik Usaha').trim();
    const defaultShop = (params.shopName || `Toko ${cleanName}`).trim();
    const defaultCategory = (params.category || 'Usaha Mikro & Retail').trim();

    const result = await db
      .insert(users)
      .values({
        uid: params.uid,
        email: params.email,
        name: cleanName,
        shopName: defaultShop,
        category: defaultCategory,
        plan: 'free',
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: params.email,
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database query failed in getOrCreateUser:', error);
    throw new Error('Gagal menyinkronkan profil akun dengan database.', { cause: error });
  }
}
