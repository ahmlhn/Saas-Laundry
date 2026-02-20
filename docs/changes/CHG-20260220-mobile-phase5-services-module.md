# CHG-20260220-mobile-phase5-services-module

## Header
- Change ID: `CHG-20260220-mobile-phase5-services-module`
- Status: `done`
- Date: `2026-02-20`
- Owner: `codex`
- Related Ticket: `MOB-007`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Menu `Kelola Layanan/Produk` di tab Akun masih belum terhubung ke modul nyata.
- Solusi yang dilakukan: Menambahkan screen layanan mobile (list, search, status, arsip/restore), API client service, dan wiring route dari menu Akun.
- Dampak bisnis/user: Owner/Admin bisa merapikan katalog layanan langsung dari mobile, tanpa membuka panel web.

## 2) Scope
- In scope:
  - Tambah route `Services` pada `AccountStack`.
  - Tambah screen `Services` pada mobile.
  - Tambah API client mobile untuk endpoint service.
  - Tambah status `deleted_at` di response `GET /api/services` agar mobile bisa membedakan item arsip.
  - Tambah validasi test API service lifecycle untuk payload `deleted_at`.
- Out of scope:
  - Create/update layanan dari mobile.
  - Override harga outlet dari mobile.
  - Modul master data lain (`Pegawai`, `Outlet`) untuk fase lanjutan.

## 3) Acceptance Criteria
1. Menu `Kelola Layanan/Produk` di tab Akun membuka halaman layanan.
2. Data layanan tampil dengan harga dasar dan harga berlaku (effective price) sesuai outlet aktif.
3. Owner/Admin dapat arsip dan restore layanan.
4. Typecheck mobile lulus dan test API service lifecycle lulus.

## 4) Implementasi Teknis
- Endpoint yang digunakan:
  - `GET /api/services`
  - `DELETE /api/services/{id}`
  - `POST /api/services/{id}/restore`
- Detail implementasi:
  - Response `/api/services` kini menyertakan `deleted_at` (backward-compatible).
  - Client mobile `serviceApi` mendukung cache, invalidasi cache saat mutasi, dan filter `include_deleted`.
  - Screen `ServicesScreen` menyediakan:
    - search lokal berdasarkan nama/unit,
    - filter `Hanya Aktif` / `Semua Status`,
    - toggle `Menampilkan Arsip`,
    - aksi `Arsipkan/Restore` untuk owner/admin.

## 5) File yang Diubah
- `app/Http/Controllers/Api/ServiceCatalogController.php`
- `tests/Feature/MasterDataBillingApiTest.php`
- `mobile/src/types/service.ts`
- `mobile/src/features/services/serviceApi.ts`
- `mobile/src/screens/app/ServicesScreen.tsx`
- `mobile/src/navigation/types.ts`
- `mobile/src/navigation/AppNavigator.tsx`
- `mobile/src/screens/app/AccountHubScreen.tsx`
- `mobile/README.md`
- `docs/MOBILE_VIDEO_REFERENCE_PLAN_20260220.md`
- `docs/changes/CHG-20260220-mobile-phase5-services-module.md`

## 6) Dampak API/DB/Config
- API changes: payload `GET /api/services` bertambah field `deleted_at`.
- DB migration: tidak ada.
- Env/config changes: tidak ada.

## 7) Testing dan Validasi
- Typecheck:
  - `cd mobile && npm run typecheck`
- Automated test:
  - `php artisan test --filter=test_service_lifecycle_archive_restore_and_include_deleted_filter`
- Manual verification:
  - Login owner/admin -> Akun -> Kelola Layanan/Produk -> verifikasi list + search.
  - Arsipkan satu layanan -> aktifkan filter arsip -> restore layanan.

## 8) Risiko dan Mitigasi
- Risiko utama: tenant dengan data layanan besar bisa menambah beban render awal.
- Mitigasi: data list service memakai cache in-memory; pagination bisa ditambah di fase berikutnya bila volume meningkat.

## 9) Rollback Plan
- Revert route `Services` di mobile navigator.
- Hapus `ServicesScreen` dan `serviceApi`.
- Kembalikan menu `Kelola Layanan/Produk` menjadi non-interaktif.
- Revert penambahan `deleted_at` pada response `GET /api/services`.

## 10) Changelog Singkat
- `2026-02-20` - Route dan screen `Kelola Layanan/Produk` mobile ditambahkan.
- `2026-02-20` - API service response menambahkan `deleted_at`.
- `2026-02-20` - Aksi arsip/restore layanan dari mobile diaktifkan untuk owner/admin.
