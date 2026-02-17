# CHG-20260217-web-outlet-service-override-stage10

## Header
- Change ID: `CHG-20260217-web-outlet-service-override-stage10`
- Status: `done`
- Date: `2026-02-17`
- Owner: `codex`
- Related Ticket: `WEB-003`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Web panel belum menyediakan pengelolaan outlet service override (harga/SLA/aktif) padahal ini bagian WEB-003.
- Solusi yang dilakukan: Menambah halaman Outlet Service Overrides dengan fitur list, create/upsert, dan update override per outlet-service dalam scope tenant/outlet.
- Dampak bisnis/user: Admin dapat mengelola variasi harga layanan per outlet langsung dari panel web.

## 2) Scope
- In scope:
  - Route web untuk outlet service overrides.
  - Menu navigasi ke halaman outlet service overrides.
  - Halaman list + filter overrides.
  - Form upsert override (create/update by outlet+service).
  - Action update override per row.
  - Audit event untuk upsert/update override.
  - Feature test web panel untuk flow override.
- Out of scope:
  - Bulk import/export override.
  - Versioning histori harga.

## 3) Acceptance Criteria
1. Owner/Admin dapat melihat override sesuai scope outlet.
2. Owner/Admin dapat membuat/memperbarui override outlet-service.
3. Admin tidak bisa mengelola override untuk outlet di luar assignment.
4. Test + build lulus.

## 4) Implementasi Teknis
- Pendekatan: extend `ManagementController` dengan query scope outlet, dan render halaman management baru.
- Keputusan teknis penting: record override menggunakan tabel `outlet_services` (unique outlet_id + service_id), sehingga create/update memakai upsert.
- Trade-off: edit masih berbasis form standar per-row (belum inline AJAX).

## 5) File yang Diubah
- `docs/changes/CHG-20260217-web-outlet-service-override-stage10.md`
- `routes/web.php`
- `resources/views/web/layouts/app.blade.php`
- `resources/views/web/management/outlet-services.blade.php`
- `app/Http/Controllers/Web/ManagementController.php`
- `app/Domain/Audit/AuditEventKeys.php`
- `tests/Feature/WebPanelTest.php`

## 6) Dampak API/DB/Config
- API changes: tidak ada.
- DB migration: tidak ada.
- Env/config changes: tidak ada.
- Backward compatibility: additive untuk web panel.

## 7) Testing dan Validasi
- Unit test: tidak ada.
- Integration test:
  - `php artisan test --testsuite=Feature --filter=WebPanelTest` -> `22 passed (144 assertions)`
  - `php artisan test` -> `68 passed (461 assertions)`
- Manual verification:
  - `npm run build` -> sukses (`vite build` selesai tanpa error)
- Hasil: lulus.

## 8) Risiko dan Mitigasi
- Risiko utama: override salah scope outlet menyebabkan konfigurasi lintas outlet tidak valid.
- Mitigasi: scope check outlet di controller sebelum upsert/update.

## 9) Rollback Plan
- Revert perubahan route/layout/controller/view/test/dokumentasi stage-10.

## 10) Changelog Singkat
- `2026-02-17 02:58` - Dokumen perubahan dibuat dengan status planned.
- `2026-02-17 03:04` - Route web outlet service overrides ditambahkan (`index`, `upsert`, `update`).
- `2026-02-17 03:07` - Sidebar management ditambah menu `Outlet Services`.
- `2026-02-17 03:14` - `ManagementController` ditambah flow outlet service override dengan scope guard outlet.
- `2026-02-17 03:18` - Halaman `web/management/outlet-services` dibuat (filter + upsert + row update).
- `2026-02-17 03:22` - Audit event keys override ditambahkan (`OUTLET_SERVICE_OVERRIDE_UPSERTED`, `OUTLET_SERVICE_OVERRIDE_UPDATED`).
- `2026-02-17 03:27` - Feature test web panel ditambah untuk upsert/update dan out-of-scope guard.
- `2026-02-17 03:33` - Semua test + build lulus, dokumen ditutup status done.
