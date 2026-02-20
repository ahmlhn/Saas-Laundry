# CHG-20260220-mobile-phase6-staff-module

## Header
- Change ID: `CHG-20260220-mobile-phase6-staff-module`
- Status: `done`
- Date: `2026-02-20`
- Owner: `codex`
- Related Ticket: `MOB-008`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Menu `Kelola Pegawai` di tab Akun belum terhubung ke modul operasional mobile.
- Solusi yang dilakukan: Menambahkan endpoint `GET /api/users` (owner/admin), screen mobile `Kelola Pegawai`, dan wiring route dari tab Akun.
- Dampak bisnis/user: Owner/Admin dapat memantau akun pegawai langsung dari mobile, dan owner bisa melakukan arsip/restore akun pegawai.

## 2) Scope
- In scope:
  - Tambah endpoint list pegawai `GET /api/users`.
  - Tambah test API untuk list pegawai + include deleted.
  - Tambah module mobile `Kelola Pegawai`:
    - list, search, status, include deleted, arsip/restore.
  - Hubungkan menu `Kelola Pegawai` ke route aktif di tab Akun.
- Out of scope:
  - Create/update akun pegawai dari mobile.
  - Edit assignment outlet/role pegawai dari mobile.
  - Perubahan policy guard lifecycle pegawai (tetap owner-only untuk arsip/restore).

## 3) Acceptance Criteria
1. Menu `Kelola Pegawai` dapat membuka halaman pegawai dari tab Akun.
2. Owner/Admin dapat melihat daftar pegawai beserta role/outlet.
3. Owner dapat arsip/restore pegawai (dengan guard self-archive tetap berlaku).
4. Typecheck mobile lulus.

## 4) Implementasi Teknis
- Endpoint yang digunakan:
  - `GET /api/users`
  - `DELETE /api/users/{id}`
  - `POST /api/users/{id}/restore`
- Detail implementasi:
  - `GET /api/users` mendukung parameter `q`, `limit`, dan `include_deleted`.
  - Payload list pegawai menyertakan `roles`, `outlets`, dan `deleted_at`.
  - Mobile menampilkan card pegawai dengan status, role, assignment outlet, serta aksi arsip/restore untuk owner.

## 5) File yang Diubah
- `app/Http/Controllers/Api/UserManagementController.php`
- `routes/api.php`
- `tests/Feature/MasterDataBillingApiTest.php`
- `mobile/src/types/staff.ts`
- `mobile/src/features/staff/staffApi.ts`
- `mobile/src/screens/app/StaffScreen.tsx`
- `mobile/src/navigation/types.ts`
- `mobile/src/navigation/AppNavigator.tsx`
- `mobile/src/screens/app/AccountHubScreen.tsx`
- `mobile/README.md`
- `docs/MOBILE_VIDEO_REFERENCE_PLAN_20260220.md`
- `docs/changes/CHG-20260220-mobile-phase6-staff-module.md`

## 6) Dampak API/DB/Config
- API changes: endpoint baru `GET /api/users`.
- DB migration: tidak ada.
- Env/config changes: tidak ada.

## 7) Testing dan Validasi
- Typecheck:
  - `cd mobile && npm run typecheck`
- Automated test:
  - `php artisan test --filter=test_user_list_endpoint_supports_search_and_include_deleted`
- Manual verification:
  - Login owner/admin -> Akun -> Kelola Pegawai -> cari data pegawai.
  - Login owner -> arsipkan pegawai -> toggle arsip -> restore.
  - Login admin -> verifikasi tombol arsip/restore tidak tampil.

## 8) Risiko dan Mitigasi
- Risiko utama: tenant dengan jumlah user sangat besar bisa menambah payload list awal.
- Mitigasi: endpoint memakai `limit`, mobile memakai cache in-memory, dan search server-side.

## 9) Rollback Plan
- Hapus route `GET /api/users` dan logic list pada controller.
- Hapus module `Kelola Pegawai` mobile (`staffApi`, `StaffScreen`, route stack).
- Kembalikan menu `Kelola Pegawai` ke state non-interaktif.

## 10) Changelog Singkat
- `2026-02-20` - Endpoint list pegawai API ditambahkan.
- `2026-02-20` - Screen mobile `Kelola Pegawai` ditambahkan.
- `2026-02-20` - Menu `Kelola Pegawai` di tab Akun diaktifkan.
