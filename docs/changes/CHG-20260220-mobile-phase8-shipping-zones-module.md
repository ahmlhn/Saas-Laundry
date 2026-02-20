# CHG-20260220-mobile-phase8-shipping-zones-module

## Header
- Change ID: `CHG-20260220-mobile-phase8-shipping-zones-module`
- Status: `done`
- Date: `2026-02-20`
- Owner: `codex`
- Related Ticket: `MOB-010`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Pengaturan zona pengantaran (radius/ongkir/ETA) belum tersedia di mobile.
- Solusi yang dilakukan: Menambahkan module mobile `Zona Antar` berbasis endpoint shipping zones yang sudah ada, serta entry point dari menu Akun dan screen Kelola Outlet.
- Dampak bisnis/user: Owner/Admin dapat mengatur zona pengantaran langsung dari mobile tanpa membuka web panel.

## 2) Scope
- In scope:
  - Tambah type dan API client mobile untuk shipping zones.
  - Tambah screen `Zona Antar` (list + create + filter aktif/nonaktif).
  - Tambah route `ShippingZones` pada `AccountStack`.
  - Tambah menu `Zona Antar` di tab Akun.
  - Tambah shortcut `Zona Antar` dari screen `Kelola Outlet`.
- Out of scope:
  - Edit/delete shipping zone dari mobile.
  - Bulk import/export shipping zones.
  - Kalkulasi ongkir otomatis berbasis peta.

## 3) Acceptance Criteria
1. Owner/Admin dapat membuka screen `Zona Antar` dari tab Akun.
2. Owner/Admin dapat melihat daftar zona antar berdasarkan outlet.
3. Owner/Admin dapat menambah zona antar baru dari mobile.
4. Typecheck mobile lulus.

## 4) Implementasi Teknis
- Endpoint yang digunakan:
  - `GET /api/shipping-zones`
  - `POST /api/shipping-zones`
- Detail implementasi:
  - Route baru `ShippingZones` ditambahkan di stack tab Akun.
  - Screen mendukung pemilihan outlet (chip) jika user punya akses multi outlet.
  - Form create memvalidasi input numerik lokal (biaya, jarak, ETA) sebelum submit.
  - List memakai cache in-memory untuk mengurangi fetch berulang.

## 5) File yang Diubah
- `mobile/src/types/shippingZone.ts`
- `mobile/src/features/shippingZones/shippingZoneApi.ts`
- `mobile/src/screens/app/ShippingZonesScreen.tsx`
- `mobile/src/screens/app/OutletsScreen.tsx`
- `mobile/src/screens/app/AccountHubScreen.tsx`
- `mobile/src/navigation/types.ts`
- `mobile/src/navigation/AppNavigator.tsx`
- `mobile/README.md`
- `docs/MOBILE_VIDEO_REFERENCE_PLAN_20260220.md`
- `docs/changes/CHG-20260220-mobile-phase8-shipping-zones-module.md`

## 6) Dampak API/DB/Config
- API changes: tidak ada endpoint backend baru (hanya konsumsi endpoint existing).
- DB migration: tidak ada.
- Env/config changes: tidak ada.

## 7) Testing dan Validasi
- Typecheck:
  - `cd mobile && npm run typecheck`
- Manual verification:
  - Login owner/admin -> Akun -> Zona Antar -> tambah zona -> refresh list.
  - Buka Kelola Outlet -> pilih salah satu outlet -> buka `Zona Antar` dari tombol shortcut.

## 8) Risiko dan Mitigasi
- Risiko utama: input angka jarak/ETA tidak konsisten format antar perangkat.
- Mitigasi: validasi lokal + validasi backend tetap aktif untuk memastikan data tetap konsisten.

## 9) Rollback Plan
- Hapus route `ShippingZones` dari navigator mobile.
- Hapus screen/API/type shipping zones di mobile.
- Kembalikan menu `Zona Antar` dan shortcut di `Kelola Outlet` menjadi non-interaktif.

## 10) Changelog Singkat
- `2026-02-20` - Module mobile `Zona Antar` ditambahkan.
- `2026-02-20` - Menu `Zona Antar` di tab Akun diaktifkan.
- `2026-02-20` - Shortcut `Zona Antar` dari screen `Kelola Outlet` ditambahkan.
