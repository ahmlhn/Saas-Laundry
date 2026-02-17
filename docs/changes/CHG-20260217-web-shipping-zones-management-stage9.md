# CHG-20260217-web-shipping-zones-management-stage9

## Header
- Change ID: `CHG-20260217-web-shipping-zones-management-stage9`
- Status: `done`
- Date: `2026-02-17`
- Owner: `codex`
- Related Ticket: `WEB-003`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Web panel belum punya halaman manajemen shipping zones, padahal ini bagian dari WEB-003.
- Solusi yang dilakukan: Menambah halaman Shipping Zones di web management dengan fitur list + create + activate/deactivate sesuai tenant/outlet scope.
- Dampak bisnis/user: Admin bisa mengelola tarif antar-jemput per outlet langsung dari panel web tanpa API call manual.

## 2) Scope
- In scope:
  - Route web shipping zones.
  - Menu navigasi ke shipping zones.
  - Halaman list shipping zones aktif/nonaktif.
  - Form create shipping zone.
  - Action activate/deactivate shipping zone.
  - Audit event untuk create/activate/deactivate.
  - Feature test web panel shipping zones.
- Out of scope:
  - Soft delete shipping zones.
  - Bulk import zones.

## 3) Acceptance Criteria
1. Owner/Admin dapat melihat shipping zones sesuai scope outlet.
2. Owner/Admin dapat membuat shipping zone untuk outlet yang boleh diakses.
3. Owner/Admin dapat deactivate/activate shipping zone dalam scope.
4. Test + build lulus.

## 4) Implementasi Teknis
- Pendekatan: extend `ManagementController` dan reuse pola view management existing.
- Keputusan teknis penting: lifecycle shipping zone memakai flag `active` (bukan soft delete) sesuai model tabel.
- Trade-off: form create masih basic (tanpa edit inline).

## 5) File yang Diubah
- `docs/changes/CHG-20260217-web-shipping-zones-management-stage9.md`
- `routes/web.php`
- `resources/views/web/layouts/app.blade.php`
- `resources/views/web/management/shipping-zones.blade.php`
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
  - `php artisan test --testsuite=Feature --filter=WebPanelTest` -> `20 passed (127 assertions)`
  - `php artisan test` -> `66 passed (444 assertions)`
- Manual verification:
  - `npm run build` -> sukses (`vite build` selesai tanpa error)
- Hasil: lulus.

## 8) Risiko dan Mitigasi
- Risiko utama: admin mengelola zone outlet di luar assignment.
- Mitigasi: enforce outlet scope check sebelum create/activate/deactivate.

## 9) Rollback Plan
- Revert perubahan route/controller/view/layout/test/dokumentasi stage-9.

## 10) Changelog Singkat
- `2026-02-17 02:18` - Dokumen perubahan dibuat dengan status planned.
- `2026-02-17 02:22` - Route web + menu panel untuk shipping zones ditambahkan.
- `2026-02-17 02:28` - `ManagementController` ditambah flow shipping zones: list, create, activate, deactivate dengan scope guard.
- `2026-02-17 02:31` - Halaman `web/management/shipping-zones` dibuat untuk create form dan tabel aktif/nonaktif.
- `2026-02-17 02:34` - Audit event keys shipping zone ditambahkan (`CREATED`, `DEACTIVATED`, `ACTIVATED`).
- `2026-02-17 02:38` - Feature test web panel ditambah untuk create/toggle shipping zone dan guard out-of-scope outlet.
- `2026-02-17 02:44` - Semua test + build lulus, dokumen ditutup status done.
