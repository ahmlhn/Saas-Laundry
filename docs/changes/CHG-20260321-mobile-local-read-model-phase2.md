# CHG-20260321-mobile-local-read-model-phase2

## Header
- Change ID: `CHG-20260321-mobile-local-read-model-phase2`
- Status: `done`
- Date: `2026-03-21`
- Owner: `codex`
- Related Ticket: `MOB-OFFLINE-002`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Fase 1 sudah menyiapkan fondasi offline, tetapi data inti mobile masih dibaca langsung dari API live sehingga screen order/customer/service belum benar-benar siap dibuka offline.
- Solusi yang dilakukan: Menambahkan local read model berbasis SQLite untuk `customers`, `services`, `orders`, `order_items`, dan `order_payments`, lalu mengubah wrapper API mobile menjadi `local-first` dengan fallback ke server dan refresh sinkronisasi.
- Dampak bisnis/user: Daftar pelanggan, layanan, dan order yang sudah pernah dimuat sekarang bisa dibaca lagi saat offline, sementara flow layar lama tetap kompatibel karena kontrak fungsi API tidak diubah.

## 2) Scope
- In scope:
  - Menambah schema fase 2 ke local DB mobile
  - Menambah repository lokal untuk customers/services/orders
  - Mengubah wrapper API mobile menjadi `local-first`
  - Menambah client `sync/pull` dasar dan cursor persistence
  - Menyimpan hasil write online kembali ke local DB agar state lokal tidak tertinggal
- Out of scope:
  - Outbox mutation offline
  - Offline create order end-to-end
  - Conflict UI
  - Full backend incremental sync untuk semua entity master data

## 3) Implementasi Teknis
- Schema lokal baru:
  - `customers`
  - `services`
  - `orders`
  - `order_items`
  - `order_payments`
- Repository baru:
  - `mobile/src/features/repositories/customersRepository.ts`
  - `mobile/src/features/repositories/servicesRepository.ts`
  - `mobile/src/features/repositories/ordersRepository.ts`
- Wrapper API yang sekarang membaca local DB dulu:
  - `mobile/src/features/customers/customerApi.ts`
  - `mobile/src/features/services/serviceApi.ts`
  - `mobile/src/features/orders/orderApi.ts`
- Sync pull client:
  - `mobile/src/features/sync/syncApi.ts`
  - memakai `device_id`, `last_cursor`, dan `last_successful_sync_at` dari fase 1

## 4) Catatan Risiko
- Backend `sync/pull` saat ini belum merekam semua perubahan `customer` dan `service` dari flow online biasa, karena `SyncChangeRecorder` baru dipakai di `SyncController`.
- Karena itu incremental sync fase 2 masih hybrid:
  - broad refresh dari endpoint domain existing
  - incremental pull hanya untuk entity yang memang sudah direkam backend
- Local order detail offline paling kuat untuk order yang pernah dibuka detail-nya atau pernah tersentuh oleh refresh/detail response; ringkasan order tetap tersedia dari list snapshot.

## 5) File yang Diubah
- `mobile/src/features/localdb/database.ts`
- `mobile/src/features/repositories/repositoryShared.ts`
- `mobile/src/features/repositories/customersRepository.ts`
- `mobile/src/features/repositories/servicesRepository.ts`
- `mobile/src/features/repositories/ordersRepository.ts`
- `mobile/src/features/sync/syncApi.ts`
- `mobile/src/features/customers/customerApi.ts`
- `mobile/src/features/services/serviceApi.ts`
- `mobile/src/features/orders/orderApi.ts`
- `docs/MOBILE_OFFLINE_ONLINE_EXECUTION_PLAN.md`
- `docs/changes/CHG-20260321-mobile-local-read-model-phase2.md`

## 6) Testing dan Validasi
- Automated verification:
  - `cd mobile && npm run typecheck` -> pass
- Manual verification:
  - Belum dijalankan di emulator/device untuk skenario refresh online lalu reopen offline.

## 7) Next Step
- Mulai `Phase 3 - Outbox ORDER_CREATE`.
- Prioritas teknis:
  - tabel `outbox_mutations`
  - payload builder `ORDER_CREATE`
  - local optimistic order create
  - apply `ack/effects/id_map`
  - invoice lease manager
