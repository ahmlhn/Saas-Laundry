# CHG-20260217-web-tx-020-021-022-order-detail-ops-actions

## Header
- Change ID: `CHG-20260217-web-tx-020-021-022-order-detail-ops-actions`
- Status: `done`
- Date: `2026-02-17`
- Owner: `codex`
- Related Ticket: `WEB-TX-020, WEB-TX-021, WEB-TX-022`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Halaman detail order web belum menyediakan aksi operasional utama (status laundry/kurir dan assignment kurir).
- Solusi yang akan/dilakukan: Menambah action form langsung di halaman detail order untuk update status dan assign kurir, plus guard UX error reason yang jelas.
- Dampak bisnis/user: Admin/owner bisa menyelesaikan alur operasional transaksi dari satu halaman tanpa berpindah ke bulk action.

## 2) Scope
- In scope:
  - Endpoint web status laundry dari detail order.
  - Endpoint web status kurir dari detail order.
  - Endpoint web assignment kurir dari detail order.
  - UI action di halaman detail order + pesan guard invalid transition.
  - Feature test untuk alur sukses dan gagal (guard).
- Out of scope:
  - Aksi status untuk role selain owner/admin pada panel web (kasir/pekerja/kurir tetap via channel lain/API).
  - Optimasi UI lanjutan (wizard atau keyboard shortcut).

## 3) Acceptance Criteria
1. Admin/owner bisa update status laundry dari detail order sesuai aturan forward-only.
2. Admin/owner bisa update status kurir dan assign kurir dari detail order.
3. Jika transisi tidak valid, user mendapat pesan error reason yang jelas di halaman detail.

## 4) Implementasi Teknis
- Pendekatan: Reuse validator/transisi yang sudah dipakai bulk action melalui method internal controller agar rule konsisten.
- Keputusan teknis penting: Error invalid transition dikembalikan sebagai validation error field-spesifik (`laundry_status`, `courier_status`, `courier_user_id`).
- Trade-off: Logic operasional masih berada di controller web; refactor ke service/action bersama bisa dilakukan setelah flow stabil.

## 5) File yang Diubah
- `routes/web.php`
- `app/Http/Controllers/Web/OrderBoardController.php`
- `resources/views/web/orders/show.blade.php`
- `tests/Feature/WebPanelTest.php`
- `docs/changes/CHG-20260217-web-tx-020-021-022-order-detail-ops-actions.md`

## 6) Dampak API/DB/Config
- API changes: tidak ada endpoint API baru (hanya web route).
- DB migration: tidak ada.
- Env/config changes: tidak ada.
- Backward compatibility: additive, tidak memutus fitur existing.

## 7) Testing dan Validasi
- Unit test: tidak ada.
- Integration test: tambah case detail-order operational actions di `WebPanelTest`.
- Manual verification: uji update status/assign kurir dari halaman detail.
- Hasil:
  - `php artisan test --testsuite=Feature --filter=WebPanelTest` -> pass (42 test).
  - `php artisan test` -> pass (88 test).
  - `npm run build` -> pass.

## 8) Risiko dan Mitigasi
- Risiko utama: user salah pilih target status dan mengira sistem error.
- Mitigasi: tampilkan helper text status saat ini + pesan reason validasi yang eksplisit.

## 9) Rollback Plan
- Langkah rollback jika gagal:
  - Hapus route/method status dan assignment dari detail order.
  - Hapus komponen form aksi operasional dari view detail order.

## 10) Changelog Singkat
- `2026-02-17 10:15` - Dokumen perubahan dibuat dengan status `in_progress`.
- `2026-02-17 10:40` - Route + controller + UI aksi status laundry/kurir dan assignment kurir selesai.
- `2026-02-17 10:40` - Guard UX invalid transition ditambahkan dan tervalidasi lewat test feature.
- `2026-02-17 10:40` - Seluruh test/build lulus, status diubah ke `done`.
