# CHG-20260217-web-billing-outlet-filter-and-order-export

## Header
- Change ID: `CHG-20260217-web-billing-outlet-filter-and-order-export`
- Status: `done`
- Date: `2026-02-17`
- Owner: `codex`
- Related Ticket: `WEB-MGMT-BILLING-003`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Halaman Billing belum memiliki filter outlet dan export detail transaksi order.
- Solusi yang dilakukan: Menambahkan filter `outlet_id` pada halaman billing serta dataset export baru `orders` untuk CSV detail transaksi.
- Dampak bisnis/user: Owner/admin bisa melakukan drill-down billing per outlet dan mengekspor transaksi detail untuk rekap operasional.

## 2) Scope
- In scope:
  - Filter outlet pada halaman Billing & Kuota.
  - Validasi outlet filter agar tetap dalam scope user.
  - Export CSV dataset `orders` (detail level order).
  - Menjaga export `outlets` dan `usage` mengikuti filter aktif.
  - Feature test untuk filter outlet + order detail export.
- Out of scope:
  - Filter multi-outlet sekaligus.
  - Export XLSX/PDF.

## 3) Acceptance Criteria
1. Halaman billing menerima parameter `outlet_id` yang valid dalam scope user.
2. Ringkasan billing berubah sesuai outlet filter.
3. Export `dataset=orders` menghasilkan CSV detail order sesuai period + outlet filter.
4. Test fitur web panel meliputi skenario filter outlet dan export detail.

## 4) Implementasi Teknis
- Pendekatan: Refactor `BillingController` agar semua dataset (UI + export) berbagi satu pipeline komputasi.
- Keputusan teknis penting: Tambah validasi outlet scope di server untuk mencegah akses lintas outlet via query string.
- Trade-off: Quota snapshot tetap tenant-level walau outlet filter aktif; metrik transaksi tetap outlet-filtered.

## 5) File yang Diubah
- `app/Http/Controllers/Web/BillingController.php`
- `resources/views/web/billing/index.blade.php`
- `tests/Feature/WebPanelTest.php`
- `docs/changes/CHG-20260217-web-billing-outlet-filter-and-order-export.md`

## 6) Dampak API/DB/Config
- API changes: tidak ada.
- DB migration: tidak ada.
- Env/config changes: tidak ada.
- Backward compatibility: additive.

## 7) Testing dan Validasi
- Unit test: n/a.
- Integration test:
  - `php artisan test --testsuite=Feature --filter=WebPanelTest` -> pass (`50 passed`).
  - `php artisan test` -> pass (`99 passed`).
- Build:
  - `npm run build` -> pass.
- Hasil: lulus.

## 8) Risiko dan Mitigasi
- Risiko utama: User salah menafsirkan kuota tenant-level sebagai kuota per outlet.
- Mitigasi: Pertahankan label kuota sebagai snapshot tenant dan gunakan outlet filter hanya untuk metrik transaksi.

## 9) Rollback Plan
- Hapus filter outlet billing dan dataset export `orders`.

## 10) Changelog Singkat
- `2026-02-17 17:28` - Implementasi awal outlet filter billing + export detail order dibuat.
- `2026-02-17 17:37` - Validasi test/build selesai dan dokumentasi perubahan ditutup `done`.
