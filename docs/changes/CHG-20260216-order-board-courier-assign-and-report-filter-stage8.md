# CHG-20260216-order-board-courier-assign-and-report-filter-stage8

## Header
- Change ID: `CHG-20260216-order-board-courier-assign-and-report-filter-stage8`
- Status: `done`
- Date: `2026-02-16`
- Owner: `codex`
- Related Ticket: `WEB-017, WEB-018`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Order Board belum mendukung assign courier dari web panel (single + bulk), dan bulk report belum punya filter/search reason.
- Solusi yang dilakukan: Menambah bulk/single action assign courier di endpoint web yang sama, lalu menambah filter/search interaktif pada tabel Bulk Action Report.
- Dampak bisnis/user: Admin bisa assignment courier lebih cepat langsung dari board, serta lebih mudah triage order skipped berdasarkan reason.

## 2) Scope
- In scope:
  - Menambah action `assign-courier` di web bulk endpoint.
  - Menambah daftar courier aktif di halaman order board.
  - Menambah UI assign courier (bulk + single row action).
  - Menambah filter/search reason pada bulk report.
  - Menambah test feature untuk assign courier + report filter section.
- Out of scope:
  - Endpoint API baru.
  - Auto assignment logic berbasis area/zone.

## 3) Acceptance Criteria
1. Admin bisa assign courier untuk order pickup-delivery via bulk dan row action.
2. Order non pickup-delivery di-skip dengan reason jelas pada bulk report.
3. Bulk report punya kontrol search dan reason filter.
4. Test dan build tetap lulus.

## 4) Implementasi Teknis
- Pendekatan: reuse `tenant.orders.bulk-update` dengan action baru `assign-courier` dan payload `courier_user_id`.
- Keputusan teknis penting: assignment tetap masuk pipeline audit `ORDER_COURIER_ASSIGNED` dan summary/report standar.
- Trade-off: row action assign tampil sebagai daftar courier langsung di dropdown (belum modal picker).

## 5) File yang Diubah
- `docs/changes/CHG-20260216-order-board-courier-assign-and-report-filter-stage8.md`
- `app/Http/Controllers/Web/OrderBoardController.php`
- `resources/views/web/orders/index.blade.php`
- `resources/js/app.js`
- `tests/Feature/WebPanelTest.php`

## 6) Dampak API/DB/Config
- API changes: tidak ada.
- DB migration: tidak ada.
- Env/config changes: tidak ada.
- Backward compatibility: additive untuk UX web panel.

## 7) Testing dan Validasi
- Unit test: tidak ada.
- Integration test:
  - `php artisan test --testsuite=Feature --filter=WebPanelTest` -> `18 passed (106 assertions)`
  - `php artisan test` -> `64 passed (423 assertions)`
- Manual verification:
  - `npm run build` -> sukses (`vite build` selesai tanpa error)
- Hasil: lulus.

## 8) Risiko dan Mitigasi
- Risiko utama: dropdown row action jadi panjang jika jumlah courier banyak.
- Mitigasi: sementara tetap functional-first; nanti bisa di-upgrade ke modal/picker jika dibutuhkan.

## 9) Rollback Plan
- Revert perubahan controller/view/js/test/dokumen stage-8.

## 10) Changelog Singkat
- `2026-02-17 01:36` - Dokumen perubahan dibuat dengan status planned.
- `2026-02-17 01:44` - Action `assign-courier` ditambahkan pada endpoint web bulk update dengan audit `ORDER_COURIER_ASSIGNED`.
- `2026-02-17 01:49` - Order Board menampilkan courier picker untuk bulk assign + row actions assign per order.
- `2026-02-17 01:54` - Bulk Action Report ditambah search + reason filter berbasis Alpine.
- `2026-02-17 02:01` - Feature test ditambah untuk assign courier flow dan render kontrol filter report.
- `2026-02-17 02:07` - Semua test + build lulus, dokumen ditutup status done.
