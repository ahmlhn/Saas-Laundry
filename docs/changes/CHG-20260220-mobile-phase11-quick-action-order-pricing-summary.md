# CHG-20260220-mobile-phase11-quick-action-order-pricing-summary

## Header
- Change ID: `CHG-20260220-mobile-phase11-quick-action-order-pricing-summary`
- Status: `done`
- Date: `2026-02-20`
- Owner: `codex`
- Related Ticket: `MOB-013`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Quick Action multi-item belum memiliki ringkasan harga sehingga user sulit memverifikasi total sebelum submit.
- Solusi yang dilakukan: Menambahkan harga satuan + subtotal per item dan panel ringkasan estimasi total (subtotal, ongkir, diskon, grand total).
- Dampak bisnis/user: User bisa memastikan nilai transaksi lebih akurat sebelum order dibuat.

## 2) Scope
- In scope:
  - Menambahkan feedback harga per item pada Quick Action.
  - Menambahkan input ongkir dan diskon pada form create order.
  - Menambahkan panel ringkasan estimasi total sebelum submit.
  - Payload create order mengirim komponen ongkir/diskon ke API.
- Out of scope:
  - Sinkronisasi live promo/kupon.
  - Perhitungan pajak/biaya layanan tambahan.
  - Audit log harga draft di sisi client.

## 3) Acceptance Criteria
1. Setiap item layanan menampilkan harga satuan dan subtotal item.
2. User dapat mengisi ongkir/diskon sebelum submit.
3. Form menampilkan ringkasan estimasi total yang ter-update saat input berubah.
4. Typecheck mobile lulus.

## 4) Implementasi Teknis
- Endpoint yang digunakan:
  - `POST /api/orders`
- Detail implementasi:
  - Quick Action menghitung subtotal item dari `effective_price_amount * metric`.
  - Komponen estimasi:
    - `Subtotal` (akumulasi item),
    - `Ongkir`,
    - `Diskon`,
    - `Estimasi Total = max(subtotal + ongkir - diskon, 0)`.
  - `shipping_fee_amount` dan `discount_amount` dikirim saat create order.

## 5) File yang Diubah
- `mobile/src/screens/app/QuickActionScreen.tsx`
- `mobile/README.md`
- `docs/MOBILE_VIDEO_REFERENCE_PLAN_20260220.md`
- `docs/changes/CHG-20260220-mobile-phase11-quick-action-order-pricing-summary.md`

## 6) Dampak API/DB/Config
- API changes: tidak ada endpoint backend baru (konsumsi endpoint existing).
- DB migration: tidak ada.
- Env/config changes: tidak ada.

## 7) Testing dan Validasi
- Typecheck:
  - `cd mobile && npm run typecheck`
- Manual verification:
  - Login owner/admin/cashier -> tab `+` -> isi multi-item.
  - Ubah ongkir/diskon -> verifikasi ringkasan estimasi total berubah.
  - Submit order dan verifikasi order tersimpan.

## 8) Risiko dan Mitigasi
- Risiko utama: user menganggap estimasi final sama persis dengan backend (padahal backend bisa punya aturan tambahan).
- Mitigasi: label tetap `Estimasi` dan backend tetap menjadi source of truth saat submit.

## 9) Rollback Plan
- Hapus panel ringkasan estimasi dan input ongkir/diskon dari Quick Action.
- Kembalikan payload create order tanpa komponen ongkir/diskon dari Quick Action.

## 10) Changelog Singkat
- `2026-02-20` - Harga satuan + subtotal item ditampilkan di Quick Action.
- `2026-02-20` - Input ongkir dan diskon ditambahkan.
- `2026-02-20` - Ringkasan estimasi total sebelum submit ditambahkan.
