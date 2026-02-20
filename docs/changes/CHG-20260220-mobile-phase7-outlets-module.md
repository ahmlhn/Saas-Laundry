# CHG-20260220-mobile-phase7-outlets-module

## Header
- Change ID: `CHG-20260220-mobile-phase7-outlets-module`
- Status: `done`
- Date: `2026-02-20`
- Owner: `codex`
- Related Ticket: `MOB-009`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Menu `Kelola Outlet` di tab Akun belum terhubung ke modul operasional mobile.
- Solusi yang dilakukan: Menambahkan endpoint `GET /api/outlets`, screen mobile `Kelola Outlet`, serta wiring route dari tab Akun.
- Dampak bisnis/user: Owner/Admin dapat memonitor outlet langsung dari mobile, owner bisa arsip/restore outlet, dan user bisa mengubah outlet aktif dari tab Akun.

## 2) Scope
- In scope:
  - Tambah endpoint list outlet `GET /api/outlets`.
  - Tambah test API untuk list outlet + policy include deleted.
  - Tambah module mobile `Kelola Outlet`:
    - list, search, pilih outlet aktif, include deleted, arsip/restore.
  - Hubungkan menu `Kelola Outlet` ke route aktif di tab Akun.
- Out of scope:
  - Create/update outlet dari mobile.
  - Konfigurasi detail outlet (jam operasional, ongkir) dari mobile.
  - Perubahan policy guard lifecycle outlet (tetap owner-only untuk arsip/restore).

## 3) Acceptance Criteria
1. Menu `Kelola Outlet` dapat membuka halaman outlet dari tab Akun.
2. Owner/Admin dapat melihat daftar outlet sesuai scope akses.
3. Owner dapat arsip/restore outlet sesuai guard backend.
4. User owner/admin dapat memilih outlet aktif dari modul Akun.
5. Typecheck mobile lulus.

## 4) Implementasi Teknis
- Endpoint yang digunakan:
  - `GET /api/outlets`
  - `DELETE /api/outlets/{id}`
  - `POST /api/outlets/{id}/restore`
- Detail implementasi:
  - `GET /api/outlets` mendukung parameter `q`, `limit`, dan `include_deleted` (owner-only).
  - Owner melihat outlet tenant penuh; admin melihat outlet sesuai assignment.
  - Mobile menampilkan card outlet (kode, timezone, alamat, status) dengan aksi:
    - `Jadikan Aktif` untuk outlet aktif app context.
    - `Arsipkan/Restore` untuk role owner.

## 5) File yang Diubah
- `app/Http/Controllers/Api/OutletManagementController.php`
- `routes/api.php`
- `tests/Feature/MasterDataBillingApiTest.php`
- `mobile/src/types/outlet.ts`
- `mobile/src/features/outlets/outletApi.ts`
- `mobile/src/screens/app/OutletsScreen.tsx`
- `mobile/src/navigation/types.ts`
- `mobile/src/navigation/AppNavigator.tsx`
- `mobile/src/screens/app/AccountHubScreen.tsx`
- `mobile/README.md`
- `docs/MOBILE_VIDEO_REFERENCE_PLAN_20260220.md`
- `docs/changes/CHG-20260220-mobile-phase7-outlets-module.md`

## 6) Dampak API/DB/Config
- API changes: endpoint baru `GET /api/outlets`.
- DB migration: tidak ada.
- Env/config changes: tidak ada.

## 7) Testing dan Validasi
- Typecheck:
  - `cd mobile && npm run typecheck`
- Automated test:
  - `php artisan test --filter=test_outlet_list_endpoint_supports_scope_and_include_deleted_policy`
- Manual verification:
  - Login owner/admin -> Akun -> Kelola Outlet -> cari outlet.
  - Pilih `Jadikan Aktif` dari daftar outlet non-arsip.
  - Login owner -> arsipkan outlet -> toggle arsip -> restore outlet.

## 8) Risiko dan Mitigasi
- Risiko utama: perpindahan outlet aktif bisa membingungkan user bila tidak terlihat jelas.
- Mitigasi: tombol outlet aktif diberi state disabled + label `Outlet Aktif`, serta snackbar message setelah pergantian outlet.

## 9) Rollback Plan
- Hapus route `GET /api/outlets` dan logic list pada controller.
- Hapus module `Kelola Outlet` mobile (`outletApi`, `OutletsScreen`, route stack).
- Kembalikan menu `Kelola Outlet` ke state non-interaktif.

## 10) Changelog Singkat
- `2026-02-20` - Endpoint list outlet API ditambahkan.
- `2026-02-20` - Screen mobile `Kelola Outlet` ditambahkan.
- `2026-02-20` - Menu `Kelola Outlet` di tab Akun diaktifkan.
