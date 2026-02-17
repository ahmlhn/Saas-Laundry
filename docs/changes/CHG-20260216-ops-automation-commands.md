# CHG-20260216-ops-automation-commands

## Header
- Change ID: `CHG-20260216-ops-automation-commands`
- Status: `done`
- Date: `2026-02-16`
- Owner: `codex`
- Related Ticket: `OPS-004, OPS-005, OPS-006`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Menambahkan automation command operasional pasca hardening.
- Solusi yang akan/dilakukan: Menambahkan command archive audit events, redrive WA failed messages, dan reconcile quota usage bulanan; plus baseline scheduler dan dokumentasi operasional.
- Dampak bisnis/user: Recovery incident lebih cepat, data audit lebih terkelola, dan quota lebih konsisten setelah rekonsiliasi.

## 2) Scope
- In scope:
  - Command archive audit (`ops:audit:archive`)
  - Command redrive WA failed (`ops:wa:redrive-failed`)
  - Command quota reconcile (`ops:quota:reconcile`)
  - Schedule baseline di `routes/console.php`
  - Feature test command
  - Update runbook/observability/README
- Out of scope:
  - Dashboard UI operasional command
  - Integrasi external object storage untuk archive

## 3) Acceptance Criteria
1. Audit event lama dapat diarsip dan dibersihkan via command.
2. WA failed transient bisa di-redrive via command.
3. Quota usage dapat direkonsiliasi ulang dari data order.
4. Command tervalidasi lewat test.

## 4) Implementasi Teknis
- Pendekatan:
  - Laravel command classes di `app/Console/Commands`.
  - Archive audit ke JSONL (`storage/app/audit-archives`) + opsi `--dry-run`.
  - Redrive WA failed berbasis reason code transient default + opsi override.
  - Quota reconcile dari agregasi `orders` per periode.
- Keputusan teknis penting:
  - Command archive mendukung filter `--channel`.
  - Redrive reset `attempts` ke 0, clear error, lalu dispatch `SendWaMessageJob`.
  - Reconcile menerima `period` format `YYYY-MM` dan filter `--tenant`.
- Trade-off:
  - Archive masih local filesystem.
  - Redrive otomatis default fokus reason transient, reason permanen perlu flag khusus.

## 5) File yang Diubah
- `app/Console/Commands/ArchiveAuditEventsCommand.php`
- `app/Console/Commands/RedriveFailedWaMessagesCommand.php`
- `app/Console/Commands/ReconcileQuotaUsageCommand.php`
- `routes/console.php`
- `tests/Feature/OpsCommandsTest.php`
- `docs/OPERATIONS_RUNBOOK.md`
- `docs/OBSERVABILITY_BASELINE.md`
- `README.md`

## 6) Dampak API/DB/Config
- API changes: tidak ada perubahan kontrak API.
- DB migration: tidak ada migration baru.
- Env/config changes: tidak ada env wajib baru.
- Backward compatibility: additive.

## 7) Testing dan Validasi
- Unit test:
  - Existing unit tests tetap pass.
- Integration test:
  - `php artisan test --testsuite=Feature --filter=OpsCommandsTest` -> pass (3 tests, 10 assertions).
  - `php artisan test` -> pass (35 tests, 167 assertions).
- Manual verification:
  - `php artisan list --raw | Select-String "ops:"` -> command terdaftar.
  - `php artisan schedule:list` -> schedule command terlihat.
  - `npm run build` -> sukses.
- Hasil:
  - Automation command operasional siap dipakai.

## 8) Risiko dan Mitigasi
- Risiko utama:
  - Command dieksekusi tanpa review parameter.
- Mitigasi:
  - Opsi `--dry-run` tersedia untuk audit/redrive/reconcile.
  - Output summary command dibuat eksplisit.

## 9) Rollback Plan
- Revert command/schedule/test/docs terkait perubahan ini.

## 10) Changelog Singkat
- `2026-02-16 11:20` - Dokumen perubahan dibuat dengan status planned.
- `2026-02-16 11:33` - Implementasi command ops selesai.
- `2026-02-16 11:40` - Schedule baseline + docs ops diperbarui.
- `2026-02-16 11:49` - Test suite dan build pass; dokumen ditutup status done.
