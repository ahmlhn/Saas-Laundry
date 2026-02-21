# CHG-20260221-mobile-ui-modernization-backlog-next

## Header
- Change ID: `CHG-20260221-mobile-ui-modernization-backlog-next`
- Status: `in_progress`
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
- Sudah dimodernisasi sebelumnya:
  - `mobile/src/screens/app/OrdersTodayScreen.tsx`
- Backlog modernisasi berikutnya (tahap selanjutnya):
  - `mobile/src/screens/app/OrderDetailScreen.tsx` (hierarchy ringkasan + CTA flow)
  - `mobile/src/screens/app/FinanceToolsScreen.tsx` (density tools + quick actions)
  - `mobile/src/screens/app/OutletsScreen.tsx` (list rhythm + state feedback)
  - `mobile/src/screens/app/ServicesScreen.tsx` (service card readability)
  - `mobile/src/screens/app/StaffScreen.tsx` (role/status visibility)
  - `mobile/src/screens/app/ShippingZonesScreen.tsx` (map/actions hierarchy)
  - `mobile/src/screens/app/PrinterNoteScreen.tsx` (form grouping)
  - `mobile/src/screens/app/WhatsAppToolsScreen.tsx` (campaign flow clarity)
  - `mobile/src/screens/app/HelpInfoScreen.tsx` (information architecture)

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
