# CHG-20260218-mobile-navigation-orders-today

## Header
- Change ID: `CHG-20260218-mobile-navigation-orders-today`
- Status: `done`
- Date: `2026-02-18`
- Owner: `codex`
- Related Ticket: `MOB-002`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Baseline mobile sebelumnya masih single-screen, belum punya flow app nyata untuk berpindah antar layar operasional.
- Solusi yang dilakukan: Menambahkan React Navigation dengan flow `Login -> Outlet Select -> Orders Today`, menambah session context terpusat, dan integrasi list order read-only dari endpoint `/api/orders` berdasarkan outlet aktif.
- Dampak bisnis/user: Tim sudah bisa demo flow mobile dasar end-to-end dari login sampai melihat daftar order outlet.

## 2) Scope
- In scope:
  - Setup dependency React Navigation.
  - Root app router berbasis status sesi.
  - Session context (bootstrap token, login, logout, pilih outlet).
  - Screen `Outlet Select`.
  - Screen `Orders Today` (read-only + refresh).
  - Integrasi API list order.
- Out of scope:
  - Create/update order dari mobile.
  - Detail order dan aksi payment/status.
  - Sync offline (`/sync/push`, `/sync/pull`).

## 3) Acceptance Criteria
1. User yang sudah login dapat memilih outlet aktif.
2. Setelah outlet dipilih, app menampilkan daftar order dari outlet tersebut.
3. User dapat logout dan kembali ke layar login.

## 4) Implementasi Teknis
- Pendekatan:
  - Root `App.tsx` dijadikan entry router: boot loading, auth navigator, dan app navigator.
  - Session state dipindah ke `SessionContext` agar reusable lintas screen.
  - `OrdersTodayScreen` fetch `/api/orders?outlet_id=...` dengan refresh manual.
- Keputusan teknis penting:
  - Menggunakan `@react-navigation/native` + `@react-navigation/native-stack`.
  - Menyimpan outlet aktif di context agar bisa dipakai screen lanjutan.
  - Tetap gunakan bearer token Sanctum dari secure storage.
- Trade-off:
  - Belum ada persist outlet aktif ke storage; saat relogin user bisa perlu memilih outlet lagi (kecuali hanya punya satu outlet).

## 5) File yang Diubah
- `mobile/App.tsx`
- `mobile/index.ts`
- `mobile/package.json`
- `mobile/package-lock.json`
- `mobile/README.md`
- `mobile/src/navigation/AppNavigator.tsx`
- `mobile/src/navigation/AuthNavigator.tsx`
- `mobile/src/navigation/types.ts`
- `mobile/src/state/SessionContext.tsx`
- `mobile/src/features/orders/orderApi.ts`
- `mobile/src/screens/auth/LoginScreen.tsx`
- `mobile/src/screens/app/OutletSelectScreen.tsx`
- `mobile/src/screens/app/OrdersTodayScreen.tsx`
- `mobile/src/types/order.ts`
- `docs/changes/CHG-20260218-mobile-navigation-orders-today.md`

## 6) Dampak API/DB/Config
- API changes: tidak ada endpoint baru; konsumsi endpoint existing `/api/orders`.
- DB migration: tidak ada.
- Env/config changes: tidak ada variabel env baru.
- Backward compatibility: additive di mobile client, backend existing tidak berubah.

## 7) Testing dan Validasi
- Unit test: belum ada test unit mobile baru.
- Integration test: tidak ada.
- Manual verification:
  - `cd mobile && npm run typecheck` -> lulus.
  - Runtime flow perlu diverifikasi di emulator/device (login -> outlet select -> orders list).
- Hasil: kompilasi TypeScript lulus dan struktur flow siap dipakai.

## 8) Risiko dan Mitigasi
- Risiko utama: endpoint `/api/orders` gagal jika `outlet_id` tidak valid/di luar scope user.
- Mitigasi: outlet dipilih hanya dari `allowed_outlets` hasil `/api/me`.

## 9) Rollback Plan
- Revert file navigator/context/screen baru, lalu kembalikan `mobile/App.tsx` ke flow single-screen sebelumnya.

## 10) Changelog Singkat
- `2026-02-18 13:02` - Dependency React Navigation dipasang.
- `2026-02-18 13:05` - Session context + navigator auth/app selesai diintegrasikan.
- `2026-02-18 13:07` - Screen `Outlet Select` dan `Orders Today` terhubung ke API `/api/orders`.
