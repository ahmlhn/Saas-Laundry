# CHG-20260216-business-uat-execution

## Header
- Change ID: `CHG-20260216-business-uat-execution`
- Status: `done`
- Date: `2026-02-16`
- Owner: `codex`
- Related Ticket: `REL-007, QA-005`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Template UAT sudah ada, tetapi belum ada hasil eksekusi UAT yang terisi sebagai baseline.
- Solusi yang akan/dilakukan: Menjalankan engineering dry-run untuk skenario UAT bisnis, menambahkan command otomatis `ops:uat:run`, dan menghasilkan laporan findings terisi.
- Dampak bisnis/user: Tim punya baseline hasil UAT yang bisa dijadikan acuan sebelum UAT oleh user operasional.

## 2) Scope
- In scope:
  - Menjalankan test pack yang merepresentasikan skenario UAT-01 s.d UAT-10.
  - Menambahkan command otomatis untuk run UAT pack + generate report.
  - Menambahkan test command UAT mode `--dry-run`.
  - Membuat laporan hasil UAT dry-run terisi.
  - Menambahkan lokasi penyimpanan report UAT di dokumentasi.
- Out of scope:
  - Penggantian keputusan GO/NO-GO final bisnis oleh stakeholder non-teknis.
  - UAT manual berbasis klik UI oleh user bisnis.

## 3) Acceptance Criteria
1. Engineering dry-run untuk skenario UAT-01 s.d UAT-10 dieksekusi dengan evidence test yang jelas.
2. Tersedia command `ops:uat:run` untuk otomatisasi run UAT + generate report markdown.
3. Laporan findings UAT terisi tersedia sebagai baseline dokumen dan lokasi report terdokumentasi.

## 4) Implementasi Teknis
- Pendekatan:
  - Menjalankan test pack UAT secara serial per class untuk menghindari konflik DB test.
  - Menambahkan command `ops:uat:run` yang menjalankan filter test UAT dan membuat laporan markdown.
  - Menyusun laporan hasil UAT dry-run dalam format findings lengkap.
  - Menambahkan referensi lokasi report UAT ke playbook/runbook/README.
- Keputusan teknis penting:
  - Eksekusi test serial dipilih karena `RefreshDatabase` pada MySQL tidak aman dijalankan paralel dalam DB yang sama.
  - `ops:uat:run` menggunakan isolated temporary test database agar tidak bentrok dengan proses test lain.
  - Command memaksa env testing untuk queue/cache/session agar behavior test konsisten.
  - Keputusan release pada dry-run ditandai `GO with Conditions` sampai sign-off user operasional final tersedia.
- Trade-off:
  - Run otomatis UAT butuh waktu lebih lama karena menjalankan beberapa test filter serial.
  - Dry-run ini merepresentasikan validasi backend/API; validasi UI manual oleh user bisnis tetap wajib.

## 5) File yang Diubah
- `app/Console/Commands/RunBusinessUatCommand.php`
- `tests/Feature/OpsCommandsTest.php`
- `docs/uat-reports/UAT-20260216-engineering-dryrun.md`
- `docs/uat-reports/UAT-20260216-automated-dryrun.md`
- `docs/uat-reports/UAT-20260216-automated-exec.md`
- `docs/UAT_BUSINESS_PLAYBOOK.md`
- `docs/OPERATIONS_RUNBOOK.md`
- `README.md`
- `docs/changes/CHG-20260216-business-uat-execution.md`

## 6) Dampak API/DB/Config
- API changes:
  - Tidak ada perubahan endpoint.
- DB migration:
  - Tidak ada migration baru.
- Env/config changes:
  - Tidak ada perubahan konfigurasi runtime.
  - Command baru tersedia: `php artisan ops:uat:run`.
- Backward compatibility:
  - Additive (otomasi ops + dokumentasi + evidence).

## 7) Testing dan Validasi
- Unit test:
  - Tidak ada unit test baru.
- Integration test (UAT evidence pack):
  - `php artisan test --testsuite=Feature --filter=OrderApiTest` -> pass (8 tests, 52 assertions).
  - `php artisan test --testsuite=Feature --filter=UatOperationalFlowTest` -> pass (1 test, 33 assertions).
  - `php artisan test --testsuite=Feature --filter=MasterDataBillingApiTest` -> pass (5 tests, 32 assertions).
  - `php artisan test --testsuite=Feature --filter=WaApiTest` -> pass (5 tests, 24 assertions).
  - `php artisan test --testsuite=Feature --filter=OpsCommandsTest` -> pass (7 tests, 28 assertions).
  - `php artisan test` -> pass (46 tests, 282 assertions).
- Manual verification:
  - `php artisan ops:uat:run --dry-run --seed-demo --output=docs/uat-reports/UAT-20260216-automated-dryrun.md` -> sukses (blocked=10).
  - `php artisan ops:uat:run --seed-demo --output=docs/uat-reports/UAT-20260216-automated-exec.md` -> sukses (pass=10, fail=0).
  - Report UAT dry-run tersedia di `docs/uat-reports/UAT-20260216-engineering-dryrun.md`.
  - Referensi lokasi report terpasang di playbook/runbook/README.
- Hasil:
  - Baseline engineering UAT terdokumentasi.
  - Otomasi run UAT + report generation tersedia dan tervalidasi.

## 8) Risiko dan Mitigasi
- Risiko utama:
  - Engineering dry-run bisa berbeda dari behavior user akhir pada UAT manual.
  - Command otomatis bisa memakan waktu cukup lama pada mesin lambat.
- Mitigasi:
  - Report ditandai sebagai baseline teknis dan tetap mensyaratkan sign-off Owner/Admin/Kasir/Kurir.
  - Gunakan mode `--dry-run` untuk verifikasi cepat format/report sebelum eksekusi penuh.

## 9) Rollback Plan
- Langkah rollback jika gagal:
  - Revert `app/Console/Commands/RunBusinessUatCommand.php`.
  - Revert test `OpsCommandsTest` untuk command UAT.
  - Hapus report otomatis `docs/uat-reports/UAT-20260216-automated-*.md`.
  - Hapus report `docs/uat-reports/UAT-20260216-engineering-dryrun.md`.
  - Revert update referensi dokumentasi UAT pada playbook/runbook/README.

## 10) Changelog Singkat
- `2026-02-16 17:20` - Dokumen perubahan dibuat dengan status planned.
- `2026-02-16 17:27` - Eksekusi test pack UAT serial selesai dan seluruh class target pass.
- `2026-02-16 17:31` - Report findings engineering dry-run dibuat.
- `2026-02-16 17:34` - Dokumentasi UAT diperbarui dan change doc ditutup status done.
- `2026-02-16 18:12` - Command `ops:uat:run` ditambahkan (dry-run + full execution + report generation).
- `2026-02-16 18:24` - Isolasi DB test pada `ops:uat:run` ditambahkan untuk stabilitas eksekusi.
- `2026-02-16 18:32` - Validasi command UAT otomatis dan full suite pass.
