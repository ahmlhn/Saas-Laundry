# CHG-20260217-web-tx-002-customer-quick-search

## Header
- Change ID: `CHG-20260217-web-tx-002-customer-quick-search`
- Status: `done`
- Date: `2026-02-17`
- Owner: `codex`
- Related Ticket: `WEB-TX-002`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Form transaksi web belum punya mekanisme pencarian pelanggan cepat, sehingga entry kasir masih lambat.
- Solusi yang akan/dilakukan: Menambahkan quick customer lookup di halaman create transaksi agar user bisa memilih pelanggan existing dan autofill data secara inline.
- Dampak bisnis/user: Input transaksi jadi lebih cepat dan risiko duplikasi customer berkurang.

## 2) Scope
- In scope:
  - Menambah data seed pelanggan di halaman create transaksi.
  - Menambah komponen UI quick search customer inline.
  - Menambah test web untuk memastikan upsert customer existing tetap benar.
- Out of scope:
  - Endpoint API baru khusus customer search.
  - Fuzzy search backend skala besar.

## 3) Acceptance Criteria
1. Halaman create transaksi memiliki fitur cari pelanggan cepat.
2. Memilih pelanggan existing dapat autofill nama/nomor/catatan.
3. Submit dengan nomor existing tidak membuat duplikasi customer tenant.

## 4) Implementasi Teknis
- Pendekatan: Alpine component local search berbasis daftar pelanggan tenant terbaru di page payload.
- Keputusan teknis penting: search dilakukan client-side untuk delivery cepat tanpa endpoint tambahan.
- Trade-off: jumlah data search dibatasi untuk menjaga payload halaman tetap ringan.

## 5) File yang Akan/Diubah
- `app/Http/Controllers/Web/OrderBoardController.php`
- `resources/views/web/orders/create.blade.php`
- `resources/js/app.js`
- `resources/css/app.css`
- `tests/Feature/WebPanelTest.php`
- `docs/changes/CHG-20260217-web-tx-002-customer-quick-search.md`

## 6) Dampak API/DB/Config
- API changes: tidak ada.
- DB migration: tidak ada.
- Env/config changes: tidak ada.
- Backward compatibility: additive (UI enhancement + test).

## 7) Testing dan Validasi
- Unit test: tidak ada.
- Integration test:
  - `php artisan test --testsuite=Feature --filter=WebPanelTest` -> `29 passed (199 assertions)`.
  - `php artisan test` -> `75 passed (516 assertions)`.
- Manual verification:
  - `npm run build` -> sukses.
- Hasil: lulus.

## 8) Risiko dan Mitigasi
- Risiko utama: payload halaman create membesar jika daftar pelanggan terlalu banyak.
- Mitigasi: batasi seed pelanggan yang dikirim ke frontend.

## 9) Rollback Plan
- Revert perubahan pada controller/view/js/css/test untuk feature quick search.

## 10) Changelog Singkat
- `2026-02-17 11:55` - Dokumen perubahan dibuat dengan status `in_progress`.
- `2026-02-17 12:02` - Seed pelanggan tenant ditambahkan ke halaman create order dan komponen quick lookup inline diterapkan.
- `2026-02-17 12:08` - Test web ditambah untuk verifikasi upsert customer existing berdasarkan nomor telepon.
- `2026-02-17 12:15` - Test suite + build lulus, dokumen ditutup status `done`.
