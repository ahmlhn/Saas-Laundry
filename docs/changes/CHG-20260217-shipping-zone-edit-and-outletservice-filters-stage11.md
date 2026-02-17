# CHG-20260217-shipping-zone-edit-and-outletservice-filters-stage11

## Header
- Change ID: `CHG-20260217-shipping-zone-edit-and-outletservice-filters-stage11`
- Status: `done`
- Date: `2026-02-17`
- Owner: `codex`
- Related Ticket: `WEB-003`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Shipping zone di web panel belum bisa diedit, dan filter outlet services belum cukup granular untuk operasional.
- Solusi yang dilakukan: Menambah aksi update shipping zone (name/distance/fee/eta/notes) serta memperkaya filter outlet services dengan `service_active` dan `override_price`.
- Dampak bisnis/user: Admin lebih cepat melakukan koreksi tarif zona dan analisis override service per outlet.

## 2) Scope
- In scope:
  - Route update shipping zone.
  - Controller logic update shipping zone + audit event.
  - UI shipping zones: filter list + form update per row.
  - Outlet services: filter lanjutan (`service_active`, `override_price`).
  - Test feature untuk shipping zone edit dan advanced filters outlet services.
- Out of scope:
  - Edit outlet pada shipping zone.
  - Bulk update shipping zone/outlet service.

## 3) Acceptance Criteria
1. Shipping zone bisa diupdate dari web panel dalam scope tenant/outlet.
2. Outlet services mendukung filter service aktif/nonaktif dan has/no override price.
3. Test dan build lulus.

## 4) Implementasi Teknis
- Pendekatan: extend `ManagementController` serta update view management terkait.
- Keputusan teknis penting: update shipping zone tetap mempertahankan outlet asal untuk menghindari perubahan relasi lintas outlet.
- Trade-off: form update shipping zone disajikan per-row (simple SSR), belum modal/AJAX.

## 5) File yang Diubah
- `docs/changes/CHG-20260217-shipping-zone-edit-and-outletservice-filters-stage11.md`
- `routes/web.php`
- `app/Domain/Audit/AuditEventKeys.php`
- `app/Http/Controllers/Web/ManagementController.php`
- `resources/views/web/management/shipping-zones.blade.php`
- `resources/views/web/management/outlet-services.blade.php`
- `tests/Feature/WebPanelTest.php`

## 6) Dampak API/DB/Config
- API changes: tidak ada.
- DB migration: tidak ada.
- Env/config changes: tidak ada.
- Backward compatibility: additive untuk web panel.

## 7) Testing dan Validasi
- Unit test: tidak ada.
- Integration test:
  - `php artisan test --testsuite=Feature --filter=WebPanelTest` -> `23 passed (153 assertions)`
  - `php artisan test` -> `69 passed (470 assertions)`
- Manual verification:
  - `npm run build` -> sukses (`vite build` selesai tanpa error)
- Hasil: lulus.

## 8) Risiko dan Mitigasi
- Risiko utama: update shipping zone menabrak unique constraint nama dalam outlet.
- Mitigasi: validasi `Rule::unique(...)->ignore(...)->where(outlet_id)`.

## 9) Rollback Plan
- Revert perubahan route/controller/view/test/dokumen stage-11.

## 10) Changelog Singkat
- `2026-02-17 03:43` - Dokumen perubahan dibuat dengan status planned.
- `2026-02-17 03:48` - Route update shipping zone ditambahkan (`tenant.shipping-zones.update`).
- `2026-02-17 03:52` - `ManagementController` ditambah flow update shipping zone dan audit `SHIPPING_ZONE_UPDATED`.
- `2026-02-17 03:57` - Halaman shipping zones ditambah filter outlet/status/search dan panel edit per-row.
- `2026-02-17 04:02` - Outlet services ditambah filter lanjutan `service_active` dan `override_price`.
- `2026-02-17 04:09` - Feature test ditambah untuk shipping zone edit dan advanced filters outlet services.
- `2026-02-17 04:16` - Semua test + build lulus, dokumen ditutup status done.
