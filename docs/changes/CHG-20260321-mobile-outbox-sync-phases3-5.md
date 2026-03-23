# CHG-20260321-mobile-outbox-sync-phases3-5

## Header
- Change ID: `CHG-20260321-mobile-outbox-sync-phases3-5`
- Status: `done`
- Date: `2026-03-21`
- Owner: `codex`
- Related Ticket: `MOB-OFFLINE-003`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Setelah fase 2 selesai, mobile masih hanya bisa membaca data secara local-first. Write path inti seperti buat order, tambah pembayaran, dan update status belum bisa berjalan offline lalu tersinkron aman.
- Solusi yang dilakukan: Menambahkan outbox mutation, invoice lease client, sync coordinator + provider, lalu memindahkan `ORDER_CREATE`, `ORDER_ADD_PAYMENT`, `ORDER_UPDATE_LAUNDRY_STATUS`, dan `ORDER_UPDATE_COURIER_STATUS` ke jalur optimistic local write + `sync/push`.
- Dampak bisnis/user: Kasir/operasional sekarang bisa tetap mencatat order, pembayaran manual, dan perubahan status saat koneksi putus. Saat koneksi kembali, perubahan akan dikirim ke server dan user bisa melihat mana yang pending atau ditolak.

## 2) Scope
- In scope:
  - schema SQLite baru untuk `outbox_mutations` dan `invoice_leases`
  - sync coordinator + connectivity bridge
  - offline-first write untuk create order, payment manual, status laundry, status kurir
  - badge global online/offline dan status sync per order
  - panel antrean sync + tombol `Sync Sekarang`
  - telemetry `unsyncedCount`, `rejectedCount`, `lastSuccessfulSyncAt`
- Out of scope:
  - UI assign courier baru di mobile
  - offline edit order umum via `PATCH /orders/{id}`
  - resolver konflik kompleks lintas entity non-core

## 3) Implementasi Teknis
- Schema mobile:
  - `mobile/src/features/localdb/database.ts`
    - tambah `outbox_mutations`
    - tambah `invoice_leases`
- Modul baru:
  - `mobile/src/features/connectivity/connectivityService.ts`
  - `mobile/src/features/sync/outboxRepository.ts`
  - `mobile/src/features/sync/invoiceLeaseRepository.ts`
  - `mobile/src/features/sync/syncCoordinator.ts`
  - `mobile/src/features/sync/SyncContext.tsx`
  - `mobile/src/features/sync/syncConflictMapper.ts`
  - `mobile/src/components/system/SyncStatusHud.tsx`
- Write path mobile yang sekarang offline-first:
  - `mobile/src/features/orders/orderApi.ts`
    - `createOrder`
    - `addOrderPayment`
    - `updateLaundryStatus`
    - `updateCourierStatus`
- Local helper tambahan:
  - `mobile/src/features/repositories/customersRepository.ts`
  - `mobile/src/features/repositories/servicesRepository.ts`
  - `mobile/src/features/repositories/ordersRepository.ts`
- UI observability:
  - `mobile/App.tsx`
  - `mobile/src/screens/app/OrdersTodayScreen.tsx`
  - `mobile/src/screens/app/OrderDetailScreen.tsx`
  - `mobile/src/screens/app/AccountHubScreen.tsx`

## 4) Patch Backend Terkait
- `app/Http/Controllers/Api/SyncController.php`
  - `ORDER_CREATE` sekarang menerima `payload.id` dari client
  - `ORDER_CREATE` explicit pickup-first sekarang selaras dengan endpoint `/orders` dan mengizinkan `items=[]` bila slot pickup valid
  - `ORDER_ADD_PAYMENT` sekarang juga menerima `payload.id` dari client
  - bug closure `sourceChannel` pada mutation payment ikut diperbaiki
- `docs/SYNC_API_CONTRACT.md`
  - diselaraskan dengan payload mutation yang benar-benar dipakai mobile/backend

## 5) Catatan Risiko
- Mutation `rejected` sekarang tetap terlihat di outbox/UI. Ini lebih aman untuk audit, tetapi berarti order lokal yang ditolak server bisa tetap terlihat sebagai item `sync gagal` sampai user menindaklanjuti.
- Cleanup otomatis untuk row `applied` di outbox belum ditambahkan. Aman untuk MVP, tetapi nanti perlu housekeeping jika volume transaksi tinggi.
- `ORDER_ASSIGN_COURIER` belum dipakai mobile walaupun backend sync sudah mendukung.

## 6) Testing dan Validasi
- Automated verification:
  - `cd mobile && npm run typecheck` -> pass
  - `php -l app/Http/Controllers/Api/SyncController.php` -> pass
- Manual verification:
  - Belum dijalankan di emulator/device untuk skenario:
    - create order offline -> online
    - payment offline -> online
    - status offline -> online
    - rejection case server

## 7) Next Step
- Fokus berikutnya bukan fase baru, tetapi hardening:
  - QA di emulator/device Android dan iOS
  - cleanup policy untuk outbox `applied`
  - pertimbangkan assignment courier mobile bila dibutuhkan operasional
