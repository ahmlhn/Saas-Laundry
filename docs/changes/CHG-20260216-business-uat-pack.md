# CHG-20260216-business-uat-pack

## Header
- Change ID: `CHG-20260216-business-uat-pack`
- Status: `done`
- Date: `2026-02-16`
- Owner: `codex`
- Related Ticket: `REL-006, QA-004`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Tahap UAT bisnis perlu paket eksekusi yang siap pakai oleh user operasional lintas role.
- Solusi yang akan/dilakukan: Menambahkan akun demo multi-role untuk UAT, playbook skenario UAT bisnis, template temuan/sign-off, dan update dokumentasi operasional.
- Dampak bisnis/user: UAT bisa dijalankan konsisten dengan langkah dan kriteria yang jelas tanpa setup manual tambahan.

## 2) Scope
- In scope:
  - Seeder akun demo per role (`owner/admin/cashier/worker/courier`) dan assignment outlet.
  - Dokumen playbook UAT bisnis.
  - Template pencatatan temuan UAT.
  - Update runbook/README agar UAT pack mudah diakses.
- Out of scope:
  - Perubahan logic domain order/sync/WA.
  - UI automation testing.

## 3) Acceptance Criteria
1. Akun demo lintas role untuk UAT (`owner/admin/cashier/worker/courier`) tersedia dan ter-assign ke outlet demo.
2. Tersedia playbook UAT bisnis + template findings/sign-off yang siap dipakai user operasional.
3. Perubahan tervalidasi dengan test otomatis dan verifikasi manual seeding akun demo.

## 4) Implementasi Teknis
- Pendekatan:
  - Update `DemoTenantSeeder` untuk membuat dan menormalkan akun demo multi-role.
  - Tambah dokumen `UAT_BUSINESS_PLAYBOOK.md` dan `UAT_FINDINGS_TEMPLATE.md`.
  - Update runbook dan README agar paket UAT mudah ditemukan dan langsung dieksekusi.
- Keputusan teknis penting:
  - Semua akun demo diberi password standar `password` untuk kemudahan UAT.
  - Seeder memaksa sinkronisasi atribut user demo (tenant, status, role, outlet) agar idempotent.
- Trade-off:
  - Password demo yang seragam hanya aman untuk local/staging; tidak boleh dipakai di production.

## 5) File yang Diubah
- `database/seeders/DemoTenantSeeder.php`
- `tests/Feature/DemoSeederUatAccountsTest.php`
- `docs/UAT_BUSINESS_PLAYBOOK.md`
- `docs/UAT_FINDINGS_TEMPLATE.md`
- `docs/OPERATIONS_RUNBOOK.md`
- `README.md`
- `docs/changes/CHG-20260216-business-uat-pack.md`

## 6) Dampak API/DB/Config
- API changes:
  - Tidak ada endpoint baru/berubah.
- DB migration:
  - Tidak ada migration baru.
- Env/config changes:
  - Tidak ada perubahan `.env`.
  - Akun demo tambahan dihasilkan lewat seeder.
- Backward compatibility:
  - Additive (data demo + dokumentasi + test).

## 7) Testing dan Validasi
- Unit test:
  - Tidak ada unit test baru.
- Integration test:
  - `php artisan test --testsuite=Feature --filter=DemoSeederUatAccountsTest` -> pass (1 test, 32 assertions).
  - `php artisan test` -> pass (44 tests, 276 assertions).
- Manual verification:
  - `php artisan db:seed --class=DemoTenantSeeder --force` -> sukses.
  - Verifikasi email akun demo hasil seeding:
    - `admin@demo.local`
    - `cashier@demo.local`
    - `courier@demo.local`
    - `owner@demo.local`
    - `worker@demo.local`
- Hasil:
  - Paket UAT bisnis siap dipakai tim operasional.

## 8) Risiko dan Mitigasi
- Risiko utama:
  - Akun demo default bisa disalahgunakan jika ikut terbawa ke environment publik.
- Mitigasi:
  - Dokumen dibatasi untuk local/staging dan tidak direkomendasikan untuk production.

## 9) Rollback Plan
- Langkah rollback jika gagal:
  - Revert perubahan pada `DemoTenantSeeder`, dokumen UAT, README, dan test baru.
  - Jalankan ulang `php artisan test` untuk memastikan suite kembali stabil.

## 10) Changelog Singkat
- `2026-02-16 16:50` - Dokumen perubahan dibuat dengan status planned.
- `2026-02-16 16:58` - Seeder demo multi-role selesai diimplementasikan.
- `2026-02-16 17:05` - Dokumen playbook dan template findings UAT ditambahkan.
- `2026-02-16 17:12` - Test UAT accounts + full test suite lulus, dokumen ditutup status done.
