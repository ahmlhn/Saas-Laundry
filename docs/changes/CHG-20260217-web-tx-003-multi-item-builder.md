# CHG-20260217-web-tx-003-multi-item-builder

## Header
- Change ID: `CHG-20260217-web-tx-003-multi-item-builder`
- Status: `done`
- Date: `2026-02-17`
- Owner: `codex`
- Related Ticket: `WEB-TX-003`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Form transaksi web masih single item sehingga alur kasir belum efisien untuk transaksi nyata.
- Solusi yang akan/dilakukan: Menambahkan item builder dinamis multi-baris dengan kalkulasi subtotal/total real-time di halaman create transaksi.
- Dampak bisnis/user: Kasir/Admin bisa input beberapa layanan sekaligus dalam satu order dengan estimasi biaya yang cepat terlihat.

## 2) Scope
- In scope:
  - Builder item dinamis (tambah/hapus baris) di form create order web.
  - Kalkulasi estimasi total real-time di client.
  - Menyediakan data harga layanan + override outlet untuk estimasi.
  - Test web create order dengan multi item.
- Out of scope:
  - Perubahan API endpoint order.
  - Diskon/promo engine lanjutan.

## 3) Acceptance Criteria
1. User dapat menambah lebih dari 1 item layanan pada form transaksi web.
2. Estimasi subtotal/total ter-update real-time saat item/qty/berat berubah.
3. Submit multi item tersimpan benar di order + order_items.

## 4) Implementasi Teknis
- Pendekatan: Alpine component khusus order form builder, memakai seed layanan + override harga per outlet.
- Keputusan teknis penting: Kalkulasi client hanya estimasi UX; server tetap source-of-truth final.
- Trade-off: Payload page create sedikit bertambah karena seed price map.

## 5) File yang Akan/Diubah
- `app/Http/Controllers/Web/OrderBoardController.php`
- `resources/views/web/orders/create.blade.php`
- `resources/js/app.js`
- `resources/css/app.css`
- `tests/Feature/WebPanelTest.php`
- `docs/changes/CHG-20260217-web-tx-003-multi-item-builder.md`

## 6) Dampak API/DB/Config
- API changes: tidak ada.
- DB migration: tidak ada.
- Env/config changes: tidak ada.
- Backward compatibility: additive di layer web UI.

## 7) Testing dan Validasi
- Unit test: tidak ada.
- Integration test:
  - `php artisan test --testsuite=Feature --filter=WebPanelTest` -> pass.
  - `php artisan test` -> pass.
- Manual verification:
  - `npm run build` -> pass.
- Hasil: seluruh acceptance criteria terpenuhi dan regression suite tetap hijau.

## 8) Risiko dan Mitigasi
- Risiko utama: kalkulasi client tidak sinkron jika user tidak memilih outlet.
- Mitigasi: tampilkan fallback base price + validasi server tetap final.

## 9) Rollback Plan
- Revert perubahan controller/view/js/css/test terkait builder multi item.

## 10) Changelog Singkat
- `2026-02-17 12:32` - Dokumen perubahan dibuat dengan status `in_progress`.
- `2026-02-17 10:02` - Implementasi multi-item builder selesai, test/build lulus, status diubah ke `done`.
