# CHG-20260216-uat-e2e-flow

## Header
- Change ID: `CHG-20260216-uat-e2e-flow`
- Status: `done`
- Date: `2026-02-16`
- Owner: `codex`
- Related Ticket: `QA-003, REL-002`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Belum ada satu skenario UAT otomatis yang menguji flow operasional ujung-ke-ujung dalam satu test.
- Solusi yang akan/dilakukan: Menambahkan feature test smoke UAT yang menjalankan alur kasir -> pekerja -> kurir -> payment -> WA log.
- Dampak bisnis/user: Kesiapan rilis lebih terukur karena alur bisnis utama tervalidasi otomatis.

## 2) Scope
- In scope:
  - Tambah test UAT end-to-end operasional pickup-delivery.
  - Validasi status pipeline, payment settlement, dan WA trigger lifecycle order.
  - Tambah referensi command UAT di runbook.
- Out of scope:
  - UI automation browser/E2E frontend.
  - Performance/load testing.

## 3) Acceptance Criteria
1. Tersedia satu test end-to-end yang memvalidasi flow pickup-delivery penuh lintas role.
2. Test memverifikasi status pipeline order, settlement payment, serta trigger WA lifecycle utama.
3. Runbook memiliki command eksplisit untuk menjalankan UAT smoke flow sebelum rilis.

## 4) Implementasi Teknis
- Pendekatan:
  - Menambah `UatOperationalFlowTest` berbasis API flow nyata dengan role `admin`, `cashier`, `worker`, dan `courier`.
  - Test mencakup konfigurasi WA provider aktif, create order pickup-delivery, assignment kurir, status progression, pembayaran, dan verifikasi audit + WA logs.
  - Menambah langkah UAT smoke command pada release checklist runbook.
- Keputusan teknis penting:
  - Tenant UAT test menggunakan plan `premium` agar fitur WA aktif.
  - Validasi WA menggunakan template event utama: `WA_PICKUP_CONFIRM`, `WA_PICKUP_OTW`, `WA_LAUNDRY_READY`, `WA_DELIVERY_OTW`, `WA_ORDER_DONE`.
- Trade-off:
  - Cakupan UAT fokus API/backend (belum mencakup UI automation).

## 5) File yang Diubah
- `tests/Feature/UatOperationalFlowTest.php`
- `docs/OPERATIONS_RUNBOOK.md`
- `README.md`

## 6) Dampak API/DB/Config
- API changes:
  - Tidak ada endpoint baru.
- DB migration:
  - Tidak ada migration baru.
- Env/config changes:
  - Tidak ada konfigurasi wajib baru.
- Backward compatibility:
  - Additive; hanya menambah test + dokumentasi operasional.

## 7) Testing dan Validasi
- Unit test:
  - Tidak ada unit test baru.
- Integration test:
  - `php artisan test --testsuite=Feature --filter=UatOperationalFlowTest` -> pass (1 test, 33 assertions).
  - `php artisan test` -> pass (41 tests, 232 assertions).
- Manual verification:
  - Review runbook memastikan command UAT smoke ada di release checklist.
- Hasil:
  - UAT smoke end-to-end sudah tervalidasi otomatis dan siap dipakai sebagai gate rilis.

## 8) Risiko dan Mitigasi
- Risiko utama:
  - Test E2E bisa jadi lebih sensitif terhadap perubahan rule domain lintas modul.
- Mitigasi:
  - Menjaga assertion pada perilaku bisnis inti (state, payment, WA, audit) agar perubahan kontrak terdeteksi dini.

## 9) Rollback Plan
- Langkah rollback jika gagal:
  - Hapus `tests/Feature/UatOperationalFlowTest.php`.
  - Revert update dokumentasi di `docs/OPERATIONS_RUNBOOK.md` dan `README.md`.
  - Jalankan ulang `php artisan test` untuk memastikan suite kembali stabil.

## 10) Changelog Singkat
- `2026-02-16 13:35` - Dokumen perubahan dibuat dengan status planned.
- `2026-02-16 13:43` - UAT smoke feature test ditambahkan untuk flow operasional end-to-end.
- `2026-02-16 13:45` - Runbook dan README diperbarui dengan command UAT smoke flow.
- `2026-02-16 13:47` - Validasi test selesai dan dokumen ditutup status done.
