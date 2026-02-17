# CHG-20260216-web-panel-archive-restore

## Header
- Change ID: `CHG-20260216-web-panel-archive-restore`
- Status: `done`
- Date: `2026-02-16`
- Owner: `codex`
- Related Ticket: `WEB-006, WEB-007, QA-008`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Endpoint archive/restore master data sudah tersedia di API, tetapi panel web Owner/Admin belum punya aksi operasional untuk menjalankannya.
- Solusi yang akan/dilakukan: Menambahkan aksi archive/restore pada halaman web `Users`, `Outlets`, `Customers`, dan `Services`, termasuk daftar data terarsip dan tombol restore.
- Dampak bisnis/user: Owner/Admin dapat mengelola lifecycle data master langsung dari web panel tanpa perlu call API manual.

## 2) Scope
- In scope:
  - Route web untuk archive/restore users/outlets/customers/services.
  - Logic controller web untuk lifecycle actions per role policy.
  - UI tabel active/archived + tombol archive/restore.
  - Guard bisnis: blok self-archive user, blok archive outlet aktif terakhir.
  - Feature tests untuk lifecycle flow di web panel.
- Out of scope:
  - Hard delete permanen dari web panel.

## 3) Acceptance Criteria
1. Owner bisa archive/restore user dari halaman Users. ✅
2. Owner bisa archive/restore outlet dari halaman Outlets. ✅
3. Admin bisa archive/restore customer dan service dari halaman management. ✅
4. Admin tidak bisa menjalankan aksi owner-only lifecycle di web panel. ✅
5. Guard self-archive dan last-active-outlet berjalan. ✅

## 4) Implementasi Teknis
- Pendekatan:
  - Menambah POST route web untuk action archive/restore.
  - Menambahkan method lifecycle + listing archived di `ManagementController`.
  - Menampilkan dua section pada view: active dan archived untuk semua entitas management.
- Keputusan teknis penting:
  - Lifecycle web dibatasi owner-only melalui helper `ensureOwnerPanelAccess`.
  - Lifecycle `customer/service` mengikuti panel access `owner/admin`.
  - Notifikasi user menggunakan flash `status` dan validation error bag (`lifecycle`).
  - Audit event lifecycle dicatat dengan channel `web`.
- Trade-off:
  - UI management bertambah padat karena menu lifecycle sekarang mencakup empat entitas.

## 5) File yang Diubah
- `app/Http/Controllers/Web/ManagementController.php`
- `routes/web.php`
- `resources/views/web/layouts/app.blade.php`
- `resources/views/web/management/users.blade.php`
- `resources/views/web/management/outlets.blade.php`
- `resources/views/web/management/customers.blade.php`
- `resources/views/web/management/services.blade.php`
- `resources/css/app.css`
- `tests/Feature/WebPanelTest.php`
- `docs/changes/CHG-20260216-web-panel-archive-restore.md`

## 6) Dampak API/DB/Config
- API changes:
  - Tidak ada endpoint API baru.
- DB migration:
  - Tidak ada migration baru.
- Env/config changes:
  - Tidak ada.
- Backward compatibility:
  - Additive pada route dan UI web panel.

## 7) Testing dan Validasi
- Unit test:
  - Tidak ada unit test baru.
- Integration test:
  - `php artisan test --testsuite=Feature --filter=WebPanelTest` -> pass (9 tests, 62 assertions).
  - `php artisan test` -> pass (55 tests, 379 assertions).
- Manual verification:
  - `npm run build` -> sukses.
- Hasil:
  - Web lifecycle users/outlets/customers/services berjalan dan tervalidasi.

## 8) Risiko dan Mitigasi
- Risiko utama:
  - Owner/Admin salah archive data master kritikal dari UI.
- Mitigasi:
  - Guard self-archive user dan blok archive outlet aktif terakhir.
  - Tersedia restore action langsung pada section archived.

## 9) Rollback Plan
- Langkah rollback jika gagal:
  - Revert perubahan route/controller/view/css/test pada batch ini.
  - Jalankan ulang test suite untuk verifikasi rollback.

## 10) Changelog Singkat
- `2026-02-16 20:05` - Route + controller web lifecycle ditambahkan.
- `2026-02-16 20:12` - View users/outlets diperbarui dengan section archived + action buttons.
- `2026-02-16 20:17` - Feature tests web lifecycle ditambahkan dan lulus.
- `2026-02-16 20:23` - Full suite pass + build frontend sukses.
- `2026-02-16 20:34` - Scope diperluas ke customers/services + menu sidebar web panel.
- `2026-02-16 20:39` - Full suite pass (55 tests), dokumen ditutup status done.
