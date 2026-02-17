# CHG-20260216-tailadmin-dashboard-stage2

## Header
- Change ID: `CHG-20260216-tailadmin-dashboard-stage2`
- Status: `done`
- Date: `2026-02-16`
- Owner: `codex`
- Related Ticket: `WEB-011`

## 1) Ringkasan Perubahan
- Masalah/tujuan: User meminta kelanjutan adopsi TailAdmin dengan fokus dua area: komponen dashboard yang lebih advanced (trend/chart cards) dan perapian ikon/menu/sidebar agar makin dekat struktur TailAdmin.
- Solusi yang dilakukan: Menambah agregasi data trend di controller dashboard, membuat komponen chart card di Blade dashboard, lalu memperbarui layout sidebar (menu group + icon + collapse behavior) dan dukungan JS/CSS untuk interaksi.
- Dampak bisnis/user: Dashboard memberi insight lebih kaya (tren order/revenue/status) dan navigasi panel terasa lebih profesional/familiar.

## 2) Scope
- In scope:
  - Data agregasi dashboard untuk chart/trend card.
  - Komponen visual baru di halaman dashboard.
  - Refine sidebar/menu/header (grouping, icon, collapse desktop, toggle mobile).
  - Penyesuaian CSS/JS agar interaksi dan responsivitas tetap stabil.
- Out of scope:
  - Perubahan API bisnis.
  - Penambahan modul eksternal chart kompleks yang tidak diperlukan.

## 3) Acceptance Criteria
1. Dashboard menampilkan komponen trend/chart yang berbasis data real tenant.
2. Sidebar menampilkan ikon + grouping menu dan mendukung collapse behavior di desktop.
3. WebPanelTest, full test suite, dan build frontend tetap lulus.

## 4) Implementasi Teknis
- Pendekatan: extend controller dashboard untuk menyediakan dataset visual, render chart sederhana via JS helper internal (SVG sparkline) agar dependency tetap ringan.
- Keputusan teknis penting: tidak menambah chart library heavy; visual chart dibuat custom dengan SVG data-driven.
- Trade-off: fitur chart tidak sekompleks TailAdmin full version, tetapi cukup representatif dan maintainable untuk MVP panel.

## 5) File yang Diubah
- `docs/changes/CHG-20260216-tailadmin-dashboard-stage2.md`
- `app/Http/Controllers/Web/DashboardController.php`
- `resources/views/web/dashboard.blade.php`
- `resources/views/web/layouts/app.blade.php`
- `resources/js/app.js`
- `resources/css/app.css`

## 6) Dampak API/DB/Config
- API changes: tidak ada.
- DB migration: tidak ada.
- Env/config changes: tidak ada.
- Backward compatibility: additive (UI/controller web dashboard).

## 7) Testing dan Validasi
- Unit test: tidak ada.
- Integration test:
  - `php artisan test --testsuite=Feature --filter=WebPanelTest` -> `9 passed (62 assertions)`
  - `php artisan test` -> `55 passed (379 assertions)`
- Manual verification:
  - `npm run build` -> sukses (`vite build` selesai tanpa error)
- Hasil: lulus.

## 8) Risiko dan Mitigasi
- Risiko utama: query agregasi baru bisa menambah beban halaman dashboard.
- Mitigasi: agregasi dibatasi rentang waktu pendek dan query menggunakan grouping sederhana.

## 9) Rollback Plan
- Langkah rollback jika gagal:
  - Revert perubahan controller dashboard, layout/view dashboard, js/css batch ini.

## 10) Changelog Singkat
- `2026-02-16 23:23` - Dokumen perubahan dibuat dengan status planned.
- `2026-02-16 23:29` - Dashboard controller ditambah dataset trend (7 hari), baseline month-over-month, status distribution, dan top outlet revenue.
- `2026-02-16 23:34` - Dashboard view ditingkatkan dengan trend cards, sparkline chart, pipeline distribution, dan top outlet panel.
- `2026-02-16 23:39` - Sidebar di-refine: grouped menu, ikon per item, collapse desktop, serta toggle header.
- `2026-02-16 23:43` - JS/CSS disesuaikan untuk render chart SVG ringan, dark mode, collapse behavior, dan responsive layout.
- `2026-02-16 23:47` - Seluruh validasi test + build lulus, dokumen ditutup status done.
- `2026-02-16 23:54` - Minor polish collapsed sidebar (brand mark) dan re-run validasi `WebPanelTest` + `npm run build` tetap lulus.
- `2026-02-16 23:58` - Minor compatibility tweak pada renderer chart JS (tanpa `Array.at`) dan verifikasi `npm run build` tetap lulus.
- `2026-02-17 00:01` - Re-run full suite `php artisan test` setelah tweak terakhir, hasil tetap lulus (`55 passed`).
