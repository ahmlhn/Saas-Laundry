# CHG-20260217-web-tx-001-order-create

## Header
- Change ID: `CHG-20260217-web-tx-001-order-create`
- Status: `done`
- Date: `2026-02-17`
- Owner: `codex`
- Related Ticket: `WEB-TX-001`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Belum ada alur transaksi create order langsung dari web panel.
- Solusi yang dilakukan: Menambahkan route + controller + halaman form untuk membuat transaksi baru dari web, termasuk validasi scope outlet, kalkulasi total order, kuota, audit, dan redirect ke halaman detail order.
- Dampak bisnis/user: Owner/Admin kini bisa memulai transaksi order langsung dari web tanpa lewat API client eksternal.

## 2) Scope
- In scope:
  - Route web create/store order.
  - Halaman "Buat Transaksi" berbasis Blade.
  - Persist order + item + customer upsert via web flow.
  - Validasi outlet scope user web panel.
  - Test coverage web panel untuk create order via web.
- Out of scope:
  - Multi item builder dinamis (akan dikerjakan di WEB-TX-003).
  - Quick search customer AJAX (akan dikerjakan di WEB-TX-002).

## 3) Acceptance Criteria
1. Admin dapat membuka halaman create transaksi dari web panel.
2. Admin dapat submit transaksi dan order tersimpan dengan total/due yang benar.
3. Submit outlet di luar scope ditolak.

## 4) Implementasi Teknis
- Pendekatan:
  - Menambahkan endpoint web baru (`GET /orders/create`, `POST /orders`).
  - Menambahkan method `create` dan `store` di `OrderBoardController`.
  - Menggunakan proses server-side authoritative untuk total order, quota consume, customer upsert, dan item snapshot.
- Keputusan teknis penting:
  - Scope outlet divalidasi ulang di server meskipun outlet sudah dibatasi di form.
  - Order create web menggunakan channel `web` untuk audit/source tracking.
  - Form item awal dibuat 1 baris agar delivery cepat; multi-row builder ditunda ke ticket berikut.
- Trade-off:
  - Ada duplikasi sebagian logic create order dari API controller (akan dirapikan saat fase refactor service bersama).

## 5) File yang Diubah
- `routes/web.php`
- `app/Http/Controllers/Web/OrderBoardController.php`
- `resources/views/web/orders/create.blade.php`
- `resources/views/web/orders/index.blade.php`
- `tests/Feature/WebPanelTest.php`
- `docs/changes/CHG-20260217-web-tx-001-order-create.md`

## 6) Dampak API/DB/Config
- API changes: tidak ada endpoint API baru.
- DB migration: tidak ada.
- Env/config changes: tidak ada.
- Backward compatibility: additive untuk web route/view; endpoint existing tidak berubah.

## 7) Testing dan Validasi
- Unit test: tidak ada test unit baru.
- Integration test:
  - `php artisan test --testsuite=Feature --filter=WebPanelTest` -> `28 passed (194 assertions)`.
  - `php artisan test` -> `74 passed (511 assertions)`.
- Manual verification:
  - `npm run build` -> sukses.
- Hasil: lulus.

## 8) Risiko dan Mitigasi
- Risiko utama: logic create order web berpotensi divergen dari API jika berubah di masa depan.
- Mitigasi: jadwalkan refactor shared order creation service setelah WF-01 selesai.

## 9) Rollback Plan
- Revert route `tenant.orders.create/store`, method baru di `OrderBoardController`, view `web/orders/create`, perubahan index, dan test terkait.

## 10) Changelog Singkat
- `2026-02-17 11:22` - Route create/store order web ditambahkan.
- `2026-02-17 11:30` - Controller create/store transaction web selesai (quota, audit, wa enqueue pickup).
- `2026-02-17 11:36` - View `orders/create` ditambahkan dan CTA dari order index dipasang.
- `2026-02-17 11:42` - Test WebPanel diperluas untuk create order + guard scope outlet.
- `2026-02-17 11:46` - Full test suite + build lulus, dokumen ditutup status done.
