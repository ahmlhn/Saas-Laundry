# Laravel 13 Upgrade Checklist

Checklist ini merekam status upgrade repo `saas-laundry` ke Laravel 13 per `2026-03-19`.

## Snapshot Repo Saat Ini
- Constraint `composer.json`:
  - `php ^8.3`
  - `laravel/framework ^13.0`
  - `laravel/sanctum ^4.3.1`
  - `laravel/tinker ^3.0`
  - `phpunit/phpunit ^12.0`
- Versi terpasang saat verifikasi:
  - `laravel/framework v13.1.1`
  - `laravel/sanctum v4.3.1`
  - `laravel/tinker v3.0.0`
  - `nunomaduro/collision v8.9.1`
  - `phpunit/phpunit 12.5.14`
- PHP lokal saat audit: `8.4.17`
- PHP CI saat audit: `8.4` di [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)
- Queue utama: `database`, queue aplikasi khusus `messaging`
- Worktree masih kotor karena ada perubahan aktif non-upgrade di area `mobile/`, `package.json`, beberapa view web, dan dokumen lain

## Status
- [x] Fase 1: baseline Laravel 12 dinaikkan ke patch terbaru dan distabilkan
- [x] Fase 2: constraint Composer dinaikkan ke Laravel 13 dan dependency tree berhasil di-resolve
- [x] Referensi CSRF langsung di `config/sanctum.php` dipindahkan ke `PreventRequestForgery`
- [x] Hardening cache `serializable_classes` ditambahkan ke `config/cache.php`
- [x] Verifikasi otomatis lulus:
  - `composer validate --no-check-publish`
  - `php artisan optimize:clear`
  - `php artisan test`
  - `php artisan ops:readiness:check`
  - `npm run build`
- [ ] Environment staging/production terkonfirmasi memakai PHP `8.3+`
- [ ] Smoke test pasca-deploy tenant web, platform web, API/mobile, dan queue WA selesai
- [ ] Refactor opsional queue `messaging` ke `Queue::route(...)` selesai

## Hasil Eksekusi
- `composer.json` diperbarui ke target Laravel 13:
  - `php ^8.3`
  - `laravel/framework ^13.0`
  - `laravel/sanctum ^4.3.1`
  - `laravel/tinker ^3.0`
  - `laravel/pail ^1.2.5`
  - `laravel/pint ^1.27`
  - `phpunit/phpunit ^12.0`
- `composer update ... --with-all-dependencies` berhasil dan mengangkat framework ke `v13.1.1`
- `config/cache.php` sekarang menetapkan `serializable_classes => false`
- `config/sanctum.php` sekarang merujuk ke `Illuminate\Foundation\Http\Middleware\PreventRequestForgery::class`
- README dan dokumen arsitektur utama sekarang menyebut Laravel 13 / PHP 8.3+

## Ringkasan Risiko Saat Ini
- Risiko kode aplikasi: `rendah`
  - Tidak ditemukan `Route::domain(...)`
  - Tidak ditemukan custom cache store / queue driver / cache contract implementation
  - Tidak ditemukan listener `QueueBusy` / `JobAttempted` yang perlu dimigrasi
- Risiko operasional: `sedang`
  - Server production wajib PHP `8.3+`
  - Worktree aktif masih bercampur dengan perubahan non-upgrade
- Risiko follow-up: `rendah`
  - Queue assignment `messaging` masih manual di beberapa titik; ini bukan blocker upgrade, tapi kandidat cleanup

## Repo-Specific Follow-Up
- Queue `messaging` masih dipanggil manual di beberapa tempat:
  - `app/Domain/Messaging/WaDispatchService.php`
  - `app/Jobs/SendWaMessageJob.php`
  - `app/Console/Commands/RedriveFailedWaMessagesCommand.php`
- Routing tenant web di `bootstrap/app.php` tidak memakai route domain; risiko perubahan precedence route domain Laravel 13 sangat kecil
- CI sudah memakai PHP `8.4`, jadi blocker utama yang tersisa ada di environment deploy dan pemisahan perubahan non-upgrade

## Checklist Sebelum Merge / Deploy

### 0. Hygiene Branch
- [ ] Pisahkan perubahan non-upgrade dari PR/commit upgrade Laravel 13
- [ ] Simpan `composer.lock` hasil final upgrade bersama perubahan config/docs terkait
- [ ] Pastikan tidak ada generated file yang ikut terbawa tanpa sengaja

### 1. Readiness Infra
- [ ] Verifikasi semua server target memakai PHP `8.3+`
- [ ] Verifikasi Composer/server image sanggup meng-install dependency tree Laravel 13
- [ ] Siapkan backup database dan release rollback point

### 2. Verifikasi Fungsional Minimum
- [ ] Web tenant: login, dashboard, create order, add payment, update laundry/courier status
- [ ] Web platform: login, billing/subscription, mobile release page
- [ ] API/mobile: `/api/auth/login`, `/api/me`, `/api/orders`, `/api/sync/push`, `/api/sync/pull`
- [ ] WA: enqueue message, worker `messaging`, redrive failed message

### 3. Opsional Setelah Upgrade
- [ ] Sentralisasi routing queue `messaging` dengan `Queue::route(...)`
- [ ] Review lagi `CACHE_PREFIX`, `REDIS_PREFIX`, dan `SESSION_COOKIE` di production bila ingin nilai eksplisit
- [ ] Tambahkan smoke test staging berbasis script untuk flow order + payment + WA

## Command Reference

```powershell
# audit status upgrade
pwsh -File tools/laravel13-upgrade-preflight.ps1

# lihat apakah masih ada blocker composer untuk Laravel 13 target tertentu
composer why-not laravel/framework 13.1.1

# verifikasi pasca-upgrade
composer validate --no-check-publish
php artisan optimize:clear
php artisan test
php artisan ops:readiness:check
npm run build
```

## Hasil Verifikasi Terakhir
- `composer validate --no-check-publish` -> pass
- `php artisan optimize:clear` -> pass
- `php artisan test` -> pass (`167 tests, 1174 assertions`)
- `php artisan ops:readiness:check` -> pass (`pass=16, warn=0, fail=0`)
- `npm run build` -> pass
  - Catatan: Vite build sukses, tetapi muncul warning `tsconfig.json` tentang `expo/tsconfig.base`; ini berasal dari area mobile/tooling dan bukan blocker Laravel 13 backend

## Rollback
- Siapkan tag/commit sebelum merge upgrade
- Untuk rollback cepat:
  - checkout release/commit sebelum upgrade
  - restore `composer.lock`
  - jalankan `composer install`
  - deploy ulang release sebelumnya
- Jika deploy production dilakukan bersamaan dengan perubahan lain, pisahkan rollback backend Laravel 13 dari rollback UI/mobile
