# CHG-20260217-web-tx-010-add-payment

## Header
- Change ID: `CHG-20260217-web-tx-010-add-payment`
- Status: `done`
- Date: `2026-02-17`
- Owner: `codex`
- Related Ticket: `WEB-TX-010`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Halaman detail pesanan web belum punya aksi tambah pembayaran, sehingga kasir/admin harus keluar ke channel lain.
- Solusi yang akan/dilakukan: Menambahkan endpoint web append-only untuk pembayaran dari detail order, termasuk update paid/due dan audit trail.
- Dampak bisnis/user: Transaksi web menjadi lebih lengkap karena pembayaran bisa dicatat langsung dari panel.

## 2) Scope
- In scope:
  - Endpoint web untuk tambah pembayaran pada detail order.
  - Form pembayaran di halaman detail order.
  - Validasi amount/method/paid_at/notes.
  - Update `paid_amount` dan `due_amount` secara append-only.
  - Feature test web pembayaran.
- Out of scope:
  - Quick payment shortcuts (lunas/50%/nominal preset) pada WEB-TX-011.
  - Print receipt pada WEB-TX-012.

## 3) Acceptance Criteria
1. Admin/owner bisa menambah pembayaran dari halaman detail order.
2. Setiap pembayaran baru menambah histori (append-only), tidak ada edit/hapus histori.
3. Nilai `paid_amount` dan `due_amount` order terbarui konsisten setelah submit.

## 4) Implementasi Teknis
- Pendekatan: Tambah route `POST` khusus pembayaran web, proses dalam DB transaction, dan tetap gunakan scope tenant/outlet dari web panel.
- Keputusan teknis penting: Logic pembayaran dibuat di `OrderBoardController` agar flow tetap sinkron dengan halaman detail web saat ini.
- Trade-off: Ada duplikasi ringan dengan endpoint API payment, akan dirapikan ke shared action/service pada refactor berikutnya.

## 5) File yang Diubah
- `routes/web.php`
- `app/Http/Controllers/Web/OrderBoardController.php`
- `resources/views/web/orders/show.blade.php`
- `tests/Feature/WebPanelTest.php`
- `docs/changes/CHG-20260217-web-tx-010-add-payment.md`

## 6) Dampak API/DB/Config
- API changes: tidak ada perubahan kontrak API publik.
- DB migration: tidak ada.
- Env/config changes: tidak ada.
- Backward compatibility: additive untuk web panel.

## 7) Testing dan Validasi
- Unit test: tidak ada.
- Integration test: tambah test feature untuk web add payment.
- Manual verification: validasi form dan histori pembayaran di halaman detail.
- Hasil:
  - `php artisan test --testsuite=Feature --filter=WebPanelTest` -> pass (32 test).
  - `php artisan test` -> pass (78 test).
  - `npm run build` -> pass.

## 8) Risiko dan Mitigasi
- Risiko utama: total pembayaran bisa melebihi total order (overpayment) dan membingungkan user.
- Mitigasi: due amount tetap di-clamp minimal 0, lalu overpayment diperlakukan sebagai kelebihan bayar tercatat di histori.

## 9) Rollback Plan
- Langkah rollback jika gagal:
  - Hapus route pembayaran web dan form pembayaran di detail.
  - Kembalikan controller ke versi sebelum WEB-TX-010.

## 10) Changelog Singkat
- `2026-02-17 09:55` - Dokumen WEB-TX-010 dibuat, status `in_progress`.
- `2026-02-17 10:02` - Route/controller/view/test WEB-TX-010 selesai diimplementasi.
- `2026-02-17 10:02` - Validasi test/build lulus, status diubah ke `done`.
