# CHG-20260216-master-lifecycle-restore

## Header
- Change ID: `CHG-20260216-master-lifecycle-restore`
- Status: `done`
- Date: `2026-02-16`
- Owner: `codex`
- Related Ticket: `BE-047, QA-007`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Soft delete policy master data sudah ada di schema, tetapi belum ada endpoint operasional untuk archive/restore entitas master.
- Solusi yang akan/dilakukan: Menambahkan API lifecycle (archive + restore) untuk `customers`, `services`, `outlets`, dan `users` dengan role guard sesuai area tanggung jawab, plus audit event per aksi.
- Dampak bisnis/user: Operasional bisa menonaktifkan data master secara reversible tanpa hard delete, termasuk proteksi agar outlet aktif terakhir dan akun sendiri tidak bisa diarsipkan sembarangan.

## 2) Scope
- In scope:
  - Endpoint archive/restore untuk customers/services/outlets/users.
  - Guard role + tenant scope pada endpoint lifecycle.
  - Penambahan audit event lifecycle master data.
  - Feature tests untuk happy-path + guard-path.
  - Penyesuaian relasi model agar order historis tetap bisa membaca entitas yang sudah soft-deleted.
- Out of scope:
  - UI recycle bin/restore di web panel.
  - Hard delete permanen.

## 3) Acceptance Criteria
1. API lifecycle tersedia dan bekerja untuk seluruh entitas target. ✅
2. Role guard + tenant scope mencegah akses tidak sah. ✅
3. Seluruh test existing tetap pass, dengan test baru untuk lifecycle. ✅

## 4) Implementasi Teknis
- Pendekatan:
  - Menambah endpoint lifecycle pada controller domain yang sudah ada (`CustomerController`, `ServiceCatalogController`) dan controller baru untuk `Outlet` dan `User`.
  - Menambah audit event keys agar aksi archive/restore tercatat.
  - Menambahkan filter `include_deleted` di list customer/service untuk kebutuhan verifikasi operasional.
- Keputusan teknis penting:
  - Lifecycle `outlet` dan `user` dibatasi `owner` only.
  - Lifecycle `customer` dan `service` dibolehkan `owner/admin`.
  - Middleware `EnsureOutletAccess` disesuaikan menggunakan `Outlet::withTrashed()` agar restore outlet soft-deleted tidak terblokir sebelum masuk controller.
  - Relasi `Order`, `OrderItem`, dan `OutletService` menggunakan `withTrashed()` untuk menjaga keterbacaan data historis.
- Trade-off:
  - Endpoint restore berbasis id karena route model binding default tidak memuat row soft-deleted.
  - Proteksi last-owner secara eksplisit tersedia, namun skenario yang paling sering terkena tetap self-archive guard.

## 5) File yang Diubah
- `app/Domain/Audit/AuditEventKeys.php`
- `app/Http/Controllers/Api/CustomerController.php`
- `app/Http/Controllers/Api/ServiceCatalogController.php`
- `app/Http/Controllers/Api/OutletManagementController.php`
- `app/Http/Controllers/Api/UserManagementController.php`
- `app/Http/Middleware/EnsureOutletAccess.php`
- `app/Models/Order.php`
- `app/Models/OrderItem.php`
- `app/Models/OutletService.php`
- `routes/api.php`
- `tests/Feature/MasterDataBillingApiTest.php`
- `docs/changes/CHG-20260216-master-lifecycle-restore.md`

## 6) Dampak API/DB/Config
- API changes:
  - `DELETE /api/customers/{customer}`
  - `POST /api/customers/{customer}/restore`
  - `DELETE /api/services/{service}`
  - `POST /api/services/{service}/restore`
  - `DELETE /api/outlets/{outlet}`
  - `POST /api/outlets/{outlet}/restore`
  - `DELETE /api/users/{user}`
  - `POST /api/users/{user}/restore`
  - `GET /api/customers` now supports `include_deleted=1` (owner/admin).
  - `GET /api/services` now supports `include_deleted=1` (owner/admin).
- DB migration:
  - Tidak ada migration baru.
- Env/config changes:
  - Tidak ada.
- Backward compatibility:
  - Additive.

## 7) Testing dan Validasi
- Unit test:
  - Tidak ada unit test baru.
- Integration test:
  - `php artisan test --testsuite=Feature --filter=MasterDataBillingApiTest` -> pass (9 tests, 78 assertions).
  - `php artisan test` -> pass (50 tests, 333 assertions).
- Manual verification:
  - Validasi `deleted_at` dilakukan melalui `assertSoftDeleted` dan restore assertion pada suite feature.
- Hasil:
  - Endpoint lifecycle berfungsi sesuai guard dan tenant scope.

## 8) Risiko dan Mitigasi
- Risiko utama:
  - Archive user/outlet bisa mengganggu operasi jika tanpa guard.
  - Data historis order bisa kehilangan referensi jika relasi tidak aware terhadap soft delete.
- Mitigasi:
  - Guard ketat owner/admin + proteksi self/last active outlet.
  - Relasi historis pada model order dibuat `withTrashed()`.

## 9) Rollback Plan
- Langkah rollback jika gagal:
  - Revert perubahan route/controller/middleware/model/test pada change ini.
  - Jalankan ulang `php artisan test` untuk konfirmasi rollback bersih.

## 10) Changelog Singkat
- `2026-02-16 19:35` - Dokumen perubahan dibuat dengan status planned.
- `2026-02-16 19:42` - Endpoint lifecycle customer/service/outlet/user ditambahkan.
- `2026-02-16 19:48` - Audit event key + relasi model historis (withTrashed) disesuaikan.
- `2026-02-16 19:52` - Feature test lifecycle ditambahkan pada `MasterDataBillingApiTest`.
- `2026-02-16 19:56` - Full suite pass dan dokumen ditutup status done.
