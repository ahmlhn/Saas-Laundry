# CHG-20260216-staging-readiness-checks

## Header
- Change ID: `CHG-20260216-staging-readiness-checks`
- Status: `done`
- Date: `2026-02-16`
- Owner: `codex`
- Related Ticket: `OPS-008, REL-003`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Belum ada command tunggal untuk memverifikasi kesiapan staging sebelum rilis/deploy.
- Solusi yang akan/dilakukan: Menambahkan command readiness check yang mengaudit konfigurasi inti (DB, migration, scheduler, queue mode, storage writable, baseline WA provider) dan mengeluarkan summary pass/warn/fail.
- Dampak bisnis/user: Tim ops dapat melakukan verifikasi cepat dan konsisten sebelum release.

## 2) Scope
- In scope:
  - Command `ops:readiness:check`
  - Opsi mode `--strict` dan `--json` untuk pipeline/automation
  - Feature test command readiness
  - Update runbook + README untuk command baru
- Out of scope:
  - Integrasi monitoring eksternal
  - Otomasi backup/restore lintas infrastruktur cloud

## 3) Acceptance Criteria
1. Tersedia command readiness tunggal yang mengecek baseline staging (DB, migration, scheduler, queue, writable path, WA provider baseline).
2. Command mendukung mode automation: `--json` untuk machine-readable report dan `--strict` untuk gate release.
3. Readiness command tervalidasi oleh feature test command ops dan terdokumentasi di runbook/release checklist.

## 4) Implementasi Teknis
- Pendekatan:
  - Menambahkan `ops:readiness:check` yang menghasilkan daftar check `pass/warn/fail` + summary.
  - Menambahkan opsi `--json` untuk output terstruktur dan `--strict` untuk mengubah warning menjadi failure gate.
  - Menambah test command readiness pada suite `OpsCommandsTest`.
- Keputusan teknis penting:
  - Queue `sync` diperlakukan `warn` (bukan `fail`) pada mode normal, namun `fail` pada mode `--strict`.
  - Validasi scheduler menggunakan baseline command yang sudah didefinisikan di `routes/console.php`.
  - Validasi migration pending dihitung dari file `database/migrations` vs isi tabel `migrations`.
- Trade-off:
  - Readiness check fokus pada health baseline aplikasi (belum mencakup health infrastruktur eksternal seperti Redis/MySQL replication/object storage).

## 5) File yang Diubah
- `app/Console/Commands/StagingReadinessCheckCommand.php`
- `tests/Feature/OpsCommandsTest.php`
- `docs/OPERATIONS_RUNBOOK.md`
- `docs/OBSERVABILITY_BASELINE.md`
- `README.md`

## 6) Dampak API/DB/Config
- API changes:
  - Tidak ada perubahan endpoint API.
- DB migration:
  - Tidak ada migration baru.
- Env/config changes:
  - Tidak ada env wajib baru.
  - Command baru tersedia: `php artisan ops:readiness:check`.
- Backward compatibility:
  - Additive (hanya command ops + test + dokumentasi).

## 7) Testing dan Validasi
- Unit test:
  - Tidak ada unit test baru khusus perubahan ini.
- Integration test:
  - `php artisan test --testsuite=Feature --filter=OpsCommandsTest` -> pass (5 tests, 22 assertions).
  - `php artisan test` -> pass (43 tests, 244 assertions).
- Manual verification:
  - `php artisan ops:readiness:check --json` -> pass (summary: pass=13, warn=0, fail=0).
  - `php artisan ops:readiness:check --strict` -> pass (exit code 0 di local environment).
- Hasil:
  - Staging readiness command siap dipakai sebagai release gate.

## 8) Risiko dan Mitigasi
- Risiko utama:
  - Check readiness bisa false positive jika environment punya standar operasional berbeda dari baseline ini.
- Mitigasi:
  - Output check dibuat granular per-key agar mudah diadaptasi saat policy ops berubah.
  - Mode `--strict` opsional untuk dipakai hanya pada environment yang sudah align baseline.

## 9) Rollback Plan
- Langkah rollback jika gagal:
  - Hapus command `StagingReadinessCheckCommand`.
  - Revert test ops readiness pada `OpsCommandsTest`.
  - Revert update dokumentasi runbook/observability/README terkait readiness command.
  - Jalankan ulang `php artisan test` untuk memastikan rollback bersih.

## 10) Changelog Singkat
- `2026-02-16 14:05` - Dokumen perubahan dibuat dengan status planned.
- `2026-02-16 14:12` - Implementasi command `ops:readiness:check` selesai.
- `2026-02-16 14:16` - Test readiness command ditambahkan di `OpsCommandsTest`.
- `2026-02-16 14:20` - Runbook, observability baseline, dan README diperbarui.
- `2026-02-16 14:25` - Validasi test suite + manual readiness check selesai, status dokumen diubah ke done.
