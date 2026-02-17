# CHG-20260216-epic03-sync-invoice

## Header
- Change ID: `CHG-20260216-epic03-sync-invoice`
- Status: `done`
- Date: `2026-02-16`
- Owner: `codex`
- Related Ticket: `BE-020, BE-021, BE-022, BE-023, BE-024, BE-025`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Mengimplementasikan EPIC-03 untuk sync engine (`push/pull`) dan invoice range lease claim.
- Solusi yang akan/dilakukan: Tambah tabel perangkat/sync/invoice lease, endpoint sync, endpoint claim range, idempotency mutation, change-feed cursor, dan validasi invoice lease pada ORDER_CREATE via sync.
- Dampak bisnis/user: Device mobile bisa sinkronisasi offline-first secara idempotent dan dapat booking range invoice tanpa bentrok antar device.

## 2) Scope
- In scope:
  - Migration `devices`, `sync_mutations`, `sync_changes`, `invoice_leases`
  - Endpoint `POST /api/sync/push`
  - Endpoint `POST /api/sync/pull`
  - Endpoint `POST /api/invoices/range/claim`
  - Handler mutation sync: `ORDER_CREATE`, `ORDER_ADD_PAYMENT`, `ORDER_UPDATE_LAUNDRY_STATUS`, `ORDER_UPDATE_COURIER_STATUS`, `ORDER_ASSIGN_COURIER`
  - Idempotency `tenant_id + mutation_id`
  - Sync change cursor feed
  - Invoice lease validation dan server-side assignment saat invoice pending
- Out of scope:
  - Konflik resolver kompleks lintas entity non-core
  - Web offline mode
  - WA enqueue dari event sync

## 3) Acceptance Criteria
1. `/sync/push` menerima mutation batch, mengembalikan `ack/rejected`, dan idempotent untuk mutation duplikat.
2. `/sync/pull` mengembalikan perubahan berbasis `cursor` dengan `next_cursor` dan `has_more`.
3. `/invoices/range/claim` mengalokasikan range non-overlap per outlet+tanggal.
4. ORDER_CREATE dari sync memvalidasi invoice terhadap lease dan menolak invoice invalid.
5. Reason code untuk reject penting tersedia (`INVOICE_RANGE_INVALID`, `STATUS_NOT_FORWARD`, dll).

## 4) Implementasi Teknis
- Pendekatan: Domain service untuk lease/change recorder + controller sync khusus mutation type.
- Keputusan teknis penting:
  - Cursor sync menggunakan `sync_changes.cursor` (`bigIncrements`) sebagai ordering stabil.
  - Invoice lease menyimpan `next_counter` untuk assignment server-side saat invoice pending.
- Trade-off:
  - Mutation engine saat ini fokus 5 type inti sesuai MVP.
  - Integrasi perubahan non-sync endpoint ke feed masih berbasis perubahan yang direkam saat proses sync.

## 5) File yang Diubah
- `database/migrations/2026_02_16_061500_create_sync_and_invoice_lease_tables.php`
- `app/Models/Device.php`
- `app/Models/SyncMutation.php`
- `app/Models/SyncChange.php`
- `app/Models/InvoiceLease.php`
- `app/Domain/Sync/SyncRejectException.php`
- `app/Domain/Sync/SyncChangeRecorder.php`
- `app/Domain/Invoices/InvoiceLeaseService.php`
- `app/Http/Controllers/Api/SyncController.php`
- `app/Http/Controllers/Api/InvoiceRangeController.php`
- `routes/api.php`
- `tests/Feature/SyncApiTest.php`

## 6) Dampak API/DB/Config
- API changes:
  - `POST /api/sync/push`
  - `POST /api/sync/pull`
  - `POST /api/invoices/range/claim`
- DB migration:
  - Tabel baru: `devices`, `sync_mutations`, `sync_changes`, `invoice_leases`
  - Constraint penting:
    - `sync_mutations` unique `(tenant_id, mutation_id)`
    - `sync_changes` index `(tenant_id, cursor)`
    - `invoice_leases` index `(tenant_id, outlet_id, date)`
- Env/config changes:
  - Tidak ada env wajib baru.
  - Test dijalankan dengan MySQL karena `pdo_sqlite` tidak tersedia di mesin ini.
- Backward compatibility: additive

## 7) Testing dan Validasi
- Unit test:
  - Tidak ada unit test terpisah; validasi utama lewat feature test.
- Integration test:
  - `php artisan test --testsuite=Feature --filter=SyncApiTest` -> pass (4 tests, 23 assertions)
  - `php artisan test` -> pass (16 tests, 76 assertions)
- Manual verification:
  - `php artisan migrate:fresh --seed --force` -> sukses (schema sync/invoice lease tervalidasi)
  - `php artisan route:list --path=api` -> endpoint sync/claim terdaftar
- Hasil:
  - EPIC-03 selesai untuk scope MVP backend.

## 8) Risiko dan Mitigasi
- Risiko utama: mismatch timezone invoice date antara client dan outlet timezone.
- Mitigasi: validasi invoice menggunakan timezone outlet + penyesuaian payload test/client time.

## 9) Rollback Plan
- Revert commit EPIC-03.
- Drop tabel `devices`, `sync_mutations`, `sync_changes`, `invoice_leases` via rollback migration.
- Hapus route/controller/service sync dan invoice lease.

## 10) Changelog Singkat
- `2026-02-16 06:20` - Mulai implementasi sync/invoice lease.
- `2026-02-16 06:45` - Migration + model + service sync/invoice lease selesai.
- `2026-02-16 07:00` - Endpoint `/sync/push`, `/sync/pull`, `/invoices/range/claim` aktif.
- `2026-02-16 07:15` - `SyncApiTest` pass, full suite pass, dokumen ditutup status done.
