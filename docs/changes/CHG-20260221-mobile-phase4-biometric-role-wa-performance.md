# CHG-20260221-mobile-phase4-biometric-role-wa-performance

## Header
- Change ID: `CHG-20260221-mobile-phase4-biometric-role-wa-performance`
- Status: `done`
- Date: `2026-02-21`
- Owner: `codex`
- Related Ticket: `MOB-006`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Fase 3 sudah menutup modul utility, tetapi belum ada biometric re-login, kontrol visibility berbasis role, gate WA berdasarkan plan, dan pass performa list mobile.
- Solusi yang dilakukan: Menambahkan biometric unlock flow, role/plan access control di navigator + menu akun, modul WA read-only dengan plan gate, serta optimasi list lewat cache + pagination + skeleton loading.
- Dampak bisnis/user: Akses aplikasi lebih aman dan cepat, menu lebih sesuai hak akses user, serta performa list lebih stabil saat data membesar.

## 2) Scope
- In scope:
  - Biometric:
    - Integrasi `expo-local-authentication`.
    - Sesi token tersimpan dapat di-unlock via biometrik.
    - Toggle biometrik dari tab Akun.
  - Role-based visibility:
    - Tab `Quick Action` dan `Laporan` hanya untuk owner/admin/cashier.
    - Menu akun difilter berdasarkan role.
  - WA feature gate:
    - Gate berdasarkan role owner/admin dan plan `premium/pro`.
    - Screen `Kirim WA` untuk status provider + ringkasan pesan.
  - Performance:
    - In-memory cache untuk list orders/customers.
    - Pagination incremental sampai 100 item.
    - Skeleton loading pada list pesanan dan pelanggan.
- Out of scope:
  - Enrollment biometrik sistem operasi (tetap dikelola setting device).
  - CRUD lengkap modul WA/provider config dari mobile.
  - Pagination server-side berbasis cursor/page (backend saat ini masih `limit`).

## 3) Acceptance Criteria
1. User bisa mengaktifkan biometrik dari tab Akun dan login ulang via biometrik dari halaman login.
2. Visibilitas tab/menu berubah sesuai role.
3. Menu WA terkunci bila plan tidak eligible, dan terbuka untuk plan eligible.
4. List order/pelanggan memiliki skeleton loading + load more, dan typecheck lulus.

## 4) Implementasi Teknis
- Modul baru:
  - `src/lib/biometricAuth.ts`
  - `src/lib/accessControl.ts`
  - `src/lib/queryCache.ts`
  - `src/components/ui/AppSkeletonBlock.tsx`
  - `src/features/wa/waApi.ts`
  - `src/screens/app/WhatsAppToolsScreen.tsx`
  - `src/types/wa.ts`
- Refactor utama:
  - `SessionContext`: bootstrap sesi dengan mode biometric-lock, method `biometricLogin`, dan toggle biometrik.
  - `LoginScreen`: tombol login biometrik saat sesi tersimpan.
  - `AppNavigator`: conditional tab visibility berbasis role + route WA.
  - `AccountHubScreen`: role/plan filtering + security setting biometrik.
  - `OrdersTodayScreen`: pagination incremental + skeleton loading.
  - `CustomersScreen`: pagination incremental + skeleton loading.
  - `orderApi/customerApi`: cache read + invalidasi cache saat mutasi.
- Dependency:
  - Tambah `expo-local-authentication`.

## 5) File yang Diubah
- `mobile/package.json`
- `mobile/package-lock.json`
- `mobile/src/lib/httpClient.ts`
- `mobile/src/lib/secureTokenStorage.ts`
- `mobile/src/state/SessionContext.tsx`
- `mobile/src/screens/auth/LoginScreen.tsx`
- `mobile/src/navigation/AppNavigator.tsx`
- `mobile/src/navigation/types.ts`
- `mobile/src/screens/app/AccountHubScreen.tsx`
- `mobile/src/screens/app/OrdersTodayScreen.tsx`
- `mobile/src/screens/app/CustomersScreen.tsx`
- `mobile/src/screens/app/FinanceToolsScreen.tsx`
- `mobile/src/components/ui/AppSkeletonBlock.tsx`
- `mobile/src/lib/biometricAuth.ts`
- `mobile/src/lib/accessControl.ts`
- `mobile/src/lib/queryCache.ts`
- `mobile/src/features/orders/orderApi.ts`
- `mobile/src/features/customers/customerApi.ts`
- `mobile/src/features/wa/waApi.ts`
- `mobile/src/screens/app/WhatsAppToolsScreen.tsx`
- `mobile/src/types/wa.ts`
- `mobile/README.md`
- `docs/MOBILE_VIDEO_REFERENCE_PLAN_20260220.md`
- `docs/changes/CHG-20260221-mobile-phase4-biometric-role-wa-performance.md`

## 6) Dampak API/DB/Config
- API changes: tidak ada endpoint baru.
- DB migration: tidak ada.
- Env/config changes: tidak ada.

## 7) Testing dan Validasi
- Typecheck:
  - `cd mobile && npm run typecheck` -> lulus.
- Manual verification:
  - Login email/password -> aktifkan biometrik di tab Akun -> logout -> login via biometrik.
  - Login role worker/courier -> tab `+` dan `Laporan` tidak tampil.
  - Login role owner/admin plan non-premium/pro -> menu WA terkunci.
  - Login role owner/admin plan premium/pro -> menu WA terbuka dan data provider/message tampil.
  - List order/pelanggan -> scroll/load more sampai limit bertambah.

## 8) Risiko dan Mitigasi
- Risiko utama: Biometrik device berbeda-beda sehingga user bisa gagal autentikasi.
- Mitigasi: fallback login email/password tetap tersedia dan pesan error biometrik dibuat eksplisit.

## 9) Rollback Plan
- Revert commit fase 4:
  - hapus biometric flow di `SessionContext` dan `LoginScreen`,
  - kembalikan tab/menu static,
  - rollback perubahan cache/pagination/skeleton di list screen.

## 10) Changelog Singkat
- `2026-02-21` - Biometric unlock flow ditambahkan.
- `2026-02-21` - Role-based tab/menu visibility diaktifkan.
- `2026-02-21` - WA plan gate + screen WA read-only ditambahkan.
- `2026-02-21` - Cache + pagination + skeleton loading untuk orders/customers diaktifkan.
