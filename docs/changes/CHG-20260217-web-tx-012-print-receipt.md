# CHG-20260217-web-tx-012-print-receipt

## Header
- Change ID: `CHG-20260217-web-tx-012-print-receipt`
- Status: `done`
- Date: `2026-02-17`
- Owner: `codex`
- Related Ticket: `WEB-TX-012`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Belum ada halaman cetak ringkas transaksi dari web panel.
- Solusi yang akan/dilakukan: Menambahkan halaman print-friendly invoice/receipt yang bisa dibuka dari detail pesanan.
- Dampak bisnis/user: Admin/kasir dapat mencetak ringkasan transaksi langsung dari browser untuk kebutuhan operasional.

## 2) Scope
- In scope:
  - Route halaman cetak ringkas transaksi.
  - Controller action untuk load data receipt.
  - View print-friendly dengan informasi inti order/items/pembayaran.
  - Tombol akses receipt dari halaman detail order.
  - Feature test akses halaman receipt.
- Out of scope:
  - Template struk thermal printer khusus perangkat POS.
  - Branding kustom per tenant.

## 3) Acceptance Criteria
1. Halaman receipt bisa dibuka dari detail order web.
2. Konten receipt menampilkan ringkasan order, item, pembayaran, dan total.
3. Scope tenant/outlet tetap terjaga (order luar scope tidak bisa diakses).

## 4) Implementasi Teknis
- Pendekatan: Buat halaman blade terpisah khusus print dengan layout minimal dan CSS print inline.
- Keputusan teknis penting: Halaman receipt tidak menggunakan layout panel utama agar hasil cetak bersih tanpa sidebar/header.
- Trade-off: Styling receipt dipisah dari stylesheet utama untuk menjaga kontrol print tetap sederhana dan stabil.

## 5) File yang Diubah
- `routes/web.php`
- `app/Http/Controllers/Web/OrderBoardController.php`
- `resources/views/web/orders/show.blade.php`
- `resources/views/web/orders/receipt.blade.php`
- `tests/Feature/WebPanelTest.php`
- `docs/changes/CHG-20260217-web-tx-012-print-receipt.md`

## 6) Dampak API/DB/Config
- API changes: tidak ada.
- DB migration: tidak ada.
- Env/config changes: tidak ada.
- Backward compatibility: additive, tidak mengubah flow existing.

## 7) Testing dan Validasi
- Unit test: tidak ada.
- Integration test: tambah feature test halaman receipt.
- Manual verification: buka halaman receipt dan jalankan print preview browser.
- Hasil:
  - `php artisan test --testsuite=Feature --filter=WebPanelTest` -> pass (36 test).
  - `php artisan test` -> pass (82 test).
  - `npm run build` -> pass.

## 8) Risiko dan Mitigasi
- Risiko utama: tampilan cetak berbeda antar browser.
- Mitigasi: gunakan struktur HTML sederhana + CSS print dasar lintas browser.

## 9) Rollback Plan
- Langkah rollback jika gagal:
  - Hapus route/action/view receipt.
  - Hapus tombol akses receipt di halaman detail.

## 10) Changelog Singkat
- `2026-02-17 10:07` - Dokumen WEB-TX-012 dibuat, status `in_progress`.
- `2026-02-17 10:15` - Halaman receipt print-friendly + route + akses dari detail order selesai diimplementasi.
- `2026-02-17 10:15` - Test/build lulus, status diubah ke `done`.
