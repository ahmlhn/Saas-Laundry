# CHG-20260319-laravel13-upgrade-prep

## Header
- Change ID: `CHG-20260319-laravel13-upgrade-prep`
- Status: `done`
- Date: `2026-03-19`
- Owner: `codex`
- Related Ticket: `OPS-013, BE-013`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Proyek membutuhkan jalur upgrade yang jelas dari Laravel 12 ke Laravel 13 tanpa mencampur perubahan dependency major dengan pekerjaan fitur lain.
- Solusi yang akan/dilakukan: Menambahkan checklist upgrade Laravel 13 yang spesifik ke repo ini dan script preflight untuk audit readiness sebelum mengubah `composer.json`.
- Dampak bisnis/user: Tim mendapat panduan eksekusi upgrade yang lebih aman, cepat diaudit, dan lebih kecil risiko regression/deploy error.

## 2) Scope
- In scope:
  - Dokumentasi checklist upgrade Laravel 13
  - Script preflight lokal untuk audit readiness
  - Update README agar artefak upgrade prep mudah ditemukan
- Out of scope:
  - Eksekusi upgrade Laravel 13 aktual
  - Perubahan dependency major pada `composer.json`
  - Perubahan runtime aplikasi

## 3) Acceptance Criteria
1. Tersedia checklist upgrade Laravel 13 yang memuat blocker, target version, langkah eksekusi, validasi, dan rollback.
2. Tersedia script lokal untuk menampilkan kondisi readiness upgrade repository saat ini.
3. README menautkan dokumentasi dan command preflight agar developer lain mudah menjalankannya.

## 4) Implementasi Teknis
- Pendekatan:
  - Merangkum hasil audit dependency dan surface area kode yang relevan dengan upgrade guide Laravel 13.
  - Menambahkan `tools/laravel13-upgrade-preflight.ps1` untuk cek versi PHP, versi paket utama, `composer why-not`, status worktree, dan pattern scan kode.
  - Menambahkan `docs/LARAVEL_13_UPGRADE_CHECKLIST.md` sebagai runbook eksekusi.
- Keputusan teknis penting:
  - Persiapan upgrade dibatasi ke artefak dokumentasi dan tooling; dependency tree tidak diubah pada change ini.
  - Checklist memisahkan langkah "latest 12.x patch" dari "major bump ke 13.x" agar debugging lebih mudah.
- Trade-off:
  - Tim masih perlu menjalankan upgrade aktual di branch terpisah.

## 5) File yang Diubah
- `docs/LARAVEL_13_UPGRADE_CHECKLIST.md`
- `tools/laravel13-upgrade-preflight.ps1`
- `docs/changes/CHG-20260319-laravel13-upgrade-prep.md`
- `README.md`

## 6) Dampak API/DB/Config
- API changes:
  - Tidak ada.
- DB migration:
  - Tidak ada.
- Env/config changes:
  - Tidak ada perubahan runtime config.
- Backward compatibility:
  - Aman; hanya menambah dokumentasi dan tooling lokal.

## 7) Testing dan Validasi
- Unit test:
  - Tidak relevan; tidak ada logic runtime yang diubah.
- Integration test:
  - Script preflight dijalankan untuk memastikan command dan scan dasar berjalan.
- Manual verification:
  - Verifikasi file checklist baru muncul di dokumentasi.
  - Verifikasi README memuat referensi ke checklist dan command preflight.
- Hasil:
  - Artefak persiapan upgrade tersedia dan siap dipakai untuk branch eksekusi upgrade.

## 8) Risiko dan Mitigasi
- Risiko utama:
  - Checklist bisa basi jika versi target Laravel 13 atau paket pendukung bergerak cepat.
- Mitigasi:
  - Preflight script menampilkan versi paket yang terpasang dan hasil `composer why-not` aktual sehingga tetap membantu walau patch berubah.

## 9) Rollback Plan
- Langkah rollback jika gagal:
  - Hapus file checklist dan script preflight.
  - Kembalikan README ke daftar dokumentasi sebelumnya.

## 10) Changelog Singkat
- `2026-03-19 10:40` - Audit dependency dan area risiko upgrade Laravel 13 selesai.
- `2026-03-19 10:55` - Checklist upgrade repo-spesifik dan script preflight ditambahkan.
- `2026-03-19 11:00` - README diperbarui agar command dan dokumen upgrade prep mudah ditemukan.
