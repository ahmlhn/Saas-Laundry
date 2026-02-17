# CHG-20260217-order-board-export-csv

## Header
- Change ID: `CHG-20260217-order-board-export-csv`
- Status: `done`
- Date: `2026-02-17`
- Owner: `codex`
- Related Ticket: `WEB-ENH-EXPORT-CSV`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Tim operasional belum bisa mengunduh daftar pesanan terfilter dari web panel untuk pelaporan harian.
- Solusi yang dilakukan: Menambahkan endpoint export CSV pada halaman order board dengan filter dan scope outlet yang sama dengan tampilan list.
- Dampak bisnis/user: Admin/owner dapat mengekspor data transaksi harian secara cepat tanpa salin manual.

## 2) Scope
- In scope:
  - Endpoint `GET` export CSV order board.
  - Tombol export di halaman order board.
  - Scope tenant/outlet dan filter konsisten dengan list.
  - Feature test export CSV.
- Out of scope:
  - Export PDF/XLSX.
  - Penjadwalan export otomatis.

## 3) Acceptance Criteria
1. User dapat mengekspor CSV dari halaman order board.
2. CSV hanya berisi data sesuai filter aktif dan scope user.
3. Endpoint export tidak membuka akses order di luar scope.

## 4) Implementasi Teknis
- Pendekatan: Reuse pola validasi/filter yang sama dengan method `index` lalu stream hasil sebagai file CSV.
- Keputusan teknis penting: `limit` tidak dipakai pada export agar semua data hasil filter ikut diekspor.
- Trade-off: Query export bisa lebih berat untuk data sangat besar; optimasi chunking bisa ditambahkan jika volume naik.

## 5) File yang Diubah
- `routes/web.php`
- `app/Http/Controllers/Web/OrderBoardController.php`
- `resources/views/web/orders/index.blade.php`
- `tests/Feature/WebPanelTest.php`
- `docs/changes/CHG-20260217-order-board-export-csv.md`

## 6) Dampak API/DB/Config
- API changes: tidak ada endpoint API publik baru (hanya web route).
- DB migration: tidak ada.
- Env/config changes: tidak ada.
- Backward compatibility: additive.

## 7) Testing dan Validasi
- Unit test: tidak ada.
- Integration test:
  - `php artisan test --testsuite=Feature --filter=WebPanelTest` -> `45 passed`.
  - `php artisan test` -> `94 passed`.
- Manual verification: klik export dari halaman order board.
- Hasil: lulus.

## 8) Risiko dan Mitigasi
- Risiko utama: export berisi data terlalu besar jika filter longgar.
- Mitigasi: dorong penggunaan filter outlet/status/search sebelum export.

## 9) Rollback Plan
- Hapus route/action export dan tombol export dari order board.

## 10) Changelog Singkat
- `2026-02-17 15:40` - Dokumen perubahan dibuat dengan status `in_progress`.
- `2026-02-17 16:05` - Implementasi route, controller export CSV, tombol export order board, dan feature test selesai.
- `2026-02-17 16:10` - Validasi test suite selesai dan status dokumen diubah ke `done`.
