# CHG-20260216-tailadmin-order-detail-stage4

## Header
- Change ID: `CHG-20260216-tailadmin-order-detail-stage4`
- Status: `done`
- Date: `2026-02-16`
- Owner: `codex`
- Related Ticket: `WEB-013`

## 1) Ringkasan Perubahan
- Masalah/tujuan: User meminta lanjutan tema dengan dua peningkatan UX operasional: row action dropdown + bulk action shell pada tabel, serta halaman order detail dengan info cards dan timeline status.
- Solusi yang dilakukan: Menambah route/controller/view order detail, memperluas halaman order board dengan kontrol bulk shell, dan menambah komponen dropdown actions per baris.
- Dampak bisnis/user: Navigasi order jadi lebih cepat, konteks order lebih lengkap, dan fondasi bulk operation siap untuk implementasi aksi backend berikutnya.

## 2) Scope
- In scope:
  - Route dan halaman web `order detail`.
  - Timeline visual laundry/courier pada order detail.
  - Dropdown actions per row pada order board.
  - Bulk action shell (UI state + selected counter, tanpa aksi mutasi backend).
- Out of scope:
  - Implementasi aksi bulk mutasi ke backend.
  - Perubahan API mobile/sync.

## 3) Acceptance Criteria
1. Order board menampilkan row action dropdown dan bulk selection shell.
2. Halaman order detail bisa diakses sesuai tenant/outlet scope owner/admin.
3. WebPanelTest, full suite, dan build frontend tetap lulus.

## 4) Implementasi Teknis
- Pendekatan: tambah method `show` pada `OrderBoardController`, route baru `tenant.orders.show`, komponen Alpine untuk state bulk table, dan styling timeline/detail card.
- Keputusan teknis penting: bulk action disiapkan sebagai shell UI (preview behavior) agar aman tanpa menambah endpoint baru.
- Trade-off: aksi bulk belum menulis data, tetapi struktur UI dan state management sudah siap untuk tahap implementasi berikutnya.

## 5) File yang Diubah
- `docs/changes/CHG-20260216-tailadmin-order-detail-stage4.md`
- `routes/web.php`
- `app/Http/Controllers/Web/OrderBoardController.php`
- `resources/views/web/orders/index.blade.php`
- `resources/views/web/orders/show.blade.php`
- `resources/js/app.js`
- `resources/css/app.css`
- `tests/Feature/WebPanelTest.php`

## 6) Dampak API/DB/Config
- API changes: tidak ada.
- DB migration: tidak ada.
- Env/config changes: tidak ada.
- Backward compatibility: additive (web route/view/controller).

## 7) Testing dan Validasi
- Unit test: tidak ada.
- Integration test:
  - `php artisan test --testsuite=Feature --filter=WebPanelTest` -> `10 passed (65 assertions)`
  - `php artisan test` -> `56 passed (382 assertions)`
- Manual verification:
  - `npm run build` -> sukses (`vite build` selesai tanpa error)
- Hasil: lulus.

## 8) Risiko dan Mitigasi
- Risiko utama: route/detail baru bisa membuka akses lintas outlet jika scope guard tidak tepat.
- Mitigasi: enforce tenant/outlet scope di query `show` dan tambahkan test akses detail.

## 9) Rollback Plan
- Langkah rollback jika gagal:
  - Revert perubahan route, controller, view orders, js/css, dan test stage-4.

## 10) Changelog Singkat
- `2026-02-16 23:59` - Dokumen perubahan dibuat dengan status planned.
- `2026-02-17 00:08` - Route order detail (`tenant.orders.show`) dan method `show` pada `OrderBoardController` ditambahkan dengan tenant/outlet scope guard.
- `2026-02-17 00:15` - Halaman `orders/index` ditambah row action dropdown dan bulk action shell (UI state only, no mutation).
- `2026-02-17 00:20` - Halaman baru `orders/show` dibuat (snapshot cards, item/payment table, laundry/courier timeline).
- `2026-02-17 00:24` - JS/CSS ditambah untuk state bulk table, dropdown menu, dan komponen detail timeline.
- `2026-02-17 00:29` - `WebPanelTest` diperluas untuk akses detail order dan tenant scope enforcement.
- `2026-02-17 00:33` - Validasi test + build lulus, dokumen ditutup status done.
