# CHG-20260216-release-dryrun-stage2

## Header
- Change ID: `CHG-20260216-release-dryrun-stage2`
- Status: `done`
- Date: `2026-02-16`
- Owner: `codex`
- Related Ticket: `REL-005, OPS-010`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Menjalankan dry-run checklist go-live tahap 2 dan membuktikan uji backup/restore sekali.
- Solusi yang akan/dilakukan: Eksekusi seluruh command release checklist dari runbook + smoke tests terarah + simulasi backup/restore database.
- Dampak bisnis/user: Menurunkan risiko rilis dengan verifikasi readiness operasional yang terukur.

## 2) Scope
- In scope:
  - Eksekusi release checklist section 5 di `docs/OPERATIONS_RUNBOOK.md`.
  - Eksekusi smoke flow login/create-order/sync-push/WA message.
  - Simulasi backup+restore database `saas_laundry_dev`.
- Out of scope:
  - Deploy ke environment eksternal.
  - UAT manual oleh user operasional non-teknis.

## 3) Acceptance Criteria
1. Semua command release checklist berjalan sukses.
2. Smoke flow utama berjalan sukses.
3. Backup file berhasil dibuat dan restore menghasilkan integritas skema/data dasar yang sama.

## 4) Implementasi Teknis
- Pendekatan:
  - Menjalankan command checklist secara urut dari runbook.
  - Menjalankan smoke tests granular per skenario.
  - Backup/restore via binary XAMPP MySQL (`C:\xampp\mysql\bin\mysqldump.exe`, `C:\xampp\mysql\bin\mysql.exe`).
- Keputusan teknis penting:
  - Karena `mysql` tidak tersedia di `PATH`, command menggunakan absolute path binary XAMPP.
  - Restore dilakukan ke DB sementara `saas_laundry_restore_dryrun`.
- Trade-off:
  - Validasi backup/restore masih level schema + row count utama; belum checksum seluruh table.

## 5) File yang Diubah
- `docs/changes/CHG-20260216-release-dryrun-stage2.md`

## 6) Dampak API/DB/Config
- API changes:
  - Tidak ada.
- DB migration:
  - Tidak ada migration baru.
- Env/config changes:
  - Tidak ada perubahan file env.
  - DB sementara `saas_laundry_restore_dryrun` dibuat saat verifikasi lalu dihapus kembali.
- Backward compatibility:
  - N/A (operational execution only).

## 7) Testing dan Validasi
- Unit test:
  - N/A.
- Integration test:
  - `php artisan test` -> pass (43 tests, 244 assertions).
  - `php artisan test --testsuite=Feature --filter=UatOperationalFlowTest` -> pass (1 test, 33 assertions).
- Manual verification:
  - `php artisan migrate --force` -> sukses (`Nothing to migrate`).
  - `php artisan config:clear && php artisan route:clear && php artisan view:clear` -> sukses.
  - `npm run build` -> sukses.
  - `php artisan ops:readiness:check --strict` -> sukses (pass=13, warn=0, fail=0).
  - `php artisan queue:restart` -> sukses.
  - Smoke tests:
    - `AuthApiTest::test_login_returns_token_and_context` -> pass.
    - `OrderApiTest::test_create_order_calculates_total_and_normalizes_customer_phone` -> pass.
    - `SyncApiTest::test_sync_push_order_create_applies_and_duplicate_is_idempotent` -> pass.
    - `WaApiTest::test_order_events_enqueue_wa_messages_for_premium_plan` -> pass.
  - Backup/restore dry-run:
    - backup file: `storage/app/db-backups/saas_laundry_dev-20260216-093443.sql`
    - backup size: `48166` bytes
    - source tables: `34`, restored tables: `34`
    - source orders: `0`, restored orders: `0`
    - source wa_messages: `0`, restored wa_messages: `0`
    - DB restore sementara dihapus kembali (`DROP DATABASE saas_laundry_restore_dryrun`).
- Hasil:
  - Dry-run checklist tahap 2 lulus.
  - Uji backup/restore satu kali berhasil.

## 8) Risiko dan Mitigasi
- Risiko utama:
  - Ketergantungan path absolut XAMPP di mesin lain bisa berbeda.
- Mitigasi:
  - Dokumentasikan fallback penggunaan binary absolut atau tambahkan ke `PATH` di server target.

## 9) Rollback Plan
- Langkah rollback jika gagal:
  - Tidak ada rollback kode karena perubahan ini bersifat eksekusi operasional.
  - Jika backup/restore gagal, ulang prosedur dengan DB sementara baru dan verifikasi ulang row count.

## 10) Changelog Singkat
- `2026-02-16 16:22` - Dry-run release checklist tahap 2 dieksekusi.
- `2026-02-16 16:24` - Smoke tests terarah login/order/sync/WA lulus.
- `2026-02-16 16:34` - Backup/restore DB dry-run berhasil, DB sementara dibersihkan.
- `2026-02-16 16:36` - Dokumen hasil dry-run dibuat dan ditutup status done.
