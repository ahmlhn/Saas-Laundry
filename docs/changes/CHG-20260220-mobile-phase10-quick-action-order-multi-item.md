# CHG-20260220-mobile-phase10-quick-action-order-multi-item

## Header
- Change ID: `CHG-20260220-mobile-phase10-quick-action-order-multi-item`
- Status: `done`
- Date: `2026-02-20`
- Owner: `codex`
- Related Ticket: `MOB-012`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Quick Action create order sebelumnya hanya mendukung 1 item layanan.
- Solusi yang dilakukan: Refactor form Quick Action agar mendukung multi-item layanan dalam 1 transaksi.
- Dampak bisnis/user: Kasir/Admin/Owner dapat input order campuran layanan dengan lebih cepat dari tab `+`.

## 2) Scope
- In scope:
  - Ubah payload `createOrder` mobile menjadi array `items`.
  - Refactor UI Quick Action untuk:
    - tambah item layanan,
    - hapus item layanan,
    - validasi metrik per item.
  - Pertahankan flow pasca-submit ke detail order terbaru.
- Out of scope:
  - Reorder drag/drop item.
  - Kalkulasi subtotal per item di sisi UI.
  - Draft order tersimpan lokal.

## 3) Acceptance Criteria
1. User owner/admin/cashier dapat menambah lebih dari satu item layanan sebelum submit.
2. Setiap item tervalidasi sesuai unit (`kg` atau `pcs`).
3. Submit order berhasil ke endpoint `POST /api/orders` dengan payload `items[]`.
4. Typecheck mobile lulus.

## 4) Implementasi Teknis
- Endpoint yang digunakan:
  - `POST /api/orders`
  - `GET /api/services`
- Detail implementasi:
  - `orderApi.createOrder` kini menerima `items` array.
  - `QuickActionScreen` menggunakan state draft item dinamis.
  - Saat submit:
    - mapping setiap draft item ke `qty`/`weight_kg`,
    - validasi metrik item satu per satu,
    - kirim payload tunggal dengan multi-item.

## 5) File yang Diubah
- `mobile/src/features/orders/orderApi.ts`
- `mobile/src/screens/app/QuickActionScreen.tsx`
- `mobile/README.md`
- `docs/MOBILE_VIDEO_REFERENCE_PLAN_20260220.md`
- `docs/changes/CHG-20260220-mobile-phase10-quick-action-order-multi-item.md`

## 6) Dampak API/DB/Config
- API changes: tidak ada endpoint backend baru (konsumsi endpoint existing).
- DB migration: tidak ada.
- Env/config changes: tidak ada.

## 7) Testing dan Validasi
- Typecheck:
  - `cd mobile && npm run typecheck`
- Manual verification:
  - Login owner/admin/cashier -> tab `+` -> tambah 2+ item layanan -> submit order.
  - Buka detail order terakhir dan verifikasi item tersimpan lebih dari satu.

## 8) Risiko dan Mitigasi
- Risiko utama: validasi input multi-item membingungkan user.
- Mitigasi: error message dibuat per item (`Item 1`, `Item 2`, dst) agar user cepat koreksi.

## 9) Rollback Plan
- Kembalikan `createOrder` payload ke 1 item.
- Revert UI Quick Action ke form single-item.
- Hapus dokumentasi fase 10.

## 10) Changelog Singkat
- `2026-02-20` - Payload `createOrder` di mobile diubah ke array `items`.
- `2026-02-20` - Quick Action mendukung tambah/hapus item layanan.
- `2026-02-20` - Validasi create order diperluas untuk multi-item.
