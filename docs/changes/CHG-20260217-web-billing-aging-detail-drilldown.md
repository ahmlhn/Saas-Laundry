# CHG-20260217-web-billing-aging-detail-drilldown

## Header
- Change ID: `CHG-20260217-web-billing-aging-detail-drilldown`
- Status: `done`
- Date: `2026-02-17`
- Owner: `codex`
- Related Ticket: `WEB-MGMT-BILLING-006`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Laporan aging baru tersedia di level ringkasan bucket, belum ada drill-down order per bucket.
- Solusi yang dilakukan: Menambahkan filter `aging_bucket`, tabel detail invoice aging per order, dan export CSV dataset `aging_details`.
- Dampak bisnis/user: Tim operasional bisa langsung menindaklanjuti order outstanding berdasarkan umur piutang yang spesifik.

## 2) Scope
- In scope:
  - Filter `aging_bucket` pada halaman billing.
  - Tabel detail invoice aging (order level).
  - Export CSV detail aging (`dataset=aging_details`).
  - Test coverage untuk filter dan export detail aging.
- Out of scope:
  - Workflow reminder otomatis per bucket.
  - Assignment collection agent.

## 3) Acceptance Criteria
1. User dapat memilih bucket aging pada filter billing.
2. Detail aging menampilkan order outstanding sesuai bucket terpilih.
3. Export detail aging mengikuti filter outlet, payment status, dan bucket.
4. Coverage test tersedia untuk skenario filter + export detail.

## 4) Implementasi Teknis
- Pendekatan: Reuse pipeline billing lalu menambahkan derivasi `agingOrderDetails` berbasis order outstanding.
- Keputusan teknis penting: Ringkasan aging akan mengikuti bucket terpilih (jika ada) agar angka header/detail tetap konsisten.
- Trade-off: Perhitungan umur tetap berbasis `created_at` order.

## 5) File yang Diubah
- `app/Http/Controllers/Web/BillingController.php`
- `resources/views/web/billing/index.blade.php`
- `tests/Feature/WebPanelTest.php`
- `docs/changes/CHG-20260217-web-billing-aging-detail-drilldown.md`

## 6) Dampak API/DB/Config
- API changes: tidak ada.
- DB migration: tidak ada.
- Env/config changes: tidak ada.
- Backward compatibility: additive.

## 7) Testing dan Validasi
- Unit test: n/a.
- Integration test:
  - `php artisan test --testsuite=Feature --filter=WebPanelTest` -> pass (`56 passed`).
  - `php artisan test` -> pass (`105 passed`).
- Build:
  - `npm run build` -> pass.
- Hasil: lulus.

## 8) Risiko dan Mitigasi
- Risiko utama: User salah membaca angka jika bucket filter aktif.
- Mitigasi: Label filter aktif ditampilkan pada halaman dan export mengikuti filter aktif.

## 9) Rollback Plan
- Hapus `aging_bucket`, tabel detail aging, dan dataset export `aging_details`.

## 10) Changelog Singkat
- `2026-02-17 18:37` - Implementasi awal aging detail drill-down dibuat.
- `2026-02-17 18:45` - Validasi test/build selesai dan change doc ditutup `done`.
