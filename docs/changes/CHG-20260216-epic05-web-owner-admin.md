# CHG-20260216-epic05-web-owner-admin

## Header
- Change ID: `CHG-20260216-epic05-web-owner-admin`
- Status: `done`
- Date: `2026-02-16`
- Owner: `codex`
- Related Ticket: `WEB-001, WEB-002, WEB-003, WEB-004, WEB-005`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Menyediakan Web MVP untuk Owner/Admin sesuai EPIC-05.
- Solusi yang akan/dilakukan: Menambahkan tenant path routing berbasis web session auth, middleware validasi tenant path, halaman dashboard/order/users/outlets/WA, dan pengaturan WA provider dasar di panel web.
- Dampak bisnis/user: Owner/Admin kini dapat mengakses panel web operasional dengan tenant scope yang aman, termasuk monitoring order dan WA logs.

## 2) Scope
- In scope:
  - Web login/logout berbasis session (`/t/{tenant}/login`)
  - Tenant path routing panel (`/t/{tenant}/*`)
  - Dashboard owner/admin
  - Order board (list + filter)
  - Users list
  - Outlets list
  - WhatsApp page (provider config + templates source + logs)
  - Plan gate WA di web panel
  - Feature tests untuk web flow utama
- Out of scope:
  - Inertia SPA full stack
  - CRUD penuh user/outlet/order via web panel
  - POS kasir offline

## 3) Acceptance Criteria
1. Owner/Admin bisa login via tenant path dan membuka dashboard.
2. Role non Owner/Admin ditolak akses web panel.
3. Tenant path mismatch ditolak.
4. WA page hanya tersedia untuk Premium/Pro.
5. Halaman order/user/outlet tampil dalam scope tenant.

## 4) Implementasi Teknis
- Pendekatan:
  - Laravel Blade SSR + web controller terpisah dari API controller.
  - Middleware `EnsureTenantPathAccess` untuk enforce path tenant vs user tenant.
  - Shared access helper via trait `EnsuresWebPanelAccess`.
- Keputusan teknis penting:
  - Route panel menggunakan path-based tenant routing (`/t/{tenant}`) sesuai DEC-001.
  - Web auth menggunakan guard session Laravel default.
  - WA plan gate web reuse `PlanFeatureGateService` dari EPIC-04.
- Trade-off:
  - Halaman management masih fokus list/read-heavy (belum full CRUD complex).
  - WA provider config web MVP fokus penggunaan provider mock yang sudah tersedia.

## 5) File yang Diubah
- `routes/web.php`
- `bootstrap/app.php`
- `app/Http/Middleware/EnsureTenantPathAccess.php`
- `app/Http/Controllers/Web/AuthController.php`
- `app/Http/Controllers/Web/DashboardController.php`
- `app/Http/Controllers/Web/OrderBoardController.php`
- `app/Http/Controllers/Web/ManagementController.php`
- `app/Http/Controllers/Web/WaSettingsController.php`
- `app/Http/Controllers/Web/Concerns/EnsuresWebPanelAccess.php`
- `app/Models/Outlet.php`
- `resources/views/web/layouts/app.blade.php`
- `resources/views/web/auth/login.blade.php`
- `resources/views/web/dashboard.blade.php`
- `resources/views/web/orders/index.blade.php`
- `resources/views/web/management/users.blade.php`
- `resources/views/web/management/outlets.blade.php`
- `resources/views/web/wa/index.blade.php`
- `resources/css/app.css`
- `tests/Feature/WebPanelTest.php`

## 6) Dampak API/DB/Config
- API changes:
  - Tidak ada perubahan kontrak endpoint API existing.
- DB migration:
  - Tidak ada migration tambahan final untuk EPIC-05.
- Env/config changes:
  - Tidak ada env wajib baru.
- Backward compatibility:
  - Additive (fitur web baru, tidak memutus flow API).

## 7) Testing dan Validasi
- Unit test:
  - Tidak ada unit test baru khusus web.
- Integration test:
  - `php artisan test --testsuite=Feature --filter=WebPanelTest` -> pass (4 tests, 15 assertions).
  - `php artisan test` -> pass (28 tests, 129 assertions).
- Manual verification:
  - `php artisan route:list --path="t/"` -> route web tenant panel terdaftar.
  - `php artisan migrate:fresh --seed --force` -> sukses.
  - `npm install` -> sukses.
  - `npm run build` -> sukses (`public/build/manifest.json` terbuat).
- Hasil:
  - EPIC-05 web owner/admin MVP selesai untuk scope backend+blade.

## 8) Risiko dan Mitigasi
- Risiko utama:
  - Role/policy mismatch di web routes bisa membuka akses tidak semestinya.
- Mitigasi:
  - Enforce guard di middleware tenant path + role check terpusat trait + feature test akses.

## 9) Rollback Plan
- Revert perubahan route web, middleware, web controllers, views, style, dan test EPIC-05.

## 10) Changelog Singkat
- `2026-02-16 09:10` - Dokumen perubahan dibuat dengan status planned.
- `2026-02-16 09:35` - Routing + middleware + web controllers ditambahkan.
- `2026-02-16 09:50` - Blade views + style panel selesai.
- `2026-02-16 10:05` - Feature tests web ditambahkan dan full suite pass.
- `2026-02-16 10:12` - Build frontend berhasil (`npm run build`).
- `2026-02-16 10:13` - Dokumen ditutup status done.
