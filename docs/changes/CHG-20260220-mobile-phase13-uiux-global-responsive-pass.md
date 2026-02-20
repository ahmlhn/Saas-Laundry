# CHG-20260220-mobile-phase13-uiux-global-responsive-pass

## Header
- Change ID: `CHG-20260220-mobile-phase13-uiux-global-responsive-pass`
- Status: `done`
- Date: `2026-02-20`
- Owner: `codex`
- Related Ticket: `MOB-015`

## 1) Ringkasan Perubahan
- Masalah/tujuan: UI antar-screen mobile belum konsisten dan belum optimal untuk kombinasi viewport HP/tablet serta orientasi portrait/landscape.
- Solusi yang dilakukan: Melakukan pass global pada komponen dasar UI agar seluruh halaman mendapat peningkatan visual/interaction secara seragam.
- Dampak bisnis/user: Pengalaman penggunaan jadi lebih konsisten, navigasi lebih jelas, dan layout lebih aman pada perangkat beragam.

## 2) Scope
- In scope:
  - Refactor komponen dasar:
    - `AppScreen`
    - `AppPanel`
    - `AppButton`
    - `StatusPill`
  - Upgrade visual bottom tab:
    - ikon tab yang lebih representatif,
    - tuning layout tab untuk landscape/tablet.
  - Aktivasi dukungan orientasi portrait + landscape di konfigurasi Expo.
- Out of scope:
  - Rewrite total gaya visual per-screen secara manual satu per satu.
  - Penambahan animasi kompleks per fitur.

## 3) Acceptance Criteria
1. Aplikasi mobile dapat dipakai pada orientasi portrait dan landscape.
2. Komponen utama (`AppScreen`, `AppPanel`, `AppButton`, `StatusPill`) memiliki style/hierarchy yang konsisten lintas fitur.
3. Bottom tab menampilkan ikon yang jelas dan tetap usable pada landscape/tablet.
4. Typecheck mobile lulus.

## 4) Implementasi Teknis
- `AppScreen`
  - Menambah rules responsive max-width + center alignment untuk konten.
  - Menambah adaptasi backdrop shape berdasarkan orientasi.
  - Menambah `keyboardDismissMode="on-drag"` pada mode scroll.
- `AppPanel`
  - Menambah adaptasi radius/padding/shadow untuk konteks tablet/landscape.
- `AppButton`
  - Menambah visual hierarchy dan feedback press yang lebih halus.
- `StatusPill`
  - Menambah border tone-aware untuk keterbacaan status.
- `AppNavigator`
  - Mengganti tab label icon teks menjadi icon actual via `@expo/vector-icons`.
  - Menyesuaikan ukuran tab/icon untuk landscape/tablet.
- `app.json`
  - `orientation` diubah dari `portrait` ke `default`.

## 5) File yang Diubah
- `mobile/app.json`
- `mobile/package.json`
- `mobile/package-lock.json`
- `mobile/src/components/layout/AppScreen.tsx`
- `mobile/src/components/ui/AppPanel.tsx`
- `mobile/src/components/ui/AppButton.tsx`
- `mobile/src/components/ui/StatusPill.tsx`
- `mobile/src/navigation/AppNavigator.tsx`
- `mobile/README.md`
- `docs/MOBILE_VIDEO_REFERENCE_PLAN_20260220.md`
- `docs/changes/CHG-20260220-mobile-phase13-uiux-global-responsive-pass.md`

## 6) Dampak API/DB/Config
- API changes: tidak ada.
- DB migration: tidak ada.
- Config changes:
  - `mobile/app.json` orientasi app -> `default`.

## 7) Testing dan Validasi
- Typecheck:
  - `cd mobile && npm run typecheck`
- Manual verification:
  - Login -> outlet select -> main tabs pada portrait dan landscape.
  - Cek keterbacaan card/button/status badge pada HP kecil, HP besar, dan tablet.

## 8) Risiko dan Mitigasi
- Risiko utama: style global bisa memengaruhi densitas beberapa screen legacy.
- Mitigasi:
  - menjaga perubahan tetap di komponen dasar + verifikasi typecheck,
  - tetap membuka opsi tune per-screen pada iterasi berikutnya bila ada regression visual.

## 9) Rollback Plan
- Revert commit fase ini.
- Kembalikan orientasi app ke `portrait` pada `app.json`.
- Kembalikan komponen dasar ke baseline sebelum pass global.

## 10) Changelog Singkat
- `2026-02-20` - Pass UI/UX global pada komponen dasar mobile.
- `2026-02-20` - Bottom tab diganti ke ikon representatif + responsive tuning.
- `2026-02-20` - Dukungan portrait+landscape diaktifkan.
