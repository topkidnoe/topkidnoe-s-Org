# CONTEXT.md — BizBuddy

## 1. Ringkasan Proyek
**BizBuddy** adalah platform aplikasi mobile (*tracker* dan asisten AI) yang dirancang untuk membantu wirausaha dan pelaku UMKM mengelola keuangan operasional harian secara terstruktur dalam satu ekosistem. Aplikasi ini menggantikan pencatatan manual (buku catatan fisik dan pesan obrolan) dengan target waktu input transaksi **di bawah 10 detik**.

* **Model Bisnis:** Freemium (Fitur dasar gratis; fitur AI, ekspor data, dan wawasan lanjutan pada paket berbayar Rp15.000–Rp25.000/bulan).
* **Tech Stack Utama:** React Native atau Flutter (Frontend Mobile), Supabase (Auth & PostgreSQL Database), dan LLM API (AI Assistant).

---

## 2. Arsitektur *One Data Flow* (Single Source of Truth)
Seluruh fitur utama BizBuddy saling terhubung melalui **satu aliran data terpusat** tanpa perlu penginputan ulang (*double entry*):

1. **Tracker (`transactions`)**: Pengguna mencatat pemasukan (`sale`) dan pengeluaran (`expense`). Data langsung tersimpan di Supabase dan memperbarui saldo/laba berjalan secara instan.
2. **Pricing Tool (`products`)**: Menggunakan komponen biaya modal (`unit_cost`) dari produk untuk menghitung saran harga jual dan titik impas (*Break-Even Point* / BEP).
   * **Rumus Harga Saran:** $\text{Harga} = \frac{\text{Biaya per Unit}}{1 - \text{Target Margin} - \text{\% Biaya Tambahan}}$
   * **Rumus BEP:** $\text{BEP (Unit)} = \frac{\text{Biaya Tetap}}{\text{Laba per Unit}}$
3. **Dashboard (`transactions` + `products`)**: Mengagregasi data transaksi menjadi grafik penjualan harian, daftar produk terlaris, dan perbandingan laba mingguan.
4. **AI Chatbot (`products` + `transactions` + `faqs` -> `chat_logs`)**: Menjawab pertanyaan bisnis maupun pelanggan berdasarkan konteks data toko pengguna yang terisolasi, lalu menyimpan riwayat percakapan ke `chat_logs`.

---

## 3. Skema Basis Data (Supabase PostgreSQL)
Database terdiri dari **5 tabel utama**:

| Tabel | Kolom Utama | Fungsi |
| :--- | :--- | :--- |
| **`users`** | `id` (UUID, PK), `name`, `shop_name`, `created_at` | Identitas pengguna dan nama toko (terhubung dengan `auth.users`). |
| **`products`** | `id` (UUID, PK), `user_id` (FK), `name`, `unit_cost`, `price`, `stock`, `created_at` | Katalog produk beserta biaya modal, harga jual, dan stok. |
| **`transactions`** | `id` (UUID, PK), `user_id` (FK), `product_id` (FK), `type` (`sale`/`expense`), `amount`, `quantity`, `date`, `note` | Catatan pemasukan dan pengeluaran; sumber utama Tracker dan Dashboard. |
| **`faqs`** | `id` (UUID, PK), `user_id` (FK), `question`, `answer`, `created_at` | Basis pengetahuan tanya-jawab toko untuk konteks Chatbot. |
| **`chat_logs`** | `id` (UUID, PK), `user_id` (FK), `question`, `answer`, `resolved` (boolean), `created_at` | Riwayat interaksi Chatbot dan indikator keberhasilan jawaban. |

---

## 4. Aturan Wajib (*Non-Negotiable Rules*)

### A. Isolasi Data & Keamanan (`user_id` & RLS)
* **Strict Tenant Isolation:** Setiap *query* (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) dari aplikasi klien **wajib** terisolasi berdasarkan `user_id` pengguna yang sedang login (`.eq('user_id', user.id)`).
* **Row Level Security (RLS):** RLS wajib diaktifkan di seluruh 5 tabel Supabase dengan kebijakan `auth.uid() = user_id` (dan `auth.uid() = id` pada tabel `users`) agar database menolak akses lintas akun di level server.
* **Privasi & Keamanan AI:**
  * Kunci API (*API Keys*) LLM wajib disimpan di sisi server (backend/Edge Functions), **tidak boleh** ada di kode sumber klien.
  * Dilarang menyimpan atau mengirimkan data pribadi pelanggan (nama/kontak pelanggan) ke model AI.
  * Terapkan *caching* dan batas kuota pertanyaan harian per pengguna untuk mengendalikan biaya API.

### B. Desain *Mobile-First* & UX
* **Target Kecepatan (< 10 Detik):** Alur pencatatan transaksi harus ringkas (gunakan *bottom sheet quick-entry*, pilihan produk berbasis *chip*, dan *numeric keypad*).
* **Thumb-Zone Navigation:** Navigasi utama menggunakan *Bottom Tab Bar* untuk 4 modul inti (*Tracker*, *Pricing*, *Dashboard*, *Chatbot*).
* **Single-Column Layout:** Seluruh grafik dan kartu metrik didesain vertikal satu kolom tanpa memerlukan *horizontal scroll* atau *pinch-to-zoom*.
* **Optimistic UI:** Pembaruan UI pada *Tracker* harus merespons secara instan di sisi klien sebelum proses sinkronisasi jaringan selesai.

---

## 5. Panduan Pengembangan (*Development Workflow*)
* **Rule-Based First:** Bangun logika kalkulasi (Pricing/BEP) dan alur dasar berbasis aturan deterministik terlebih dahulu sebelum mengintegrasikan lapisan AI.
* **Incremental Build:** Kerjakan dan uji satu fitur dalam satu waktu dimulai dari skema database + RLS $\rightarrow$ Autentikasi & Tracker $\rightarrow$ Pricing Tool $\rightarrow$ Dashboard $\rightarrow$ AI Chatbot.