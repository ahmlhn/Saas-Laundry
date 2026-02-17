# CHG-20260216-test-env-stability

## Header
- Change ID: `CHG-20260216-test-env-stability`
- Status: `done`
- Date: `2026-02-16`
- Owner: `codex`
- Related Ticket: `QA-002, OPS-007`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Test lokal membutuhkan override manual DB MySQL karena `phpunit.xml` masih memaksa SQLite in-memory.
- Solusi yang akan/dilakukan: Stabilkan environment testing dengan `.env.testing`, update konfigurasi phpunit agar tidak override DB ke SQLite, dan selaraskan dokumentasi setup test.
- Dampak bisnis/user: Developer dapat menjalankan `php artisan test` langsung tanpa set env override per command.

## 2) Scope
- In scope:
  - Tambah `.env.testing` baseline
  - Update `phpunit.xml` untuk DB config testing
  - Update dokumentasi README untuk alur test
- Out of scope:
  - Perubahan logic aplikasi domain
  - Integrasi layanan eksternal baru

## 3) Acceptance Criteria
1. `php artisan test` berjalan tanpa override env manual (`DB_CONNECTION`, `DB_DATABASE`, dll).
2. Konfigurasi testing terpisah dari `.env` lokal agar tidak menabrak database development.
3. Workflow CI backend tetap konsisten menggunakan konfigurasi DB testing MySQL.

## 4) Implementasi Teknis
- Pendekatan:
  - Menambahkan file `.env.testing` sebagai baseline environment khusus test.
  - Menghapus override SQLite dari `phpunit.xml` agar test menggunakan DB dari environment testing.
  - Merapikan workflow CI dengan variabel DB testing di level job.
- Keputusan teknis penting:
  - DB test default diset ke `saas_laundry_test` (MySQL) untuk menyesuaikan requirement proyek.
  - `APP_KEY` testing dipatok agar tidak tergantung pada `.env` lokal.
- Trade-off:
  - Lingkungan lokal tetap membutuhkan MySQL aktif dan database test tersedia.

## 5) File yang Diubah
- `.env.testing`
- `phpunit.xml`
- `.github/workflows/ci.yml`
- `README.md`

## 6) Dampak API/DB/Config
- API changes:
  - Tidak ada perubahan kontrak API.
- DB migration:
  - Tidak ada migration baru.
- Env/config changes:
  - Menambah file `.env.testing` untuk test environment.
  - `phpunit.xml` tidak lagi memaksa `sqlite/:memory:`.
  - CI backend menggunakan env DB test di level job.
- Backward compatibility:
  - Additive; tidak mengubah behavior runtime production.

## 7) Testing dan Validasi
- Unit test:
  - Termasuk dalam eksekusi suite penuh.
- Integration test:
  - `php artisan test` -> pass (40 tests, 199 assertions) tanpa override env manual.
- Manual verification:
  - Verifikasi `phpunit.xml` tidak lagi memiliki `DB_CONNECTION=sqlite` dan `DB_DATABASE=:memory:`.
  - Verifikasi `.env.testing` terdeteksi saat menjalankan `php artisan test`.
- Hasil:
  - Stabilisasi test environment berhasil; alur test lokal kini langsung jalan dengan satu command.

## 8) Risiko dan Mitigasi
- Risiko utama:
  - Mesin developer yang memakai kredensial MySQL berbeda mungkin perlu menyesuaikan `.env.testing`.
- Mitigasi:
  - Nilai default `.env.testing` dibuat eksplisit dan README ditambah catatan konfigurasi test DB.

## 9) Rollback Plan
- Langkah rollback jika gagal:
  - Hapus `.env.testing`.
  - Kembalikan `phpunit.xml` ke konfigurasi SQLite sebelumnya.
  - Kembalikan CI workflow ke env per-step lama.
  - Jalankan ulang test smoke untuk memastikan rollback bersih.

## 10) Changelog Singkat
- `2026-02-16 13:05` - Dokumen perubahan dibuat dengan status planned.
- `2026-02-16 13:18` - Konfigurasi `.env.testing`, `phpunit.xml`, dan workflow CI diperbarui.
- `2026-02-16 13:20` - `php artisan test` lulus tanpa override env manual; dokumen ditutup status done.
