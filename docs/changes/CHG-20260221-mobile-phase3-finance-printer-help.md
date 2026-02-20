# CHG-20260221-mobile-phase3-finance-printer-help

## Header
- Change ID: `CHG-20260221-mobile-phase3-finance-printer-help`
- Status: `done`
- Date: `2026-02-21`
- Owner: `codex`
- Related Ticket: `MOB-005`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Fase 2 baru menutup modul pelanggan; fitur utility operasional dari referensi video (`Kelola Keuangan`, `Printer & Nota`, `Bantuan`) belum tersedia.
- Solusi yang dilakukan: Menambahkan 3 screen fase 3 pada stack tab Akun, menghubungkannya dari menu akun, serta menyiapkan API billing dan storage konfigurasi nota.
- Dampak bisnis/user: Owner/Admin bisa memantau snapshot kuota + transaksi dari mobile; tim outlet bisa menyiapkan format nota dari perangkat tanpa menunggu web panel.

## 2) Scope
- In scope:
  - Tambah route account stack:
    - `FinanceTools`
    - `PrinterNote`
    - `HelpInfo`
  - Screen `Kelola Keuangan`:
    - Konsumsi `GET /api/billing/quota` (role owner/admin).
    - Snapshot ringkas kas dari `GET /api/orders` outlet aktif.
    - Aksi keuangan ditampilkan sebagai menu operasional dengan messaging readiness.
  - Screen `Printer & Nota`:
    - Form profil nota, catatan kaki, mode nomor default/custom, toggle e-nota.
    - Persist konfigurasi lokal via `expo-secure-store`.
  - Screen `Bantuan & Informasi`:
    - Struktur menu bantuan + informasi sesuai referensi UX.
  - Update menu tab Akun agar modul baru dapat diakses.
- Out of scope:
  - Persist finance entries (pendapatan/pengeluaran/koreksi) ke backend karena endpoint belum tersedia.
  - Upload logo nota ke server.
  - Deep-link ke konten FAQ/training eksternal.

## 3) Acceptance Criteria
1. Dari tab Akun, user bisa membuka halaman `Kelola Keuangan`, `Printer & Nota`, dan `Bantuan & Informasi`.
2. Halaman keuangan menampilkan data dari API yang tersedia tanpa crash.
3. Pengaturan printer/nota bisa disimpan dan dimuat ulang pada perangkat yang sama.
4. Typecheck aplikasi mobile lulus.

## 4) Implementasi Teknis
- Pendekatan:
  - Extend `AccountStack` agar modul utility fase 3 tetap berada dalam konteks tab Akun.
  - Prioritaskan endpoint existing untuk data real (`billing/quota`, `orders`) dan gunakan local persistence untuk konfigurasi yang belum punya endpoint.
- Endpoint yang digunakan:
  - `GET /api/billing/quota`
  - `GET /api/orders`
- Trade-off:
  - Aksi finance detail masih berupa readiness action (UI-ready) menunggu API dedicated.
  - Setting nota saat ini scoped per-device karena disimpan lokal.

## 5) File yang Diubah
- `mobile/src/navigation/types.ts`
- `mobile/src/navigation/AppNavigator.tsx`
- `mobile/src/screens/app/AccountHubScreen.tsx`
- `mobile/src/screens/app/FinanceToolsScreen.tsx`
- `mobile/src/screens/app/PrinterNoteScreen.tsx`
- `mobile/src/screens/app/HelpInfoScreen.tsx`
- `mobile/src/features/billing/billingApi.ts`
- `mobile/src/features/settings/printerNoteStorage.ts`
- `mobile/src/types/billing.ts`
- `mobile/src/types/printerNote.ts`
- `mobile/README.md`
- `docs/changes/CHG-20260221-mobile-phase3-finance-printer-help.md`

## 6) Dampak API/DB/Config
- API changes: tidak ada endpoint baru.
- DB migration: tidak ada.
- Env/config changes: tidak ada.

## 7) Testing dan Validasi
- Typecheck:
  - `cd mobile && npm run typecheck` -> lulus.
- Manual verification:
  - Tab Akun -> buka `Kelola Keuangan` (role owner/admin) -> data quota + snapshot order muncul.
  - Tab Akun -> buka `Printer & Nota` -> ubah field -> simpan -> re-open screen -> nilai tetap.
  - Tab Akun -> buka `Bantuan & Informasi` -> item bisa ditekan tanpa crash.

## 8) Risiko dan Mitigasi
- Risiko utama: ekspektasi user bahwa aksi finance sudah fully writeable.
- Mitigasi: tampilkan messaging eksplisit bahwa write API finance detail masih menunggu backend.

## 9) Rollback Plan
- Revert perubahan route account stack fase 3, hapus 3 screen utility, dan kembalikan menu akun menjadi state fase 2.

## 10) Changelog Singkat
- `2026-02-21` - Tambah screen `Kelola Keuangan` dengan data API billing/order.
- `2026-02-21` - Tambah screen `Printer & Nota` dengan local persistence.
- `2026-02-21` - Tambah screen `Bantuan & Informasi` dan hubungkan dari tab Akun.
