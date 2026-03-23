# CHG-20260321-mobile-offline-foundation-phase1

## Header
- Change ID: `CHG-20260321-mobile-offline-foundation-phase1`
- Status: `done`
- Date: `2026-03-21`
- Owner: `codex`
- Related Ticket: `MOB-OFFLINE-001`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Mobile belum punya fondasi offline-first yang aman; sesi lama bisa hilang hanya karena request `/me` gagal, belum ada local DB persisten, dan belum ada status konektivitas global.
- Solusi yang dilakukan: Menambahkan fondasi fase 1 berupa SQLite local DB, app-meta storage, device identity dan sync state persisten, connectivity provider global, serta session snapshot fallback untuk bootstrap offline.
- Dampak bisnis/user: Aplikasi mobile sekarang punya jalur dasar untuk boot dengan sesi lama saat jaringan/API bermasalah, dan repo siap masuk ke fase `local read model`.

## 2) Scope
- In scope:
  - Menambah dependency fondasi offline mobile
  - Menambah local DB persisten dan app meta store
  - Menambah penyimpanan `device_id`, `last_sync_cursor`, dan sync state dasar
  - Menambah session snapshot untuk restore saat offline
  - Mengubah bootstrap `SessionContext` agar membedakan network/server error vs `401/403`
  - Menambah provider konektivitas global
- Out of scope:
  - Sinkron `customers/services/orders` ke local DB
  - Outbox mutation
  - Offline create order/payment/status
  - UI indicator pending sync

## 3) Implementasi Teknis
- Dependency baru:
  - `expo-sqlite`
  - `@react-native-community/netinfo`
- Modul baru:
  - `mobile/src/features/localdb/database.ts`
  - `mobile/src/features/localdb/appMetaStorage.ts`
  - `mobile/src/features/session/sessionSnapshotStorage.ts`
  - `mobile/src/features/sync/deviceIdentity.ts`
  - `mobile/src/features/sync/syncStateStorage.ts`
  - `mobile/src/features/connectivity/ConnectivityContext.tsx`
- Integrasi:
  - `mobile/App.tsx` sekarang memasang `ConnectivityProvider`
  - `mobile/src/state/SessionContext.tsx` sekarang:
    - inisialisasi local DB + sync state saat boot
    - menulis snapshot sesi setelah login/register/refresh sukses
    - restore snapshot saat `/me` gagal karena network/server
    - tetap membersihkan sesi untuk kasus `401/403`
    - membersihkan snapshot saat logout

## 4) Catatan Risiko
- Offline boot tetap membutuhkan snapshot sesi lokal; user lama yang belum pernah sukses login/refresh setelah patch ini belum otomatis punya snapshot.
- Fase ini belum mengubah read path screen ke local DB, jadi offline usability penuh baru tercapai setelah fase 2 dan fase 3.

## 5) File yang Diubah
- `mobile/package.json`
- `mobile/package-lock.json`
- `mobile/App.tsx`
- `mobile/src/state/SessionContext.tsx`
- `mobile/src/features/localdb/database.ts`
- `mobile/src/features/localdb/appMetaStorage.ts`
- `mobile/src/features/session/sessionSnapshotStorage.ts`
- `mobile/src/features/sync/deviceIdentity.ts`
- `mobile/src/features/sync/syncStateStorage.ts`
- `mobile/src/features/connectivity/ConnectivityContext.tsx`
- `docs/MOBILE_OFFLINE_ONLINE_EXECUTION_PLAN.md`
- `docs/changes/CHG-20260321-mobile-offline-foundation-phase1.md`

## 6) Testing dan Validasi
- Automated verification:
  - `cd mobile && npm run typecheck` -> pass
- Manual verification:
  - Belum dilakukan di emulator/device untuk simulasi API mati dan restore snapshot.

## 7) Next Step
- Mulai `Phase 2 - Local Read Model`.
- Prioritas pertama:
  - tambah tabel lokal untuk `customers`, `services`, `orders`
  - implement `sync/pull` client + cursor handling
  - buat repository read lokal sebelum screen dipindahkan ke local-first
