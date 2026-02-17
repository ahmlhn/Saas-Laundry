# CHG-20260216-panel-theme-utility-industrial

## Header
- Change ID: `CHG-20260216-panel-theme-utility-industrial`
- Status: `done`
- Date: `2026-02-16`
- Owner: `codex`
- Related Ticket: `WEB-008, WEB-009`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Visual panel web belum sepenuhnya konsisten untuk tema final yang dipilih (`Utility Industrial`) terutama pada status indicator, hierarchy komponen, dan keterbacaan data padat.
- Solusi yang dilakukan: Menetapkan token tema dan komponen UI seragam (badge status, card accent, section title, table emphasis), menambahkan motion/accessibility baseline, lalu menerapkannya ke halaman panel termasuk login tenant.
- Dampak bisnis/user: Tampilan lebih konsisten, status operasional lebih cepat dipahami, dan UX panel lebih matang untuk penggunaan harian.

## 2) Scope
- In scope:
  - Standardisasi token/komponen CSS untuk tema `Utility Industrial`.
  - Refactor visual halaman: dashboard, order board, WA page, management pages.
  - Normalisasi badge/status semantics lintas halaman.
  - Penyesuaian UI mobile agar tetap terbaca.
- Out of scope:
  - Redesign arsitektur route/controller.
  - Perubahan flow bisnis/API.

## 3) Acceptance Criteria
1. Komponen UI utama menggunakan token tema yang sama.
2. Status operasional ditampilkan dengan badge semantic yang konsisten.
3. Halaman dashboard/order/WA/management tetap lolos test feature web dan build frontend.

## 4) Implementasi Teknis
- Pendekatan: update `resources/css/app.css` lalu adaptasi Blade templates ke utility class baru.
- Keputusan teknis penting: status mapping dilakukan di Blade layer agar tidak mengubah response/controller.
- Trade-off: sebagian mapping status ditulis lokal per view demi implementasi cepat pada fase ini.

## 5) File yang Diubah
- `resources/css/app.css`
- `resources/views/web/dashboard.blade.php`
- `resources/views/web/orders/index.blade.php`
- `resources/views/web/wa/index.blade.php`
- `resources/views/web/management/users.blade.php`
- `resources/views/web/management/outlets.blade.php`
- `resources/views/web/management/customers.blade.php`
- `resources/views/web/management/services.blade.php`
- `resources/views/web/auth/login.blade.php`
- `docs/changes/CHG-20260216-panel-theme-utility-industrial.md`

## 6) Dampak API/DB/Config
- API changes: tidak ada.
- DB migration: tidak ada.
- Env/config changes: tidak ada.
- Backward compatibility: additive (UI-only).

## 7) Testing dan Validasi
- Unit test: tidak ada.
- Integration test:
  - `php artisan test --testsuite=Feature --filter=WebPanelTest` -> `9 passed (62 assertions)`
  - `php artisan test` -> `55 passed (379 assertions)`
- Build verification:
  - `npm run build` -> sukses (`vite build` selesai tanpa error)
- Hasil: lulus.

## 8) Risiko dan Mitigasi
- Risiko utama: perubahan class CSS dapat mengganggu layout existing.
- Mitigasi: verifikasi test + build + review cepat per halaman utama.

## 9) Rollback Plan
- Langkah rollback jika gagal:
  - Revert file CSS dan view yang diubah pada batch tema ini.

## 10) Changelog Singkat
- `2026-02-16 20:48` - Dokumen perubahan dibuat dengan status planned.
- `2026-02-16 22:06` - Implementasi tema `Utility Industrial` diterapkan ke dashboard/order/WA/management, validasi test + build lulus, status diubah ke done.
- `2026-02-16 22:41` - Refinement tema: nav numbering, focus-visible states, subtle entry animation, dan redesign halaman login tenant agar konsisten; validasi test + build tetap lulus.
