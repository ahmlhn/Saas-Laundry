# CHG-20260216-order-bulk-report-stage7

## Header
- Change ID: `CHG-20260216-order-bulk-report-stage7`
- Status: `done`
- Date: `2026-02-16`
- Owner: `codex`
- Related Ticket: `WEB-016`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Bulk action saat ini hanya memberi summary jumlah updated/skipped, belum ada detail order mana yang gagal dan alasannya.
- Solusi yang dilakukan: Menambahkan bulk result report per-order (updated/skipped + reason) dan menampilkannya di halaman order board setelah aksi.
- Dampak bisnis/user: Admin bisa cepat evaluasi order yang perlu ditindak lanjuti tanpa menebak penyebab skip.

## 2) Scope
- In scope:
  - Refactor proses bulk update agar mengumpulkan hasil per order.
  - Simpan report ke flash session pada redirect.
  - Render report di `orders/index`.
  - Tambahan test report detail.
- Out of scope:
  - Export CSV report.
  - Retry action otomatis dari report.

## 3) Acceptance Criteria
1. Setelah bulk action, user melihat summary dan detail per order (status + reason).
2. Skip karena out-of-scope/invalid transition/laundry not ready tampil dengan reason yang jelas.
3. Semua test dan build lulus.

## 4) Implementasi Teknis
- Pendekatan: helper transition mengembalikan hasil terstruktur (`updated`, `reason_code`, `reason_label`), lalu dikompilasi ke flash `bulk_report`.
- Keputusan teknis penting: tetap pakai endpoint bulk yang sama agar konsisten audit + validator.
- Trade-off: report disimpan di session satu request (tidak persisted).

## 5) File yang Diubah
- `docs/changes/CHG-20260216-order-bulk-report-stage7.md`
- `app/Http/Controllers/Web/OrderBoardController.php`
- `resources/views/web/orders/index.blade.php`
- `tests/Feature/WebPanelTest.php`

## 6) Dampak API/DB/Config
- API changes: tidak ada.
- DB migration: tidak ada.
- Env/config changes: tidak ada.
- Backward compatibility: additive untuk UX web panel.

## 7) Testing dan Validasi
- Unit test: tidak ada.
- Integration test:
  - `php artisan test --testsuite=Feature --filter=WebPanelTest` -> `15 passed (93 assertions)`
  - `php artisan test` -> `61 passed (410 assertions)`
- Manual verification:
  - `npm run build` -> sukses (`vite build` selesai tanpa error)
- Hasil: lulus.

## 8) Risiko dan Mitigasi
- Risiko utama: payload flash terlalu besar jika report detail terlalu panjang.
- Mitigasi: batasi bulk max 100 order (sudah ada).

## 9) Rollback Plan
- Revert perubahan controller/view/test/dokumen stage-7.

## 10) Changelog Singkat
- `2026-02-17 01:05` - Dokumen perubahan dibuat dengan status planned.
- `2026-02-17 01:12` - `bulkUpdate` direfactor untuk menyimpan report per-order (`updated/skipped + reason_code/reason`).
- `2026-02-17 01:16` - Halaman order board menampilkan tabel `Bulk Action Report` dari flash session.
- `2026-02-17 01:20` - Feature test ditambah untuk mixed result report dan reason skip `LAUNDRY_NOT_READY`.
- `2026-02-17 01:26` - Semua test + build lulus, dokumen ditutup status done.
