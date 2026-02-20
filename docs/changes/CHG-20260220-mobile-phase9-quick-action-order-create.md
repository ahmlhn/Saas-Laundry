# CHG-20260220-mobile-phase9-quick-action-order-create

## Header
- Change ID: `CHG-20260220-mobile-phase9-quick-action-order-create`
- Status: `done`
- Date: `2026-02-20`
- Owner: `codex`
- Related Ticket: `MOB-011`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Tab Quick Action (`+`) masih berisi tombol placeholder dan belum bisa entry order.
- Solusi yang dilakukan: Mengaktifkan create order minimal langsung dari Quick Action dengan form pelanggan + layanan + metrik qty/kg, lalu submit ke `POST /api/orders`.
- Dampak bisnis/user: Kasir/Admin/Owner dapat input order cepat dari mobile tanpa berpindah flow.

## 2) Scope
- In scope:
  - Tambah helper API `createOrder` pada mobile order API client.
  - Refactor `QuickActionScreen` dari placeholder menjadi form order minimal.
  - Integrasi list layanan aktif outlet sebagai pilihan item order.
  - Tambah shortcut pasca-submit ke detail order dan daftar pesanan.
- Out of scope:
  - Multi-item order di satu transaksi.
  - Input pickup/delivery schedule detail.
  - Pembayaran langsung saat create order.

## 3) Acceptance Criteria
1. Tombol `Buat Order Baru` di tab Quick Action dapat dipakai create order.
2. Form validasi minimal berjalan (nama, HP, metrik qty/kg).
3. Order berhasil tersimpan ke backend dan user bisa buka detail order hasil create.
4. Typecheck mobile lulus.

## 4) Implementasi Teknis
- Endpoint yang digunakan:
  - `GET /api/services` (list layanan aktif outlet)
  - `POST /api/orders` (create order)
- Detail implementasi:
  - Menambahkan method `createOrder` di `orderApi`.
  - `QuickActionScreen` memuat layanan aktif outlet lalu menampilkan selector layanan berbasis chip.
  - Input metrik menyesuaikan unit layanan (`kg` atau `pcs`).
  - Setelah create sukses:
    - tampil success message,
    - refresh session (sinkron quota),
    - simpan `orderId` terakhir untuk shortcut `Lihat Detail Order`.

## 5) File yang Diubah
- `mobile/src/features/orders/orderApi.ts`
- `mobile/src/screens/app/QuickActionScreen.tsx`
- `mobile/README.md`
- `docs/MOBILE_VIDEO_REFERENCE_PLAN_20260220.md`
- `docs/changes/CHG-20260220-mobile-phase9-quick-action-order-create.md`

## 6) Dampak API/DB/Config
- API changes: tidak ada endpoint backend baru (konsumsi endpoint existing).
- DB migration: tidak ada.
- Env/config changes: tidak ada.

## 7) Testing dan Validasi
- Typecheck:
  - `cd mobile && npm run typecheck`
- Manual verification:
  - Login owner/admin/cashier -> tab `+` -> buka form `Buat Order Baru`.
  - Isi data pelanggan + pilih layanan + isi qty/kg -> submit.
  - Buka `Lihat Detail Order` dari panel order terakhir.

## 8) Risiko dan Mitigasi
- Risiko utama: form minimal hanya mendukung 1 item order.
- Mitigasi: tetap cukup untuk quick entry; multi-item bisa ditambah pada iterasi berikutnya.

## 9) Rollback Plan
- Revert perubahan `QuickActionScreen` ke state placeholder.
- Hapus helper `createOrder` di mobile `orderApi`.
- Kembalikan dokumentasi phase 9.

## 10) Changelog Singkat
- `2026-02-20` - `createOrder` helper ditambahkan ke mobile order API.
- `2026-02-20` - Quick Action tab aktif untuk create order minimal.
- `2026-02-20` - Shortcut ke detail order setelah create ditambahkan.
