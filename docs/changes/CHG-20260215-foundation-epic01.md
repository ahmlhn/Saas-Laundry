# CHG-20260215-foundation-epic01

## Header
- Change ID: `CHG-20260215-foundation-epic01`
- Status: `done`
- Date: `2026-02-15`
- Owner: `codex`
- Related Ticket: `BE-001, BE-002, BE-003, BE-004`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Memulai implementasi EPIC-01 (foundation & tenant access) dari repo yang masih dokumen-only.
- Solusi yang akan/dilakukan: Bootstrap Laravel 12, menyiapkan auth API dasar, RBAC awal, scoping tenant-outlet, dan metadata logging.
- Dampak bisnis/user: Menjadi fondasi untuk semua fitur order/sync/WA di sprint berikutnya.

## 2) Scope
- In scope:
  - Setup Laravel app
  - Migration dasar tenant/outlet/role/pivot
  - Endpoint auth/me
  - Outlet scope middleware/policy dasar
  - Request metadata logging dasar
- Out of scope:
  - Sync API penuh
  - Invoice lease
  - WA messaging
  - Web dashboard lengkap

## 3) Acceptance Criteria
1. API login/logout/me berfungsi dengan auth token.
2. Struktur tabel foundation EPIC-01 tersedia dan dapat di-seed.
3. Akses outlet yang tidak di-assign ditolak.
4. Request metadata terekam di log untuk endpoint API.

## 4) Implementasi Teknis
- Pendekatan: Laravel API-first dengan Sanctum token, middleware untuk context metadata, dan policy/middleware outlet access.
- Keputusan teknis penting: Gunakan Sanctum sesuai rekomendasi DEC-002.
- Trade-off: Implementasi RBAC granular disederhanakan dulu ke level role key + outlet scope untuk akselerasi MVP awal.

## 5) File yang Diubah
- `bootstrap/app.php`
- `routes/api.php`
- `app/Http/Controllers/Api/AuthController.php`
- `app/Http/Middleware/AttachRequestContext.php`
- `app/Http/Middleware/EnsureOutletAccess.php`
- `app/Models/User.php`
- `app/Models/Tenant.php`
- `app/Models/Outlet.php`
- `app/Models/Role.php`
- `app/Models/Plan.php`
- `app/Models/TenantSubscription.php`
- `app/Models/QuotaUsage.php`
- `database/migrations/2026_02_15_170000_create_foundation_access_tables.php`
- `database/migrations/2026_02_15_170100_add_foundation_columns_to_users_table.php`
- `database/seeders/DatabaseSeeder.php`
- `database/seeders/RolesAndPlansSeeder.php`
- `database/seeders/DemoTenantSeeder.php`
- `database/factories/UserFactory.php`
- `tests/Feature/AuthApiTest.php`
- Bootstrap Laravel 12 skeleton files (`app/`, `config/`, `public/`, `resources/`, `tests/`, `composer.json`, dll.) sebagai baseline project.

## 6) Dampak API/DB/Config
- API changes:
  - `POST /api/auth/login`
  - `POST /api/auth/logout` (auth:sanctum)
  - `GET /api/me` (auth:sanctum + outlet scope middleware)
- DB migration:
  - tambah tabel: `plans`, `tenants`, `outlets`, `roles`, `user_roles`, `user_outlets`, `tenant_subscriptions`, `quota_usage`
  - tambah kolom `users`: `tenant_id`, `phone`, `status`
  - tambah table Sanctum: `personal_access_tokens`
- Env/config changes:
  - install Sanctum dependency
  - testing default SQLite gagal tanpa `pdo_sqlite`; validasi test dijalankan via MySQL env override
- Backward compatibility: N/A (initial build)

## 7) Testing dan Validasi
- Unit test:
  - `php artisan test` (dengan env MySQL override) lulus.
- Integration test:
  - `php artisan test --testsuite=Feature --filter=AuthApiTest` lulus (4 test, 10 assertion).
  - validasi outlet scope deny/allow berjalan sesuai expected.
- Manual verification:
  - `php artisan route:list --path=api` menampilkan endpoint auth/me.
  - `php artisan migrate:fresh --seed --force` (env MySQL override) sukses.
- Hasil:
  - Implementasi foundation EPIC-01 berjalan.
  - Catatan environment: extension `pdo_sqlite` tidak tersedia di mesin ini.

## 8) Risiko dan Mitigasi
- Risiko utama: Bootstrap environment dependency (composer/php extension) tidak siap.
- Mitigasi: Verifikasi dependency lalu fallback ke setup minimal jika ada batasan.

## 9) Rollback Plan
- Jika perlu rollback baseline:
  - reset branch ke commit sebelum bootstrap Laravel.
- Jika rollback parsial EPIC-01:
  - hapus migration/model/controller/middleware terkait foundation.
  - drop tabel foundation dari DB target.

## 10) Changelog Singkat
- `2026-02-15 23:40` - Dokumen perubahan dibuat dengan status planned.
- `2026-02-16 00:06` - Bootstrap Laravel 12 + Sanctum selesai.
- `2026-02-16 00:06` - Implementasi auth API, tenant/outlet RBAC foundation, request context middleware.
- `2026-02-16 00:06` - Migrasi+seed tervalidasi di MySQL, test feature AuthApiTest lulus, status diubah ke done.
