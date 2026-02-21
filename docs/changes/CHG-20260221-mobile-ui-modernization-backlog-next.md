# CHG-20260221-mobile-ui-modernization-backlog-next

## Header
- Change ID: `CHG-20260221-mobile-ui-modernization-backlog-next`
- Status: `completed`
- Date: `2026-02-21`
- Owner: `codex`
- Related Ticket: `MOB-UI-NEXT`

## 1) Ringkasan
- Tujuan: Menjaga ritme modernisasi UI/UX mobile secara bertahap dan terukur setelah penyempurnaan halaman Pesanan.
- Batch saat ini: modernisasi `Halaman Pelanggan`, `Quick Action`, `Reports`, dan `Account Hub` sebagai lanjutan opsi 3.

## 2) Status Halaman
- Selesai (batch aktif):
  - `mobile/src/screens/app/CustomersScreen.tsx`
  - `mobile/src/screens/app/CustomerDetailScreen.tsx`
  - `mobile/src/screens/app/CustomerFormScreen.tsx`
  - `mobile/src/screens/app/HomeDashboardScreen.tsx` (final consistency pass)
  - `mobile/src/screens/app/QuickActionScreen.tsx` (visual refresh + responsive layout)
  - `mobile/src/screens/app/ReportsScreen.tsx` (hierarchy + metric density + responsive cards)
  - `mobile/src/screens/app/AccountHubScreen.tsx` (menu grouping + icon rhythm + responsive actions)
  - `mobile/src/screens/app/OrderDetailScreen.tsx` (detail hierarchy + status actions clarity)
  - `mobile/src/screens/app/FinanceToolsScreen.tsx` (finance cards + form density + responsive polish)
  - `mobile/src/screens/app/OutletsScreen.tsx` (outlet list rhythm + responsive controls)
  - `mobile/src/screens/app/ServicesScreen.tsx` (service card readability + responsive controls)
  - `mobile/src/screens/app/StaffScreen.tsx` (role/status visibility + responsive controls)
  - `mobile/src/screens/app/HelpInfoScreen.tsx` (information architecture + icon navigation clarity)
  - `mobile/src/screens/app/WhatsAppToolsScreen.tsx` (campaign flow clarity + provider/status readability)
  - `mobile/src/screens/app/PrinterNoteScreen.tsx` (form grouping + responsive settings layout)
  - `mobile/src/screens/app/ShippingZonesScreen.tsx` (map/actions hierarchy + responsive form/list)
- Sudah dimodernisasi sebelumnya:
  - `mobile/src/screens/app/OrdersTodayScreen.tsx`
- Backlog modernisasi berikutnya (tahap selanjutnya):
  - Tidak ada backlog tersisa pada batch `MOB-UI-NEXT`.

## 3) Catatan Implementasi Backlog
1. Pertahankan design language `Clean Ocean` yang sudah dipakai di Pesanan/Pelanggan.
2. Gunakan pattern responsif yang sama (`isTablet`, `isLandscape`, `isCompactLandscape`).
3. Hindari duplikasi style logic; prioritaskan token theme + komponen reusable.
4. Setiap halaman wajib pass:
   - `npm run typecheck`
   - verifikasi manual portrait/landscape/dark mode.

## 4) Definition of Done per Halaman
1. Hierarki visual jelas (header, filter/search, content list/form).
2. Komponen touch target minimum nyaman (>= 40 px).
3. Empty/loading/error states konsisten.
4. Tidak ada regressi fungsi utama halaman.

## 5) Changelog
- `2026-02-21` - Backlog modernisasi mobile dicatat untuk eksekusi bertahap setelah batch Pelanggan.
- `2026-02-21` - `CustomerDetailScreen` dimodernisasi dan ditandai selesai pada batch aktif.
- `2026-02-21` - `CustomerFormScreen` dimodernisasi dan ditandai selesai pada batch aktif.
- `2026-02-21` - `HomeDashboardScreen` final consistency pass diselesaikan (responsif lanskap + refresh saat kembali fokus).
- `2026-02-21` - `QuickActionScreen` dimodernisasi (hero section, CTA berikon, responsif tablet/lanskap, ringkasan form lebih rapi).
- `2026-02-21` - `ReportsScreen` dimodernisasi (hero laporan, metrik 2x2 responsif, panel komposisi pembayaran).
- `2026-02-21` - `AccountHubScreen` dimodernisasi (ringkasan profil, menu berikon, aksi akun responsif).
- `2026-02-21` - `OrderDetailScreen` dimodernisasi (hero detail, ringkasan pembayaran card, quick-action status berikon).
- `2026-02-21` - `FinanceToolsScreen` dimodernisasi (hero finance, grid metrik responsif, feedback state berikon).
- `2026-02-21` - `OutletsScreen` dimodernisasi (hero header, pencarian/filter lebih rapi, aksi outlet berikon).
- `2026-02-21` - `ServicesScreen` dimodernisasi (hero header, kontrol filter responsif, kartu layanan diperjelas).
- `2026-02-21` - `StaffScreen` dimodernisasi (hero header, card pegawai lebih jelas, kontrol arsip/refresh berikon).
- `2026-02-21` - `HelpInfoScreen` dimodernisasi (navigasi bantuan berikon, hierarchy panel lebih jelas).
- `2026-02-21` - `WhatsAppToolsScreen` dimodernisasi (hero WA, panel provider/statistik lebih ringkas, warning/error lebih jelas).
- `2026-02-21` - `PrinterNoteScreen` dimodernisasi (hero pengaturan nota, group form lebih rapi, feedback state berikon).
- `2026-02-21` - `ShippingZonesScreen` dimodernisasi (hero zona, filter/list lebih jelas, form tambah zona responsif).
