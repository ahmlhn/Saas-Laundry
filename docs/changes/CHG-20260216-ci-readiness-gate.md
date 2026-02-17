# CHG-20260216-ci-readiness-gate

## Header
- Change ID: `CHG-20260216-ci-readiness-gate`
- Status: `done`
- Date: `2026-02-16`
- Owner: `codex`
- Related Ticket: `OPS-009, REL-004`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Readiness check belum dijalankan otomatis sebagai quality gate di pipeline CI.
- Solusi yang akan/dilakukan: Menambahkan step `ops:readiness:check --strict` pada workflow backend sebelum step test suite.
- Dampak bisnis/user: CI akan gagal lebih cepat jika environment belum siap (pending migration, scheduler baseline hilang, storage tidak writable, dll).

## 2) Scope
- In scope:
  - Update workflow CI backend untuk menjalankan readiness gate strict.
  - Validasi command readiness tetap lulus di local.
- Out of scope:
  - Penambahan job CI baru di luar backend-tests.
  - Perubahan logic domain aplikasi.

## 3) Acceptance Criteria
1. Pipeline backend menjalankan readiness gate strict sebelum test suite.
2. Gate readiness menggunakan command yang sama dengan runbook (`ops:readiness:check --strict`).
3. Validasi lokal menunjukkan readiness gate dan full test suite tetap lulus.

## 4) Implementasi Teknis
- Pendekatan:
  - Menambahkan step workflow baru di backend CI setelah migrate+seed dan sebelum `php artisan test`.
- Keputusan teknis penting:
  - Gate memakai mode `--strict` agar warning diperlakukan sebagai kegagalan pipeline.
  - Step dipasang sebelum test suite untuk fail-fast ketika environment belum siap.
- Trade-off:
  - Durasi job backend bertambah sedikit karena ada satu command check tambahan.

## 5) File yang Diubah
- `.github/workflows/ci.yml`
- `docs/changes/CHG-20260216-ci-readiness-gate.md`

## 6) Dampak API/DB/Config
- API changes:
  - Tidak ada perubahan endpoint.
- DB migration:
  - Tidak ada migration baru.
- Env/config changes:
  - Workflow CI backend sekarang menjalankan `php artisan ops:readiness:check --strict`.
- Backward compatibility:
  - Additive pada pipeline; runtime aplikasi tidak berubah.

## 7) Testing dan Validasi
- Unit test:
  - Tidak ada unit test baru.
- Integration test:
  - `php artisan test` -> pass (43 tests, 244 assertions).
- Manual verification:
  - `php artisan ops:readiness:check --strict` -> pass (summary: pass=13, warn=0, fail=0).
  - Review workflow memastikan step readiness gate dieksekusi sebelum step test suite.
- Hasil:
  - CI readiness gate berhasil dipasang dan tervalidasi.

## 8) Risiko dan Mitigasi
- Risiko utama:
  - Pipeline bisa gagal pada environment CI yang belum align dengan baseline readiness.
- Mitigasi:
  - Detail check tampil jelas sehingga root cause cepat diidentifikasi dan diperbaiki.

## 9) Rollback Plan
- Langkah rollback jika gagal:
  - Hapus step `Run readiness gate` dari `.github/workflows/ci.yml`.
  - Re-run CI untuk memastikan pipeline kembali normal.

## 10) Changelog Singkat
- `2026-02-16 14:40` - Dokumen perubahan dibuat dengan status planned.
- `2026-02-16 14:43` - Step CI `ops:readiness:check --strict` ditambahkan sebelum test suite.
- `2026-02-16 14:46` - Readiness check strict dan full suite test tervalidasi, dokumen ditutup status done.
