# CHG-20260216-data-model-audit-policy

## Header
- Change ID: `CHG-20260216-data-model-audit-policy`
- Status: `done`
- Date: `2026-02-16`
- Owner: `codex`
- Related Ticket: `BE-046, QA-006`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Detail data model pada `IMPLEMENTATION_SPECS` section 11 belum seluruhnya terimplementasi (audit actor/channel columns dan soft delete policy pada entitas master).
- Solusi yang akan/dilakukan: Menambah kolom audit (`created_by`, `updated_by`, `source_channel`) pada tabel kritikal, menambah soft delete untuk entitas master yang direkomendasikan, serta memastikan write-path API/sync/WA mengisi metadata baru.
- Dampak bisnis/user: Traceability perubahan data meningkat, audit operasional lebih jelas, dan lifecycle data master siap untuk proses restore/archive tanpa hard delete.

## 2) Scope
- In scope:
  - Migration penambahan kolom audit pada `orders`, `payments`, `sync_mutations`, `wa_messages`.
  - Migration soft delete pada `users`, `outlets`, `customers`, `services`.
  - Penyesuaian write-path API/sync/WA agar kolom audit terisi.
  - Penyesuaian model Eloquent terkait soft delete/fillable.
  - Penambahan assertion feature test untuk metadata audit.
- Out of scope:
  - UI manajemen recycle bin / restore data soft-deleted.
  - Perubahan kontrak API publik untuk expose metadata baru ke client.

## 3) Acceptance Criteria
1. Kolom audit tersedia dan otomatis terisi saat mutation utama terjadi. ✅
2. Entitas master (`users`, `outlets`, `customers`, `services`) mendukung soft delete tanpa merusak flow existing. ✅
3. Test feature terkait order/sync/WA tetap lulus, ditambah coverage metadata audit. ✅

## 4) Implementasi Teknis
- Pendekatan:
  - Menambah migration additive untuk hardening data model.
  - Menyetarakan mapping `source_channel` ke `mobile|web|system`.
  - Mengisi `created_by/updated_by/source_channel` di seluruh write-path utama (Order API, Sync API, WA dispatch/job).
- Keputusan teknis penting:
  - Untuk `orders.invoice_no`, unique index diubah menjadi tenant-scope (`tenant_id + invoice_no`) sesuai spesifikasi.
  - Ditambahkan index `orders.outlet_id` terpisah agar FK tetap valid saat unique lama (`outlet_id + invoice_no`) dilepas.
  - `source_channel` pada `wa_messages` menjadi `system` setelah diproses job async (status update oleh worker).
- Trade-off:
  - Nilai `source_channel` pada `wa_messages` mencerminkan channel mutation terakhir (worker), bukan semata channel enqueue awal.

## 5) File yang Diubah
- `database/migrations/2026_02_16_184500_add_audit_columns_and_soft_deletes.php`
- `app/Models/User.php`
- `app/Models/Outlet.php`
- `app/Models/Customer.php`
- `app/Models/Service.php`
- `app/Models/Order.php`
- `app/Models/Payment.php`
- `app/Models/SyncMutation.php`
- `app/Models/WaMessage.php`
- `app/Http/Controllers/Api/OrderController.php`
- `app/Http/Controllers/Api/SyncController.php`
- `app/Domain/Messaging/WaDispatchService.php`
- `app/Jobs/SendWaMessageJob.php`
- `tests/Feature/OrderApiTest.php`
- `tests/Feature/SyncApiTest.php`
- `tests/Feature/WaApiTest.php`
- `docs/changes/CHG-20260216-data-model-audit-policy.md`

## 6) Dampak API/DB/Config
- API changes:
  - Tidak ada endpoint baru.
  - Tidak ada perubahan shape respons API.
- DB migration:
  - Menambah soft delete columns (`deleted_at`) pada: `users`, `outlets`, `customers`, `services`.
  - Menambah kolom audit pada: `orders`, `payments`, `sync_mutations`, `wa_messages`.
  - Mengubah unique index invoice order menjadi tenant-scope.
- Env/config changes:
  - Tidak ada env wajib baru.
- Backward compatibility:
  - Additive + hardening behavior.

## 7) Testing dan Validasi
- Unit test:
  - `php artisan test --testsuite=Unit` -> pass.
- Integration test:
  - `php artisan test --testsuite=Feature --filter=OrderApiTest` -> pass (8 tests, 54 assertions).
  - `php artisan test --testsuite=Feature --filter=SyncApiTest` -> pass (5 tests, 28 assertions).
  - `php artisan test --testsuite=Feature --filter=WaApiTest` -> pass (5 tests, 25 assertions).
  - `php artisan test --testsuite=Feature --filter=OpsCommandsTest` -> pass (7 tests, 28 assertions).
  - `php artisan test` -> pass (46 tests, 287 assertions).
- Manual verification:
  - `php artisan migrate:fresh --seed --env=testing` -> migration baru sukses termasuk perubahan index orders.
- Hasil:
  - Scope perubahan selesai dan tervalidasi.

## 8) Risiko dan Mitigasi
- Risiko utama:
  - Perubahan index invoice berpotensi berdampak ke validasi data lama jika ada duplicate invoice lintas outlet dalam tenant.
  - `source_channel` pada WA dapat berubah ke `system` setelah worker memproses message.
- Mitigasi:
  - Constraint diterapkan saat fase awal proyek (dataset terkendali) dan tervalidasi lewat full suite.
  - `created_by` tetap menyimpan actor awal sehingga jejak asal aksi tetap tersedia.

## 9) Rollback Plan
- Langkah rollback jika gagal:
  - Revert migration `2026_02_16_184500_add_audit_columns_and_soft_deletes.php`.
  - Revert update write-path/model/test yang menulis/mengandalkan kolom audit baru.
  - Jalankan `php artisan migrate:fresh --seed` pada environment terdampak setelah rollback.

## 10) Changelog Singkat
- `2026-02-16 18:40` - Dokumen perubahan dibuat dengan status planned.
- `2026-02-16 18:55` - Migration audit + soft delete + index invoice tenant-scope diimplementasikan.
- `2026-02-16 19:08` - Write-path API/sync/WA diperbarui untuk mengisi `created_by/updated_by/source_channel`.
- `2026-02-16 19:16` - Assertion test metadata audit ditambahkan (Order/Sync/WA).
- `2026-02-16 19:24` - Full test suite pass dan dokumen ditutup status done.
