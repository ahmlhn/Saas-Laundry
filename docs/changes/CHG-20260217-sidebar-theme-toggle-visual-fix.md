# CHG-20260217-sidebar-theme-toggle-visual-fix

## Header
- Change ID: `CHG-20260217-sidebar-theme-toggle-visual-fix`
- Status: `done`
- Date: `2026-02-17`
- Owner: `codex`
- Related Ticket: `UIUX-HOTFIX`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Sidebar terlihat tidak berubah saat tombol tema diklik karena style light/dark terlalu mirip (sama-sama gelap).
- Solusi yang dilakukan: Menambahkan style khusus mode terang untuk sidebar dan elemen turunannya agar perbedaan tema terlihat jelas.
- Dampak bisnis/user: Toggle tema sekarang memberi feedback visual yang jelas pada area sidebar.

## 2) Scope
- In scope:
  - Perbaikan style sidebar mode terang.
  - Penyesuaian warna link/brand/footer sidebar di mode terang.
- Out of scope:
  - Perubahan logika toggle tema JS.
  - Redesign layout panel secara menyeluruh.

## 3) Acceptance Criteria
1. Saat mode terang aktif, sidebar tampil dengan palet light.
2. Saat mode gelap aktif, sidebar kembali ke palet dark yang sudah ada.
3. Build frontend tetap lulus.

## 4) Implementasi Teknis
- Pendekatan: Tambah selector `html:not(.dark)` untuk override komponen sidebar pada mode terang.
- Keputusan teknis penting: Logic `toggleTheme()` tidak diubah karena sudah benar; masalah ada di visual styling.
- Trade-off: CSS sidebar menjadi sedikit lebih panjang karena explicit override mode terang.

## 5) File yang Diubah
- `resources/css/app.css`
- `docs/changes/CHG-20260217-sidebar-theme-toggle-visual-fix.md`

## 6) Dampak API/DB/Config
- API changes: tidak ada.
- DB migration: tidak ada.
- Env/config changes: tidak ada.
- Backward compatibility: aman (UI-only, additive).

## 7) Testing dan Validasi
- Unit test: tidak ada.
- Integration test: tidak ada perubahan behavior backend.
- Manual verification:
  - Klik tombol tema di header panel dan amati sidebar light/dark.
- Hasil:
  - `npm run build` -> pass.

## 8) Risiko dan Mitigasi
- Risiko utama: kontras teks pada sidebar mode terang kurang terbaca di beberapa monitor.
- Mitigasi: gunakan tone teks gelap + border yang cukup kontras untuk link aktif/nonaktif.

## 9) Rollback Plan
- Kembalikan style sidebar ke versi sebelumnya di `resources/css/app.css`.

## 10) Changelog Singkat
- `2026-02-17 15:30` - Implementasi fix visual sidebar tema terang/gelap selesai.
- `2026-02-17 15:30` - Build frontend lulus, dokumen perubahan ditutup `done`.
