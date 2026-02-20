# CHG-20260218-mobile-app-kickoff-foundation

## Header
- Change ID: `CHG-20260218-mobile-app-kickoff-foundation`
- Status: `done`
- Date: `2026-02-18`
- Owner: `codex`
- Related Ticket: `MOB-001`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Belum ada codebase client mobile untuk mulai implementasi flow kasir/pekerja/kurir berbasis API existing.
- Solusi yang dilakukan: Menambahkan project `mobile/` berbasis Expo + TypeScript, implementasi auth session dasar (login, restore session, logout) ke endpoint Laravel API (`/api/auth/login`, `/api/me`, `/api/auth/logout`), dokumentasi setup environment mobile, dan perbaikan warning deprecate `SafeAreaView` dengan migrasi ke `react-native-safe-area-context`.
- Dampak bisnis/user: Tim sekarang punya baseline aplikasi mobile yang runnable untuk melanjutkan sprint fitur transaksi dan sinkronisasi offline.

## 2) Scope
- In scope:
  - Scaffold app mobile Expo TypeScript.
  - Setup env config untuk base URL API.
  - HTTP client + error mapper.
  - Secure token storage (`expo-secure-store`).
  - Login screen dan dashboard session context (roles/outlets/quota).
  - Logout flow.
  - Dokumentasi run mobile.
- Out of scope:
  - Integrasi fitur order/sync/invoice claim.
  - Navigasi multi-screen production.
  - Test e2e mobile device.

## 3) Acceptance Criteria
1. Aplikasi mobile bisa dijalankan dari folder `mobile/`.
2. User bisa login ke backend API dan melihat context user/outlet/quota.
3. Session token tersimpan aman dan bisa direstore saat app dibuka ulang.

## 4) Implementasi Teknis
- Pendekatan:
  - Generate Expo app baru dan menjadikannya subproject di repo.
  - Membuat layer modular `config`, `lib`, `features/auth`, `types`.
  - Mengganti `App.tsx` default menjadi flow auth/session sederhana sebagai baseline.
- Keputusan teknis penting:
  - Menggunakan `expo-secure-store` untuk penyimpanan token.
  - Menggunakan Laravel Sanctum personal token sesuai keputusan arsitektur di docs.
  - Menambahkan script `npm run typecheck` untuk validasi TypeScript cepat.
  - Menggunakan `react-native-safe-area-context` agar kompatibel dengan perubahan React Native terbaru.
- Trade-off:
  - Belum memakai state management global/navigation library agar kickoff tetap ringan dan cepat diverifikasi.

## 5) File yang Diubah
- `mobile/App.tsx`
- `mobile/app.json`
- `mobile/package.json`
- `mobile/package-lock.json`
- `mobile/.env.example`
- `mobile/.gitignore`
- `mobile/README.md`
- `mobile/src/config/env.ts`
- `mobile/src/features/auth/authApi.ts`
- `mobile/src/lib/httpClient.ts`
- `mobile/src/lib/secureTokenStorage.ts`
- `mobile/src/types/auth.ts`
- `README.md`
- `docs/changes/CHG-20260218-mobile-app-kickoff-foundation.md`

## 6) Dampak API/DB/Config
- API changes: tidak ada endpoint baru; menggunakan endpoint API yang sudah ada.
- DB migration: tidak ada.
- Env/config changes:
  - `mobile/.env`:
    - `EXPO_PUBLIC_API_URL`
    - `EXPO_PUBLIC_DEVICE_NAME`
- Backward compatibility: additive, tidak memengaruhi backend/web existing.

## 7) Testing dan Validasi
- Unit test: belum ada test unit mobile pada kickoff ini.
- Integration test: tidak ada.
- Manual verification:
  - `cd mobile && npm run typecheck` -> lulus.
  - Verifikasi flow runtime login/logout perlu dijalankan di emulator/device pada sesi berikutnya.
- Hasil: validasi statik TypeScript lulus; warning deprecated `SafeAreaView` sudah ditangani di level source code.

## 8) Risiko dan Mitigasi
- Risiko utama: base URL API salah untuk emulator/device sehingga login gagal konek.
- Mitigasi: dokumentasikan mapping URL untuk Android emulator, iOS simulator, dan device fisik di `mobile/README.md`.

## 9) Rollback Plan
- Hapus folder `mobile/`, revert penambahan section mobile di `README.md`, dan hapus dokumen perubahan ini.

## 10) Changelog Singkat
- `2026-02-18 11:18` - Scaffold project Expo TypeScript di folder `mobile/`.
- `2026-02-18 11:34` - Flow login/restore/logout ke Laravel API selesai.
- `2026-02-18 11:42` - Env example + dokumentasi mobile ditambahkan.
- `2026-02-18 11:46` - Typecheck lulus dan dokumen perubahan ditutup status done.
- `2026-02-18 12:58` - Warning deprecated `SafeAreaView` diperbaiki dengan `react-native-safe-area-context`.
