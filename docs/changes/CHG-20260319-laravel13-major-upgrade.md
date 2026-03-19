# CHG-20260319-laravel13-major-upgrade

## Header
- Change ID: `CHG-20260319-laravel13-major-upgrade`
- Status: `done`
- Date: `2026-03-19`
- Owner: `codex`
- Related Ticket: `OPS-013, BE-015`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Repo perlu benar-benar dinaikkan dari Laravel 12 ke Laravel 13 setelah baseline 12.x dibersihkan dan tervalidasi.
- Solusi yang dilakukan: Bump constraint Composer ke line Laravel 13, resolve dependency tree baru, sinkronkan config yang berubah di Laravel 13, perbarui dokumen utama, lalu jalankan verifikasi otomatis end-to-end.
- Dampak bisnis/user: Backend sekarang berjalan di Laravel 13 dengan runtime minimum PHP 8.3, tanpa regresi yang terdeteksi pada suite test dan readiness check lokal.

## 2) Scope
- In scope:
  - Update `composer.json` dan `composer.lock` ke Laravel 13
  - Penyesuaian config repo-spesifik untuk compatibility Laravel 13
  - Update dokumentasi utama agar sesuai runtime baru
  - Verifikasi otomatis backend dan build frontend
- Out of scope:
  - Perubahan fitur bisnis baru
  - Refactor opsional routing queue `messaging`
  - Deploy ke staging/production

## 3) Acceptance Criteria
1. Framework dan paket inti berhasil naik ke line Laravel 13 yang kompatibel.
2. Aplikasi tetap bisa bootstrap dan test suite penuh lulus.
3. Readiness check dan build dasar lulus setelah upgrade.
4. Dokumentasi utama mencerminkan requirement runtime baru.

## 4) Implementasi Teknis
- Pendekatan:
  - Mengubah constraint Composer ke target Laravel 13 sesuai upgrade guide resmi.
  - Menjalankan `composer update ... --with-all-dependencies` agar tree dependency terselesaikan konsisten.
  - Merapikan config repo yang memang disentuh di upgrade guide: CSRF middleware dan cache unserialize hardening.
  - Menjalankan verifikasi otomatis penuh sebelum menutup pekerjaan.
- Keputusan teknis penting:
  - `config/sanctum.php` sekarang memakai `PreventRequestForgery::class` agar tidak bergantung pada alias deprecated.
  - `config/cache.php` sekarang menetapkan `serializable_classes => false` untuk mengikuti hardening Laravel 13.
  - Constraint `php` dinaikkan ke `^8.3`, sesuai requirement minimum Laravel 13 dan PHPUnit 12.
- Trade-off:
  - Queue `messaging` masih memakai `onQueue('messaging')` manual; ini sengaja tidak disentuh dalam batch major upgrade agar perubahan tetap sempit.

## 5) File yang Diubah
- `composer.json`
- `composer.lock`
- `config/cache.php`
- `config/sanctum.php`
- `README.md`
- `docs/LARAVEL_13_UPGRADE_CHECKLIST.md`
- `docs/SYNC_API_CONTRACT.md`
- `docs/SAAS_LAUNDRY_BLUEPRINT.md`
- `docs/IMPLEMENTATION_SPECS.md`
- `tools/laravel13-upgrade-preflight.ps1`
- `docs/changes/CHG-20260319-laravel13-major-upgrade.md`

## 6) Dampak API/DB/Config
- API changes:
  - Tidak ada perubahan kontrak API yang disengaja dari batch ini.
- DB migration:
  - Tidak ada migration baru.
- Env/config changes:
  - Runtime minimum PHP sekarang `8.3+`.
  - `config/cache.php` menambah `serializable_classes => false`.
  - `config/sanctum.php` memakai `PreventRequestForgery`.
- Backward compatibility:
  - Kompatibel untuk aplikasi yang dideploy di PHP `8.3+`.
  - Server dengan PHP `8.2` tidak lagi memenuhi requirement.

## 7) Testing dan Validasi
- Automated verification:
  - `composer validate --no-check-publish` -> pass
  - `php artisan optimize:clear` -> pass
  - `php artisan test` -> pass (`167 tests, 1174 assertions`)
  - `php artisan ops:readiness:check` -> pass
  - `npm run build` -> pass
- Manual verification:
  - Preflight script dijalankan ulang untuk memastikan versi paket, pattern scan, dan next actions konsisten dengan state Laravel 13.
- Hasil:
  - Upgrade Laravel 13 tervalidasi di lokal dan siap dibawa ke staging/deploy checklist.

## 8) Risiko dan Mitigasi
- Risiko utama:
  - Environment production yang masih PHP 8.2 akan gagal menjalankan release baru.
  - Worktree saat ini masih bercampur dengan perubahan non-upgrade lain.
- Mitigasi:
  - Verifikasi requirement PHP dilakukan eksplisit di checklist dan preflight.
  - Pisahkan upgrade Laravel 13 ke branch/commit yang bersih sebelum merge atau deploy.

## 9) Rollback Plan
- Langkah rollback jika gagal:
  - Revert commit perubahan major upgrade ini.
  - Restore `composer.lock` ke baseline Laravel 12.
  - Jalankan `composer install`.
  - Deploy ulang release sebelumnya.

## 10) Changelog Singkat
- `2026-03-19 23:58` - Constraint Composer dinaikkan ke Laravel 13 / PHP 8.3 / PHPUnit 12.
- `2026-03-20 00:06` - Dependency tree Laravel 13 berhasil di-resolve sampai `laravel/framework v13.1.1`.
- `2026-03-20 00:12` - Config CSRF dan cache disinkronkan dengan perubahan Laravel 13.
- `2026-03-20 00:20` - Test suite, readiness check, dan build lulus; dokumentasi utama diperbarui.
