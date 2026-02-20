# CHG-20260220-mobile-phase1-tab-layout-and-ops-hub

## Header
- Change ID: `CHG-20260220-mobile-phase1-tab-layout-and-ops-hub`
- Status: `done`
- Date: `2026-02-20`
- Owner: `codex`
- Related Ticket: `MOB-003`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Struktur mobile sebelumnya belum mengikuti pola referensi video (bottom tab 5 menu) dan belum punya halaman hub akun/laporan/quick action.
- Solusi yang dilakukan: Refactor navigation menjadi root stack + bottom tabs, menambahkan tab `Beranda`, `Pesanan`, `+`, `Laporan`, `Akun`, menyelaraskan layout beranda + pesanan dengan pola referensi, serta menambah halaman placeholder operasional untuk fase lanjutan.
- Dampak bisnis/user: Flow aplikasi lebih konsisten dengan ekspektasi pengguna operasional laundry dan lebih siap untuk penambahan modul transaksi/master data berikutnya.

## 2) Scope
- In scope:
  - Tambah dependency `@react-navigation/bottom-tabs`.
  - Refactor navigator:
    - Root stack: `OutletSelect` / `MainTabs`.
    - Orders stack: `OrdersToday` + `OrderDetail`.
  - Implementasi tab:
    - `Beranda` (ringkasan + shortcut status).
    - `Pesanan` (status bucket + search + list).
    - `Quick Action` (placeholder).
    - `Laporan` (snapshot sederhana).
    - `Akun` (hub menu operasional).
  - Persist outlet aktif tetap dipakai dari perubahan sebelumnya.
- Out of scope:
  - CRUD transaksi penuh dari mobile.
  - Integrasi menu akun ke seluruh modul backend.
  - Biometric login.

## 3) Acceptance Criteria
1. User login dapat masuk ke struktur 5 bottom tab.
2. Pesanan dapat difilter dengan kategori status operasional.
3. Detail order tetap bisa dibuka dari daftar pesanan.
4. TypeScript compile lulus tanpa error.

## 4) Implementasi Teknis
- Pendekatan:
  - Memecah navigation menjadi beberapa level agar scalable untuk fase berikutnya.
  - Menambahkan util status bucket agar beranda dan pesanan memakai klasifikasi yang konsisten.
  - Menambahkan screen placeholder untuk area yang belum diimplementasikan penuh.
- Keputusan teknis penting:
  - `OrdersTab` memakai nested stack agar `OrderDetail` tetap natural dengan back navigation.
  - `OutletSelect` tetap jadi gate berdasarkan state session.
  - Route param `initialBucket` dipakai untuk shortcut status dari beranda ke pesanan.
- Trade-off:
  - Icon tab sementara masih berbasis teks sederhana, belum memakai icon set final.
  - Beberapa menu akun masih non-interaktif (placeholder) sampai fase lanjutan.

## 5) File yang Diubah
- `mobile/package.json`
- `mobile/package-lock.json`
- `mobile/src/navigation/AppNavigator.tsx`
- `mobile/src/navigation/types.ts`
- `mobile/src/features/orders/orderBuckets.ts`
- `mobile/src/screens/app/HomeDashboardScreen.tsx`
- `mobile/src/screens/app/OrdersTodayScreen.tsx`
- `mobile/src/screens/app/OrderDetailScreen.tsx`
- `mobile/src/screens/app/OutletSelectScreen.tsx`
- `mobile/src/screens/app/QuickActionScreen.tsx`
- `mobile/src/screens/app/ReportsScreen.tsx`
- `mobile/src/screens/app/AccountHubScreen.tsx`
- `docs/changes/CHG-20260220-mobile-phase1-tab-layout-and-ops-hub.md`

## 6) Dampak API/DB/Config
- API changes: tidak ada endpoint baru; tetap konsumsi endpoint existing.
- DB migration: tidak ada.
- Env/config changes: tidak ada variabel env baru.
- Backward compatibility: additive untuk mobile client, backend existing tidak berubah.

## 7) Testing dan Validasi
- Typecheck:
  - `cd mobile && npm run typecheck` -> lulus.
- Manual verification yang disarankan:
  - Login -> pilih outlet -> pastikan tampil 5 tab.
  - Beranda -> tap shortcut status -> terbuka tab Pesanan dengan filter sesuai.
  - Pesanan -> buka detail order -> update status -> kembali ke list.
  - Akun -> tombol `Ganti Outlet` mengembalikan ke layar pilih outlet.

## 8) Risiko dan Mitigasi
- Risiko utama: mapping bucket status belum 100% sama proses bisnis semua tenant.
- Mitigasi:
  - Mapping dipusatkan di `orderBuckets.ts` agar mudah di-tuning tanpa ubah banyak screen.
  - QA manual dengan data order nyata tenant untuk validasi terminologi status.

## 9) Rollback Plan
- Revert commit perubahan fase ini, kembali ke navigator stack lama (`OutletSelect/HomeDashboard/OrdersToday/OrderDetail`).

## 10) Changelog Singkat
- `2026-02-20` - Refactor navigation ke root stack + bottom tabs.
- `2026-02-20` - Beranda/pesanan disejajarkan dengan pola video reference.
- `2026-02-20` - Tambah halaman `Quick Action`, `Laporan`, dan `Akun` sebagai hub fase awal.
