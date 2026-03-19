# CHG-20260319-laravel12-latest-baseline-for-l13

## Header
- Change ID: `CHG-20260319-laravel12-latest-baseline-for-l13`
- Status: `done`
- Date: `2026-03-19`
- Owner: `codex`
- Related Ticket: `OPS-013, BE-014`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Sebelum menaikkan repo ke Laravel 13, baseline Laravel 12 harus dibersihkan ke patch terbaru agar regresi lebih mudah diisolasi.
- Solusi yang akan/dilakukan: Update dependency di line Laravel 12 terbaru, sinkronkan test yang stale dengan behavior aplikasi saat ini, dan verifikasi suite penuh.
- Dampak bisnis/user: Repo kini berada di baseline Laravel 12 yang lebih mutakhir dan tervalidasi, sehingga langkah ke Laravel 13 menjadi lebih kecil dan lebih aman.

## 2) Scope
- In scope:
  - Update dependency Laravel 12 line terbaru
  - Sinkronisasi test yang tidak lagi cocok dengan rule bisnis saat ini
  - Verifikasi readiness + full test suite
- Out of scope:
  - Bump major ke Laravel 13
  - Perubahan requirement runtime production ke PHP 8.3

## 3) Acceptance Criteria
1. Framework dan paket pendukung di line Laravel 12 naik ke versi terbaru yang kompatibel.
2. Full test suite lulus setelah update dependency.
3. Checklist upgrade Laravel 13 diperbarui agar merefleksikan baseline baru.

## 4) Implementasi Teknis
- Pendekatan:
  - Menjalankan `composer update` terbatas pada paket Laravel 12 line dan tool dev yang kompatibel.
  - Menemukan failure test pasca-update lalu membedakan antara bug aplikasi dan test stale.
  - Memperbaiki satu bug validasi `display_unit` di `ServiceCatalogController` serta merapikan test yang tidak sinkron.
- Keputusan teknis penting:
  - `ServiceCatalogController` sekarang menerima `display_unit = satuan`, sesuai migration dan data seed.
  - Test UAT disesuaikan dengan guard terbaru yang mewajibkan pembayaran lunas sebelum status `delivered`.
  - Fixture `WebPanelTest` diberi `OrderItem` agar konsisten dengan guard item-required pada perubahan status laundry.
- Trade-off:
  - `composer.json` belum dinaikkan ke Laravel 13; itu sengaja dipisah ke fase berikutnya.

## 5) File yang Diubah
- `composer.lock`
- `app/Http/Controllers/Api/ServiceCatalogController.php`
- `tests/Feature/ExampleTest.php`
- `tests/Feature/UatOperationalFlowTest.php`
- `tests/Feature/WaApiTest.php`
- `tests/Feature/WebPanelTest.php`
- `docs/LARAVEL_13_UPGRADE_CHECKLIST.md`
- `docs/changes/CHG-20260319-laravel12-latest-baseline-for-l13.md`

## 6) Dampak API/DB/Config
- API changes:
  - Validasi `display_unit` untuk service API kini menerima `satuan`.
- DB migration:
  - Tidak ada migration baru.
- Env/config changes:
  - Tidak ada perubahan config runtime aplikasi.
- Backward compatibility:
  - Aman di line Laravel 12; perubahan utamanya ada pada dependency patch/minor dan sinkronisasi test.

## 7) Testing dan Validasi
- Unit test:
  - Termasuk dalam suite penuh.
- Integration test:
  - `php artisan ops:readiness:check` -> pass
  - `php artisan test` -> pass (`167 tests, 1174 assertions`)
- Manual verification:
  - Local MariaDB/XAMPP diaktifkan agar suite MySQL test bisa berjalan.
  - Database `saas_laundry_test` di-reset sebelum menjalankan suite penuh.
- Hasil:
  - Baseline Laravel 12 terbaru tervalidasi dan siap dipakai sebagai pijakan upgrade ke Laravel 13.

## 8) Risiko dan Mitigasi
- Risiko utama:
  - Suite test bergantung pada MySQL lokal aktif; jika service mati, hasil akan false negative.
- Mitigasi:
  - Verifikasi dilakukan dengan database test yang di-reset bersih dan MariaDB aktif selama run.

## 9) Rollback Plan
- Langkah rollback jika gagal:
  - Revert `composer.lock` ke commit sebelum update dependency.
  - Revert perubahan test/controller pada change ini.
  - Jalankan `composer install` ulang.

## 10) Changelog Singkat
- `2026-03-19 23:05` - Dependency Laravel 12 line dinaikkan ke patch terbaru yang kompatibel.
- `2026-03-19 23:20` - Verifikasi test menemukan beberapa test stale dan satu bug validasi `display_unit`.
- `2026-03-19 23:55` - Bug/test disinkronkan; suite penuh lulus dan checklist upgrade Laravel 13 diperbarui.
