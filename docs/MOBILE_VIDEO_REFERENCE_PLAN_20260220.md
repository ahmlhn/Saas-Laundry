# Mobile Plan From Video Reference (2026-02-20)

## 1) Tujuan
- Menyelaraskan UX aplikasi mobile SaaS Laundry dengan pola operasional pada video referensi.
- Menjaga implementasi tetap realistis terhadap API backend yang sudah tersedia.
- Menyusun urutan delivery fitur agar cepat dipakai harian (owner/admin/kasir/worker/kurir).

## 2) Ringkasan Temuan Dari Video
- Gaya visual: putih bersih, aksen biru-teal gradien, icon bulat berwarna, card radius besar.
- Struktur utama: bottom tab `Beranda`, `Pesanan`, tombol `+`, `Laporan`, `Akun`.
- Alur awal: login (email/password) + opsi biometric + opsi login lain.
- Beranda: widget ringkasan transaksi + shortcut status order.
- Pesanan: tab status (`Validasi`, `Antrian`, `Proses`, `Siap Ambil`, `Siap Antar`) dengan empty state ilustratif.
- Akun/Manajemen: list modul operasional (pelanggan, outlet, layanan, pegawai, keuangan, bantuan, dll).
- Ada layar setting spesifik: `Pelanggan`, `Printer & Nota`, `Kelola Keuangan`, `Bantuan & Informasi`.

Referensi frame yang dianalisis:
- `tmp/video-frames/sample/20260220-151907/manifest.json`
- Sample timestamp: `0.0s`, `19.7s`, `39.5s`, `59.2s`, `79.0s`, `98.8s`, `118.6s`, `138.4s`, `158.3s`, `178.0s`, `197.8s`, `217.6s`.

## 3) Gap Terhadap App Mobile Saat Ini
- Sudah ada:
  - Login + session restore.
  - Pilih outlet.
  - Dashboard ringkas.
  - List order + detail order + update status laundry/kurir.
- Belum ada:
  - Bottom tab 5 menu seperti referensi.
  - Halaman laporan.
  - Halaman akun berisi menu manajemen lengkap.
  - Modul pelanggan dari mobile.
  - Modul keuangan dari mobile.
  - Modul printer/nota dari mobile.
  - Bantuan & informasi dari mobile.
  - Biometric login.

## 4) IA (Information Architecture) Baru
- Auth
  - Login
  - Biometric re-login (opsional)
- Main Tab
  - Beranda
  - Pesanan
  - Quick Action (`+`)
  - Laporan
  - Akun
- Stack detail
  - Order Detail
  - Pelanggan (list/detail/create/update)
  - Kelola Keuangan
  - Printer & Nota
  - Bantuan & Informasi

## 5) Rencana Fitur Per Fase

### Fase 1 (MVP Operasional Harian)
- Refactor navigation ke 5 bottom tab.
- Beranda:
  - Header tenant/outlet aktif.
  - Kartu ringkasan order (masuk, selesai, terlambat, belum lunas).
  - Shortcut status order.
- Pesanan:
  - Filter status seperti referensi.
  - Search invoice/customer.
  - Empty state ilustratif.
- Akun:
  - Menu list operasional (read-only dulu) sebagai entry point.
- Target outcome:
  - User dapat kerja harian dari 1 flow tanpa bolak-balik screen awal.

### Fase 2 (Master Data Mobile)
- Pelanggan:
  - List + search + create + edit + archive/restore.
- Layanan/Produk:
  - List + archive/restore (owner/admin).
- Pegawai:
  - List + archive/restore (owner/admin).
- Outlet:
  - List outlet yang boleh diakses user.
- Target outcome:
  - Data master inti bisa dikelola dari mobile.

### Fase 3 (Finance + Nota + Utility)
- Kelola Keuangan:
  - Entry pendapatan/pengeluaran.
  - Kategori dan cashbox dasar.
- Printer & Nota:
  - Profil nota.
  - Nomor nota default/custom.
- Bantuan & Informasi:
  - FAQ, kontak, kebijakan, tentang aplikasi.
- Target outcome:
  - Operasional non-order juga bisa dikerjakan dari mobile.

### Fase 4 (Polish + Advanced)
- Biometric login.
- Role-based menu visibility (owner/admin/cashier/worker/courier).
- WA feature gate di menu akun (sesuai plan tenant).
- Performance pass (cache list, pagination, skeleton loading).
- Target outcome:
  - UX matang, cepat, dan sesuai batasan role/plan.

## 6) Mapping Fitur Ke API Existing
- Auth:
  - `POST /api/auth/login`
  - `GET /api/me`
  - `POST /api/auth/logout`
- Order:
  - `GET /api/orders`
  - `GET /api/orders/{id}`
  - `POST /api/orders/{id}/status/laundry`
  - `POST /api/orders/{id}/status/courier`
- Pelanggan:
  - `GET /api/customers`
  - `POST /api/customers`
  - `PATCH /api/customers/{id}`
  - `DELETE /api/customers/{id}`
  - `POST /api/customers/{id}/restore`
- Master data:
  - `GET /api/services`
  - `DELETE /api/services/{id}`
  - `POST /api/services/{id}/restore`
  - `DELETE /api/users/{id}`
  - `POST /api/users/{id}/restore`
  - `DELETE /api/outlets/{id}`
  - `POST /api/outlets/{id}/restore`
- Billing/WA:
  - `GET /api/billing/quota`
  - `GET /api/wa/providers`
  - `GET /api/wa/messages`

Catatan:
- Beberapa layar referensi (printer/nota, sebagian finance utility) mungkin butuh endpoint tambahan backend bila ingin full parity.

## 7) Rencana Tampilan (UI Direction)
- Design tokens:
  - Primary: biru gradien.
  - Accent: cyan/teal.
  - Surface: putih dan abu sangat terang.
  - Status: success/warning/danger dengan kontras tinggi.
- Komponen inti:
  - App header dengan greeting + outlet.
  - Stat card horizontal.
  - Shortcut icon grid 2x3.
  - Segmented status tab.
  - List tile dengan badge status.
  - Bottom nav tinggi dengan tombol tengah `+`.
- Prinsip UX:
  - Maksimal 2 tap ke aksi utama.
  - State lengkap: loading, empty, error, success.
  - Role-limited actions harus disabled/hidden dengan pesan jelas.

## 8) Prioritas Implementasi Minggu Ini
1. Refactor navigation ke bottom tab 5 menu.
2. Samakan struktur `Beranda` + `Pesanan` dengan referensi.
3. Tambah halaman `Akun` sebagai hub menu manajemen.
4. Tambah `Pelanggan` (list + create minimal) sebagai modul pertama dari menu akun.

## 9) Definition of Done Per Modul
- Typecheck lulus (`npm run typecheck`).
- Error handling network konsisten.
- Role guard di UI sesuai data `/api/me`.
- Uji manual:
  - Login -> pilih outlet -> lihat dashboard -> buka pesanan -> buka detail -> update status.
  - Menu akun bisa membuka halaman turunan tanpa crash.
