# CHG-20260217-web-billing-quota-panel

## Header
- Change ID: `CHG-20260217-web-billing-quota-panel`
- Status: `done`
- Date: `2026-02-17`
- Owner: `codex`
- Related Ticket: `WEB-MGMT-BILLING-001`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Panel web belum memiliki halaman khusus billing/quota meski sudah ada endpoint API dan ringkasan terbatas di dashboard.
- Solusi yang dilakukan: Menambahkan halaman `Billing & Kuota` untuk owner/admin berisi snapshot kuota, detail langganan, riwayat 6 bulan, dan ringkasan performa outlet sesuai scope.
- Dampak bisnis/user: Owner/admin dapat memonitor kapasitas kuota dan kondisi tagihan langsung dari web panel tanpa keluar ke API/tool eksternal.

## 2) Scope
- In scope:
  - Route web `GET /t/{tenant}/billing`.
  - Controller web billing dengan validasi period (`Y-m`) dan scope outlet.
  - Sidebar navigation ke halaman billing.
  - View billing & kuota dengan metrik periodik.
  - Feature test coverage untuk akses dan scope outlet.
- Out of scope:
  - Perubahan proses upgrade/downgrade paket.
  - Integrasi payment gateway.

## 3) Acceptance Criteria
1. Owner/admin bisa membuka halaman billing dari panel web.
2. Halaman menampilkan data kuota untuk periode yang dipilih.
3. Ringkasan outlet hanya menampilkan outlet sesuai scope user.
4. Ada validasi test untuk skenario admin vs owner.

## 4) Implementasi Teknis
- Pendekatan: Reuse `QuotaService::snapshot` untuk kuota periodik, lalu gabungkan data orders/payments/subscription pada controller web.
- Keputusan teknis penting: Riwayat 6 bulan dihitung dalam aplikasi (grouping collection) agar aman lintas engine DB.
- Trade-off: Perhitungan riwayat saat ini berbasis query raw data periodik; untuk data sangat besar bisa dipindah ke materialized summary.

## 5) File yang Diubah
- `routes/web.php`
- `app/Http/Controllers/Web/BillingController.php`
- `resources/views/web/layouts/app.blade.php`
- `resources/views/web/billing/index.blade.php`
- `tests/Feature/WebPanelTest.php`
- `docs/changes/CHG-20260217-web-billing-quota-panel.md`

## 6) Dampak API/DB/Config
- API changes: tidak ada endpoint API baru.
- DB migration: tidak ada.
- Env/config changes: tidak ada.
- Backward compatibility: additive pada route dan UI web.

## 7) Testing dan Validasi
- Unit test: n/a.
- Integration test:
  - `php artisan test --testsuite=Feature --filter=WebPanelTest` -> pass (`46 passed`).
  - `php artisan test` -> pass (`95 passed`).
- Build:
  - `npm run build` -> pass.
- Hasil: lulus.

## 8) Risiko dan Mitigasi
- Risiko utama: Data billing disalahartikan sebagai real-time invoice finance final.
- Mitigasi: Label metrik difokuskan pada kuota operasional + payment masuk per periode.

## 9) Rollback Plan
- Hapus route/controller/view billing web dan menu sidebar terkait.

## 10) Changelog Singkat
- `2026-02-17 16:35` - Implementasi awal route, controller, view, menu, dan test billing web dibuat.
- `2026-02-17 16:49` - Validasi test suite + build selesai, dokumen ditutup ke status `done`.
