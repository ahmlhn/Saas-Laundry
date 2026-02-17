# CHG-20260216-order-bulk-actions-stage5

## Header
- Change ID: `CHG-20260216-order-bulk-actions-stage5`
- Status: `done`
- Date: `2026-02-16`
- Owner: `codex`
- Related Ticket: `WEB-014`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Bulk action pada order board saat ini masih berupa shell UI (preview), belum menjalankan mutasi status order.
- Solusi yang dilakukan: Menambahkan endpoint web bulk update untuk laundry status, menghubungkan UI bulk action ke backend, dan memastikan transition mengikuti validator forward-only + audit trail.
- Dampak bisnis/user: Admin dapat mempercepat update status order secara massal dengan guard yang konsisten terhadap aturan bisnis.

## 2) Scope
- In scope:
  - Route web bulk action order.
  - Implementasi bulk update laundry status di `OrderBoardController`.
  - Integrasi form bulk action di `orders/index`.
  - Penyesuaian Alpine state untuk submit bulk action.
  - Penambahan test web panel untuk bulk update flow.
- Out of scope:
  - Bulk update courier status.
  - Endpoint API baru untuk bulk operations.

## 3) Acceptance Criteria
1. Bulk action `mark-ready` dan `mark-completed` bekerja dari order board.
2. Transition yang tidak valid tidak mengubah order dan tercatat sebagai skipped.
3. Validasi test (`WebPanelTest`, full suite, build) tetap lulus.

## 4) Implementasi Teknis
- Pendekatan: gunakan status transition validator yang sudah ada untuk setiap order terpilih dalam tenant scope, lalu apply update satu per satu.
- Keputusan teknis penting: bulk action dibatasi ke laundry status dulu agar risiko conflict flow lebih kecil.
- Trade-off: response bulk berupa flash summary (updated/skipped), belum ada report detail per order di UI.

## 5) File yang Diubah
- `docs/changes/CHG-20260216-order-bulk-actions-stage5.md`
- `routes/web.php`
- `app/Http/Controllers/Web/OrderBoardController.php`
- `resources/views/web/orders/index.blade.php`
- `resources/js/app.js`
- `tests/Feature/WebPanelTest.php`

## 6) Dampak API/DB/Config
- API changes: tidak ada.
- DB migration: tidak ada.
- Env/config changes: tidak ada.
- Backward compatibility: additive (web feature).

## 7) Testing dan Validasi
- Unit test: tidak ada.
- Integration test:
  - `php artisan test --testsuite=Feature --filter=WebPanelTest` -> `12 passed (75 assertions)`
  - `php artisan test` -> `58 passed (392 assertions)`
- Manual verification:
  - `npm run build` -> sukses (`vite build` selesai tanpa error)
- Hasil: lulus.

## 8) Risiko dan Mitigasi
- Risiko utama: update massal berpotensi melewati rule status jika validator tidak diterapkan per order.
- Mitigasi: validasi tiap order dengan `OrderStatusTransitionValidator` + tenant/outlet scope check.

## 9) Rollback Plan
- Langkah rollback jika gagal:
  - Revert route/controller/view/js/test yang terkait stage-5.

## 10) Changelog Singkat
- `2026-02-16 23:59` - Dokumen perubahan dibuat dengan status planned.
- `2026-02-17 00:06` - Route web bulk update ditambahkan (`tenant.orders.bulk-update`).
- `2026-02-17 00:12` - `OrderBoardController` ditambah method `bulkUpdate` dengan scope guard, transition validator, audit event, dan WA event enqueue.
- `2026-02-17 00:16` - UI order board bulk shell dihubungkan ke endpoint backend (form submit + selected ids).
- `2026-02-17 00:20` - Alpine state bulk table diperbarui untuk validasi submit dan UX notice.
- `2026-02-17 00:24` - Web panel test ditambah untuk success bulk update dan out-of-scope rejection.
- `2026-02-17 00:29` - Semua test + build lulus, dokumen ditutup status done.
