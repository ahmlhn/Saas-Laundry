# CHG-20260216-uiux-redesign-all-pages-stage15

## Header
- Change ID: `CHG-20260216-uiux-redesign-all-pages-stage15`
- Status: `done`
- Date: `2026-02-16`
- Owner: `codex`
- Related Ticket: `WEB-005`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Perlu redesign menyeluruh agar seluruh halaman panel tampil modern, profesional, dan konsisten secara bahasa serta hierarchy informasi.
- Solusi yang akan/dilakukan: Menstandarkan pattern UI lintas halaman (hero, section, table/form shell, dan login screen) dengan pendekatan design system yang seragam.
- Dampak bisnis/user: Pengalaman operasional harian lebih jelas, cepat dipindai, dan siap dipakai pada demo maupun produksi.

## 2) Scope
- In scope:
  - Redesign semua halaman web panel dan login.
  - Konsistensi copy Bahasa Indonesia pada heading/deskripsi antarmodul.
  - Penyelarasan komponen visual lintas halaman.
- Out of scope:
  - Perubahan logic bisnis/API.
  - Perubahan skema database.

## 3) Acceptance Criteria
1. Semua halaman web panel memiliki pola visual modern yang konsisten.
2. Bahasa antarmuka antar halaman konsisten dan mudah dipahami.
3. Feature test web panel, full test suite, dan build frontend lulus.

## 4) Implementasi Teknis
- Pendekatan: Memperluas design system CSS global lalu menerapkan ulang struktur tiap Blade view dengan page-hero dan section hierarchy yang seragam.
- Keputusan teknis penting: Mempertahankan route/form action dan marker teks penting agar tidak merusak coverage test yang sudah ada.
- Trade-off: Fokus pada UX dan presentasi; interaksi tingkat lanjut (mis. widgets real-time tambahan) ditunda.

## 5) File yang Akan/Diubah
- `resources/css/app.css`
- `resources/views/web/dashboard.blade.php`
- `resources/views/web/orders/index.blade.php`
- `resources/views/web/orders/show.blade.php`
- `resources/views/web/wa/index.blade.php`
- `resources/views/web/management/users.blade.php`
- `resources/views/web/management/customers.blade.php`
- `resources/views/web/management/services.blade.php`
- `resources/views/web/management/outlets.blade.php`
- `resources/views/web/management/outlet-services.blade.php`
- `resources/views/web/management/shipping-zones.blade.php`
- `resources/views/web/auth/login.blade.php`
- `docs/changes/CHG-20260216-uiux-redesign-all-pages-stage15.md`

## 6) Dampak API/DB/Config
- API changes: tidak ada.
- DB migration: tidak ada.
- Env/config changes: tidak ada.
- Backward compatibility: aman, perubahan hanya di layer presentasi.

## 7) Testing dan Validasi
- Unit test: tidak ada perubahan khusus.
- Integration test:
  - `php artisan test --testsuite=Feature --filter=WebPanelTest` -> `26 passed (181 assertions)`.
  - `php artisan test` -> `72 passed (498 assertions)`.
- Manual verification:
  - `npm run build` -> sukses (`vite build` selesai tanpa error).
- Hasil: lulus.

## 8) Risiko dan Mitigasi
- Risiko utama: perubahan markup besar dapat memengaruhi teks yang diassert test atau responsivitas mobile.
- Mitigasi: pertahankan label kunci, jalankan test suite + build, lalu perbaikan cepat jika ada regressions.

## 9) Rollback Plan
- Revert semua file UI/CSS yang tersentuh pada perubahan stage ini.

## 10) Changelog Singkat
- `2026-02-16 09:20` - Dokumen perubahan dibuat dengan status `in_progress`.
- `2026-02-16 09:27` - Design system diperluas (`page-shell`, `page-hero`, `hero-kpi`) dan penyegaran auth layout.
- `2026-02-16 09:36` - Semua halaman web utama direfactor ke pola hero + section hierarchy yang konsisten.
- `2026-02-16 09:38` - Test suite dan build frontend lulus; status diubah ke `done`.
- `2026-02-16 10:06` - Perbaikan UX pasca-review: atasi overflow horizontal panel desktop (`panel-main width calc`), rapikan komposisi hero, dan ubah grid metric/filter menjadi lebih adaptif.
