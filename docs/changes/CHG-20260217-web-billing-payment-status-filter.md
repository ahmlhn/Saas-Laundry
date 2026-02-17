# CHG-20260217-web-billing-payment-status-filter

## Header
- Change ID: `CHG-20260217-web-billing-payment-status-filter`
- Status: `done`
- Date: `2026-02-17`
- Owner: `codex`
- Related Ticket: `WEB-MGMT-BILLING-004`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Billing panel belum bisa difilter berdasarkan status pembayaran (lunas/belum lunas).
- Solusi yang dilakukan: Menambah filter `payment_status` pada halaman billing dan menerapkannya ke metrik serta export CSV.
- Dampak bisnis/user: User bisa fokus memonitor piutang atau order lunas tanpa memilah manual.

## 2) Scope
- In scope:
  - Filter `payment_status` (`paid`, `unpaid`) pada halaman billing.
  - Dataset export billing (`outlets`, `orders`) mengikuti filter payment status.
  - Test fitur untuk filter dan export payment status.
- Out of scope:
  - Segmentasi status pembayaran lebih detail (mis. partial khusus).

## 3) Acceptance Criteria
1. Filter status pembayaran tersedia di halaman billing.
2. Metrik billing berubah sesuai status pembayaran terpilih.
3. Export detail order dapat difilter status pembayaran.
4. Terdapat test coverage untuk skenario ini.

## 4) Implementasi Teknis
- Pendekatan: Reuse pipeline query billing dan menambahkan helper server-side untuk filter status pembayaran di query order.
- Keputusan teknis penting: Definisi `paid` memakai `due_amount = 0`, `unpaid` memakai `due_amount > 0`.
- Trade-off: Kategori `unpaid` menggabungkan belum bayar dan sebagian bayar (partial).

## 5) File yang Diubah
- `app/Http/Controllers/Web/BillingController.php`
- `resources/views/web/billing/index.blade.php`
- `tests/Feature/WebPanelTest.php`
- `docs/changes/CHG-20260217-web-billing-payment-status-filter.md`

## 6) Dampak API/DB/Config
- API changes: tidak ada.
- DB migration: tidak ada.
- Env/config changes: tidak ada.
- Backward compatibility: additive.

## 7) Testing dan Validasi
- Unit test: n/a.
- Integration test:
  - `php artisan test --testsuite=Feature --filter=WebPanelTest` -> pass (`52 passed`).
  - `php artisan test` -> pass (`101 passed`).
- Build:
  - `npm run build` -> pass.
- Hasil: lulus.

## 8) Risiko dan Mitigasi
- Risiko utama: Interpretasi status `unpaid` bisa dianggap hanya belum bayar total.
- Mitigasi: Copy UI menegaskan bahwa `unpaid` berarti masih memiliki `due_amount`.

## 9) Rollback Plan
- Hapus filter `payment_status` dari billing UI dan query controller.

## 10) Changelog Singkat
- `2026-02-17 17:52` - Implementasi awal filter status pembayaran billing dibuat.
- `2026-02-17 18:02` - Validasi test/build selesai dan change doc ditutup `done`.
