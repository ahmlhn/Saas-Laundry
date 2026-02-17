# CHG-20260217-web-billing-partial-and-aging-report

## Header
- Change ID: `CHG-20260217-web-billing-partial-and-aging-report`
- Status: `done`
- Date: `2026-02-17`
- Owner: `codex`
- Related Ticket: `WEB-MGMT-BILLING-005`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Billing panel belum punya status pembayaran `partial` terpisah dan belum ada laporan invoice aging.
- Solusi yang dilakukan: Menambahkan filter `partial`, memperjelas definisi `unpaid`, menambah panel invoice aging, dan export CSV dataset `aging`.
- Dampak bisnis/user: Admin/owner bisa memonitor piutang lebih presisi dan memisahkan order bayar sebagian dari order belum bayar.

## 2) Scope
- In scope:
  - Filter payment status ditingkatkan menjadi `paid`, `partial`, `unpaid`.
  - Laporan invoice aging berbasis bucket umur piutang.
  - Export CSV aging dataset.
  - Test coverage filter + aging report/export.
- Out of scope:
  - Notifikasi otomatis penagihan berdasarkan aging.
  - Dashboard grafik aging lintas periode.

## 3) Acceptance Criteria
1. Filter `partial` tersedia dan berfungsi di halaman billing.
2. `unpaid` hanya mencakup order dengan `paid_amount = 0` dan `due_amount > 0`.
3. Halaman billing menampilkan ringkasan aging (`0-7`, `8-14`, `15-30`, `>30` hari).
4. Export `dataset=aging` menghasilkan CSV yang sesuai filter aktif.

## 4) Implementasi Teknis
- Pendekatan: Menambah helper filter status pembayaran yang reusable untuk seluruh query billing.
- Keputusan teknis penting: Aging dihitung dari order outstanding (`due_amount > 0`) dalam scope filter outlet/payment status.
- Trade-off: Aging berbasis umur sejak `created_at` order, bukan tanggal jatuh tempo khusus.

## 5) File yang Diubah
- `app/Http/Controllers/Web/BillingController.php`
- `resources/views/web/billing/index.blade.php`
- `tests/Feature/WebPanelTest.php`
- `docs/changes/CHG-20260217-web-billing-partial-and-aging-report.md`

## 6) Dampak API/DB/Config
- API changes: tidak ada.
- DB migration: tidak ada.
- Env/config changes: tidak ada.
- Backward compatibility: additive.

## 7) Testing dan Validasi
- Unit test: n/a.
- Integration test:
  - `php artisan test --testsuite=Feature --filter=WebPanelTest` -> pass (`54 passed`).
  - `php artisan test` -> pass (`103 passed`).
- Build:
  - `npm run build` -> pass.
- Hasil: lulus.

## 8) Risiko dan Mitigasi
- Risiko utama: Definisi `partial` dan `unpaid` bisa disalahpahami user.
- Mitigasi: Label UI diperjelas (`Sebagian`, `Belum Bayar`) dan filter aktif ditampilkan pada halaman.

## 9) Rollback Plan
- Kembalikan filter status ke dua nilai (`paid`, `unpaid`) dan hapus panel/export aging.

## 10) Changelog Singkat
- `2026-02-17 18:14` - Implementasi awal partial payment filter + invoice aging report selesai.
- `2026-02-17 18:20` - Validasi test/build selesai dan change doc ditutup `done`.
