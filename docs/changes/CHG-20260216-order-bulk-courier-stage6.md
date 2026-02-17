# CHG-20260216-order-bulk-courier-stage6

## Header
- Change ID: `CHG-20260216-order-bulk-courier-stage6`
- Status: `done`
- Date: `2026-02-16`
- Owner: `codex`
- Related Ticket: `WEB-015`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Bulk action sudah aktif untuk laundry status, tetapi belum mencakup courier pipeline. Row action dropdown juga belum sepenuhnya mengeksekusi aksi backend langsung.
- Solusi yang dilakukan: Menambah bulk action courier (`delivery_pending`, `delivery_on_the_way`, `delivered`) dengan rule guard sesuai state machine, serta menambahkan action backend langsung dari dropdown per-row menggunakan endpoint bulk yang sama.
- Dampak bisnis/user: Admin dapat mengeksekusi perubahan status operasional lebih cepat untuk skenario delivery tanpa keluar dari order board.

## 2) Scope
- In scope:
  - Extend valid action pada endpoint bulk web order.
  - Implement logic bulk courier status transition + guard laundry ready sebelum delivery pending.
  - Integrasi row actions agar bisa trigger status update backend per-order.
  - Tambahan test untuk flow courier bulk.
- Out of scope:
  - Endpoint API baru.
  - Automasi assignment courier dalam bulk.

## 3) Acceptance Criteria
1. Bulk action courier dapat mengubah status order yang valid dalam tenant/outlet scope.
2. Order yang tidak memenuhi rule transition atau guard laundry tidak diubah (skipped).
3. Row dropdown dapat mengeksekusi aksi single-order ke backend.
4. Test dan build tetap lulus.

## 4) Implementasi Teknis
- Pendekatan: reuse endpoint bulk update untuk action laundry/courier; row action mengirim payload single selected id.
- Keputusan teknis penting: satu endpoint untuk semua bulk/single action agar konsisten audit dan validasi.
- Trade-off: payload response tetap summary sederhana updated/skipped, belum detail per order.

## 5) File yang Diubah
- `docs/changes/CHG-20260216-order-bulk-courier-stage6.md`
- `app/Http/Controllers/Web/OrderBoardController.php`
- `resources/views/web/orders/index.blade.php`
- `resources/css/app.css`
- `tests/Feature/WebPanelTest.php`

## 6) Dampak API/DB/Config
- API changes: tidak ada.
- DB migration: tidak ada.
- Env/config changes: tidak ada.
- Backward compatibility: additive (web behavior).

## 7) Testing dan Validasi
- Unit test: tidak ada.
- Integration test:
  - `php artisan test --testsuite=Feature --filter=WebPanelTest` -> `14 passed (89 assertions)`
  - `php artisan test` -> `60 passed (406 assertions)`
- Manual verification:
  - `npm run build` -> sukses (`vite build` selesai tanpa error)
- Hasil: lulus.

## 8) Risiko dan Mitigasi
- Risiko utama: courier transition invalid jika action dilakukan pada order non pickup-delivery atau status tidak berurutan.
- Mitigasi: validasi dengan `OrderStatusTransitionValidator` + guard business rules per order.

## 9) Rollback Plan
- Langkah rollback jika gagal:
  - Revert perubahan controller/view/js/css/test pada stage-6.

## 10) Changelog Singkat
- `2026-02-16 23:59` - Dokumen perubahan dibuat dengan status planned.
- `2026-02-17 00:33` - Endpoint bulk action diperluas untuk courier action (`delivery_pending`, `delivery_on_the_way`, `delivered`) dengan guard dan audit event courier.
- `2026-02-17 00:38` - Row action dropdown di order board dihubungkan ke backend action per-order via endpoint bulk yang sama.
- `2026-02-17 00:42` - Styling dropdown action disesuaikan agar `form > button` konsisten dengan item menu lain.
- `2026-02-17 00:47` - Web panel test ditambah untuk courier bulk success flow dan guard skip saat laundry belum ready.
- `2026-02-17 00:54` - Semua test + build lulus, dokumen ditutup status done.
