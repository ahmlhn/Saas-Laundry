# CHG-20260217-web-tx-011-quick-payment-actions

## Header
- Change ID: `CHG-20260217-web-tx-011-quick-payment-actions`
- Status: `done`
- Date: `2026-02-17`
- Owner: `codex`
- Related Ticket: `WEB-TX-011`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Input nominal pembayaran masih manual, sehingga kasir/admin kurang cepat untuk skenario umum (lunas/parsial cepat).
- Solusi yang akan/dilakukan: Menambah quick payment actions pada halaman detail order web untuk nominal otomatis tertentu.
- Dampak bisnis/user: Pencatatan pembayaran lebih cepat dan minim salah input nominal.

## 2) Scope
- In scope:
  - Tombol pembayaran cepat pada detail order.
  - Dukungan `quick_action` di endpoint web add payment.
  - Validasi skenario order sudah lunas.
  - Feature test untuk quick payment action.
- Out of scope:
  - Shortcut pembayaran via keyboard khusus.
  - Integrasi payment gateway.

## 3) Acceptance Criteria
1. User bisa menambahkan pembayaran sekali klik untuk aksi cepat.
2. Histori pembayaran tetap append-only.
3. Order yang sudah lunas tidak menerima quick payment tambahan.

## 4) Implementasi Teknis
- Pendekatan: Gunakan parameter submit `quick_action` di form yang dihitung server-side.
- Keputusan teknis penting: Nominal quick action dihitung dari `due_amount` terbaru agar konsisten dengan state order.
- Trade-off: Paket nominal preset masih fixed (iterasi berikutnya bisa dibuat configurable per tenant/outlet).

## 5) File yang Diubah
- `app/Http/Controllers/Web/OrderBoardController.php`
- `resources/views/web/orders/show.blade.php`
- `tests/Feature/WebPanelTest.php`
- `docs/changes/CHG-20260217-web-tx-011-quick-payment-actions.md`

## 6) Dampak API/DB/Config
- API changes: tidak ada.
- DB migration: tidak ada.
- Env/config changes: tidak ada.
- Backward compatibility: additive di web form pembayaran.

## 7) Testing dan Validasi
- Unit test: tidak ada.
- Integration test: tambah feature test quick payment action.
- Manual verification: klik aksi cepat dari halaman detail order.
- Hasil:
  - `php artisan test --testsuite=Feature --filter=WebPanelTest` -> pass (34 test).
  - `php artisan test` -> pass (80 test).
  - `npm run build` -> pass.

## 8) Risiko dan Mitigasi
- Risiko utama: nominal preset tidak sesuai preferensi semua tenant.
- Mitigasi: tetap sediakan input manual normal dan jadikan preset sebagai akselerator opsional.

## 9) Rollback Plan
- Langkah rollback jika gagal:
  - Hapus tombol quick action pada UI.
  - Kembalikan endpoint pembayaran ke mode nominal manual saja.

## 10) Changelog Singkat
- `2026-02-17 10:02` - Dokumen WEB-TX-011 dibuat, status `in_progress`.
- `2026-02-17 10:07` - Quick action pembayaran diimplementasi pada controller + UI + test feature.
- `2026-02-17 10:07` - Seluruh test/build lulus, status diubah ke `done`.
