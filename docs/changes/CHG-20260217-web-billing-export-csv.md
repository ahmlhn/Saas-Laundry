# CHG-20260217-web-billing-export-csv

## Header
- Change ID: `CHG-20260217-web-billing-export-csv`
- Status: `done`
- Date: `2026-02-17`
- Owner: `codex`
- Related Ticket: `WEB-MGMT-BILLING-002`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Halaman Billing & Kuota belum memiliki kemampuan export untuk kebutuhan laporan operasional.
- Solusi yang dilakukan: Menambahkan endpoint export CSV untuk dataset `outlets` dan `usage`, plus tombol export langsung di halaman billing.
- Dampak bisnis/user: Owner/admin dapat unduh ringkasan billing periodik tanpa salin data manual.

## 2) Scope
- In scope:
  - Route web export billing.
  - Method controller untuk stream CSV.
  - Tombol export di halaman Billing & Kuota.
  - Feature test untuk validasi scope export admin/owner.
- Out of scope:
  - Export XLSX/PDF.
  - Scheduler laporan otomatis.

## 3) Acceptance Criteria
1. User owner/admin bisa export CSV dari halaman billing.
2. Export `outlets` mengikuti scope outlet user.
3. Export `usage` menampilkan data riwayat kuota sesuai periode.
4. Terdapat coverage test untuk kedua skenario.

## 4) Implementasi Teknis
- Pendekatan: Reuse komputasi data billing via helper internal agar UI dan CSV konsisten.
- Keputusan teknis penting: CSV dibuat streaming (`streamDownload`) dan diberi UTF-8 BOM untuk kompatibilitas spreadsheet.
- Trade-off: Dataset export difokuskan dua tipe (`outlets`, `usage`) untuk menjaga format tetap sederhana.

## 5) File yang Diubah
- `routes/web.php`
- `app/Http/Controllers/Web/BillingController.php`
- `resources/views/web/billing/index.blade.php`
- `tests/Feature/WebPanelTest.php`
- `docs/changes/CHG-20260217-web-billing-export-csv.md`

## 6) Dampak API/DB/Config
- API changes: tidak ada endpoint API publik baru.
- DB migration: tidak ada.
- Env/config changes: tidak ada.
- Backward compatibility: additive.

## 7) Testing dan Validasi
- Unit test: n/a.
- Integration test:
  - `php artisan test --testsuite=Feature --filter=WebPanelTest` -> pass (`48 passed`).
  - `php artisan test` -> pass (`97 passed`).
- Build:
  - `npm run build` -> pass.
- Hasil: lulus.

## 8) Risiko dan Mitigasi
- Risiko utama: file CSV besar untuk tenant dengan transaksi tinggi.
- Mitigasi: gunakan filter periode dan dataset spesifik saat export.

## 9) Rollback Plan
- Hapus route/action export billing dan tombol export di halaman billing.

## 10) Changelog Singkat
- `2026-02-17 17:02` - Implementasi awal export CSV billing (`outlets`, `usage`) dibuat.
- `2026-02-17 17:12` - Validasi test/build selesai, dokumen perubahan ditutup `done`.
