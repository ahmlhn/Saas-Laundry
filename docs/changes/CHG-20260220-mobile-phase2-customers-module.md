# CHG-20260220-mobile-phase2-customers-module

## Header
- Change ID: `CHG-20260220-mobile-phase2-customers-module`
- Status: `done`
- Date: `2026-02-20`
- Owner: `codex`
- Related Ticket: `MOB-004`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Setelah fase 1, tab Akun masih berupa hub statis dan belum punya modul operasional nyata.
- Solusi yang dilakukan: Menambahkan modul `Pelanggan` pada mobile (list, cari, tambah, edit, arsip/restore sesuai role), dan menghubungkannya dari menu `Pelanggan Saya` di tab Akun.
- Dampak bisnis/user: Owner/Admin/Kasir dapat mengelola data pelanggan langsung dari aplikasi mobile tanpa perlu pindah ke web panel.

## 2) Scope
- In scope:
  - Tambah `AccountStack` di dalam tab Akun.
  - Tambah screen `Customers`.
  - Tambah API client mobile untuk endpoint customer.
  - Tambah role guard UI:
    - Owner/Admin/Cashier: create/update.
    - Owner/Admin: archive/restore + include deleted toggle.
- Out of scope:
  - Pagination backend untuk customer list.
  - Multi-form validation kompleks.
  - Modul lain di tab Akun (keuangan, printer, bantuan) masih placeholder.

## 3) Acceptance Criteria
1. Menu `Pelanggan Saya` di tab Akun dapat membuka halaman pelanggan.
2. User role owner/admin/cashier bisa tambah/edit pelanggan.
3. User role owner/admin bisa arsip/restore pelanggan.
4. Typecheck aplikasi mobile lulus.

## 4) Implementasi Teknis
- Pendekatan:
  - Menambahkan stack khusus tab Akun agar modul berikutnya tinggal extend.
  - Menjaga screen pelanggan satu halaman (list + form) agar delivery cepat.
- Endpoint yang digunakan:
  - `GET /api/customers`
  - `POST /api/customers`
  - `PATCH /api/customers/{id}`
  - `DELETE /api/customers/{id}`
  - `POST /api/customers/{id}/restore`
- Trade-off:
  - Belum ada pagination/virtual query; limit list sementara fixed untuk fase awal.

## 5) File yang Diubah
- `mobile/src/navigation/types.ts`
- `mobile/src/navigation/AppNavigator.tsx`
- `mobile/src/screens/app/AccountHubScreen.tsx`
- `mobile/src/screens/app/CustomersScreen.tsx`
- `mobile/src/features/customers/customerApi.ts`
- `mobile/src/types/customer.ts`
- `docs/changes/CHG-20260220-mobile-phase2-customers-module.md`

## 6) Dampak API/DB/Config
- API changes: tidak ada endpoint baru, hanya konsumsi endpoint existing.
- DB migration: tidak ada.
- Env/config changes: tidak ada.

## 7) Testing dan Validasi
- Typecheck:
  - `cd mobile && npm run typecheck` -> lulus.
- Manual verification:
  - Login role cashier -> buka Akun -> Pelanggan -> tambah/edit.
  - Login role admin/owner -> verifikasi tombol arsip/restore.
  - Verifikasi toggle include deleted hanya muncul untuk admin/owner.

## 8) Risiko dan Mitigasi
- Risiko utama: validasi format nomor HP backend menolak input user.
- Mitigasi: tampilkan pesan error API langsung di form agar user cepat koreksi.

## 9) Rollback Plan
- Revert perubahan `AccountStack`, hapus screen/API customer mobile, dan kembalikan menu `Pelanggan Saya` menjadi non-interaktif.

## 10) Changelog Singkat
- `2026-02-20` - Account tab diubah menjadi stack navigator.
- `2026-02-20` - Screen customer list + form upsert ditambahkan.
- `2026-02-20` - Arsip/restore customer berbasis role diaktifkan.
