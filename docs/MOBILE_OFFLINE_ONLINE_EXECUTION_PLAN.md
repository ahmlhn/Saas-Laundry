# Mobile Offline/Online Execution Plan

Status: `completed`
Current focus: `completed`
Date: `2026-03-21`
Owner: `codex`

## 1) Tujuan Dokumen

Dokumen ini adalah catatan kerja repo-spesifik agar implementasi mobile offline/online bisa dikerjakan bertahap, tidak sekaligus, dan tidak mengulang analisis dari nol.

Target produk yang dikunci:
- Mobile: `offline-first`
- Web: `online-first`
- Backend: tetap `source of truth`

## 2) Kondisi Repo Saat Ini

Backend sudah punya fondasi sync:
- `POST /api/sync/push` di `routes/api.php`
- `POST /api/sync/pull` di `routes/api.php`
- `POST /api/invoices/range/claim` di `routes/api.php`
- Backend sync saat ini sudah mendukung mutation:
  - `ORDER_CREATE`
  - `ORDER_ADD_PAYMENT`
  - `ORDER_UPDATE_LAUNDRY_STATUS`
  - `ORDER_UPDATE_COURIER_STATUS`
  - `ORDER_ASSIGN_COURIER`
- `ORDER_CREATE` via sync sudah bisa `updateOrCreate` customer berdasarkan `phone_normalized`, jadi customer offline bisa ikut lewat payload order create walaupun belum ada mutation `CUSTOMER_UPSERT` terpisah.

Mobile saat ini belum offline-first:
- `mobile/src/features/orders/orderApi.ts` masih menulis langsung ke endpoint domain (`/orders`, `/payments`, `/status/...`).
- `mobile/src/lib/queryCache.ts` hanya cache in-memory, tidak persisten.
- `mobile/src/state/SessionContext.tsx` masih bootstrap dengan `/me`, dan saat request gagal sesi bisa dianggap tidak valid. Ini belum aman untuk offline boot.
- Cache lokal yang sudah ada baru parsial, misalnya `mobile/src/features/customers/customerDeviceCache.ts`.
- Belum ada:
  - local DB persisten
  - outbox mutation
  - sync coordinator
  - network listener
  - sync status store
  - invoice lease client manager

## 3) Keputusan yang Dikunci

Keputusan ini jangan diubah tanpa alasan kuat:

1. Mobile tidak boleh langsung "full offline semua fitur" dalam satu batch.
2. Fase pertama harus fokus ke fondasi, bukan langsung refactor semua screen.
3. Semua write penting di mobile pada akhirnya harus lewat `outbox + sync/push`, bukan direct write ke endpoint domain biasa.
4. Read path mobile harus bergeser ke `local-first`, lalu refresh dari server saat online.
5. QRIS, WhatsApp, billing/subscription, upload file, dan platform admin tetap `online-only` pada MVP offline.
6. Web tidak ikut dibawa ke offline sekarang.
7. Server tetap memutuskan hasil akhir conflict.

## 4) Scope MVP Offline

### In scope
- Buka aplikasi dengan sesi yang sudah pernah login walau sedang offline
- Menyimpan state outlet terpilih
- Menampilkan master data yang sudah pernah tersinkron
- Menampilkan order list/detail dari local DB
- Membuat order saat offline
- Menambah payment manual/cash saat offline
- Update laundry status dan courier status saat offline
- Sync background saat koneksi kembali
- Invoice range claim untuk mendukung create order offline multi-device
- Menampilkan status pending sync / rejected sync minimum

### Out of scope
- Login pertama saat offline
- Register saat offline
- QRIS saat offline
- WhatsApp send saat offline
- Laporan dan billing offline
- Admin/platform offline
- PWA web offline
- Conflict resolver kompleks lintas entity non-core

## 5) Arsitektur yang Ditargetkan

Arsitektur target mobile:
- Local DB
- Repository layer
- Outbox mutations
- Sync coordinator
- Connectivity listener
- Sync status store
- Invoice lease manager

Alur target:
1. Screen baca data dari repository lokal.
2. Saat online, repository boleh refresh dari server lalu update local DB.
3. Saat user menulis data, client simpan mutation ke outbox dan update local DB secara optimistik.
4. Sync coordinator menjalankan `push -> pull`.
5. Server mengembalikan `ack/rejected/effects`.
6. Client menandai mutation selesai atau perlu intervensi.

## 6) Modul Baru yang Disarankan

Struktur baru yang disarankan:

- `mobile/src/features/localdb/`
  - `database.ts`
  - `schema.ts`
  - `migrations.ts`
- `mobile/src/features/sync/`
  - `deviceIdentity.ts`
  - `syncApi.ts`
  - `syncCoordinator.ts`
  - `syncStateStorage.ts`
  - `outboxRepository.ts`
  - `invoiceLeaseRepository.ts`
  - `syncConflictMapper.ts`
- `mobile/src/features/connectivity/`
  - `connectivityService.ts`
- `mobile/src/features/repositories/`
  - `ordersRepository.ts`
  - `customersRepository.ts`
  - `servicesRepository.ts`

Catatan:
- Local DB yang direkomendasikan: SQLite.
- Jika memilih library baru, lakukan di fase 1 saja dan jangan dicampur dengan refactor screen besar.

## 7) Fase Implementasi

### Phase 1 - Foundation
Tujuan:
- menyiapkan local DB
- menyiapkan connectivity state
- menyiapkan device identity dan sync state persisten
- membuat boot session tetap aman saat offline

Checklist:
- [x] Tambah local DB persisten untuk mobile
- [x] Tambah penyimpanan `device_id`
- [x] Tambah penyimpanan `last_sync_cursor`
- [x] Tambah penyimpanan `sync status` dan `unsynced count`
- [x] Tambah connectivity listener
- [x] Tambah session snapshot lokal agar app bisa boot offline
- [x] Ubah `SessionContext` agar tidak auto-clearing sesi saat `/me` gagal karena network
- [x] Tambah status global online/offline yang bisa dipakai UI

Acceptance gate:
- App dengan sesi lama bisa dibuka saat API mati
- Outlet terakhir tetap terpilih
- Tidak ada screen transaksi yang crash karena state sesi kosong
- `npm run typecheck` lulus

Status implementasi `2026-03-21`:
- Selesai.
- Dependency baru yang dipakai fase 1:
  - `expo-sqlite`
  - `@react-native-community/netinfo`
- Modul baru yang sudah ada:
  - `mobile/src/features/localdb/database.ts`
  - `mobile/src/features/localdb/appMetaStorage.ts`
  - `mobile/src/features/session/sessionSnapshotStorage.ts`
  - `mobile/src/features/sync/deviceIdentity.ts`
  - `mobile/src/features/sync/syncStateStorage.ts`
  - `mobile/src/features/connectivity/ConnectivityContext.tsx`
- Integrasi fase 1 yang sudah masuk:
  - `mobile/App.tsx` sudah memasang `ConnectivityProvider`
  - `mobile/src/state/SessionContext.tsx` sekarang:
    - inisialisasi local DB + sync state saat boot
    - menyimpan session snapshot setelah login/refresh sukses
    - membedakan `401/403` vs gangguan network/server
    - fallback ke snapshot saat `/me` gagal tetapi sesi belum invalid
    - tidak lagi auto-clearing sesi hanya karena API tidak reachable

Catatan fase 1:
- Offline boot bergantung pada snapshot sesi lokal.
- User lama yang sudah punya token tetapi belum pernah sukses login/refresh setelah patch ini belum otomatis punya snapshot.
- Karena itu, mintakan minimal satu boot online sukses setelah update sebelum mengandalkan offline mode penuh.

### Phase 2 - Local Read Model
Tujuan:
- read path bergeser ke local-first untuk data inti

Checklist:
- [x] Sinkron awal `customers` ke local DB
- [x] Sinkron awal `services` ke local DB
- [x] Sinkron awal `orders` ke local DB
- [x] Tambah repository lokal untuk read customers/services/orders
- [x] Ubah screen inti agar membaca dari repository, bukan API langsung
- [x] Tambah `sync/pull` pagination + cursor handling
- [x] Tambah refresh online manual

Acceptance gate:
- Customers/services/orders tetap bisa dibaca setelah app dibuka offline
- Sync pull bisa mengisi local DB tanpa merusak flow lama
- `npm run typecheck` lulus

Status implementasi `2026-03-21`:
- Selesai dengan catatan backend gap.
- Repository lokal yang sudah ada:
  - `mobile/src/features/repositories/customersRepository.ts`
  - `mobile/src/features/repositories/servicesRepository.ts`
  - `mobile/src/features/repositories/ordersRepository.ts`
- Wrapper API yang sekarang `local-first`:
  - `mobile/src/features/customers/customerApi.ts`
  - `mobile/src/features/services/serviceApi.ts`
  - `mobile/src/features/orders/orderApi.ts`
- Sync pull client dasar sudah ada di:
  - `mobile/src/features/sync/syncApi.ts`
- Incremental sync yang benar-benar terpasang:
  - `order`
  - `order_item`
  - `payment`
  - `customer` jika perubahan customer datang dari jalur sync order create

Catatan fase 2:
- `sync/pull` backend saat ini belum menjadi sumber lengkap untuk perubahan `customer` dan `service` dari flow online biasa, karena `SyncChangeRecorder` baru dipakai di `SyncController`.
- Karena itu, local read model fase 2 mengandalkan dua jalur:
  - initial/broad refresh dari endpoint existing (`/customers`, `/services`, `/orders`)
  - incremental pull dari `/sync/pull` untuk entity yang memang sudah direkam backend saat ini
- Ini cukup untuk memulai offline read model tanpa mengubah kontrak backend sekarang, tetapi phase 3 ke atas perlu mengingat batasan ini.

### Phase 3 - Outbox ORDER_CREATE
Tujuan:
- create order bisa berjalan offline

Checklist:
- [x] Desain tabel `outbox_mutations`
- [x] Tambah client payload builder untuk `ORDER_CREATE`
- [x] Simpan order draft/final ke local DB lebih dulu
- [x] Kirim `ORDER_CREATE` lewat `/api/sync/push`
- [x] Tambah apply `ack/effects/id_map`
- [x] Tambah invoice lease manager dan refresh range saat online
- [x] Tampilkan badge `belum sinkron` pada order lokal

Acceptance gate:
- Order bisa dibuat saat offline
- Setelah online, order terkirim ke server tanpa duplikasi
- Invoice number/assignment aman sesuai lease
- `npm run typecheck` lulus

Status implementasi `2026-03-21`:
- Selesai.
- Local DB fase 3 menambah:
  - `outbox_mutations`
  - `invoice_leases`
- Modul baru fase 3:
  - `mobile/src/features/sync/outboxRepository.ts`
  - `mobile/src/features/sync/invoiceLeaseRepository.ts`
  - `mobile/src/features/sync/syncCoordinator.ts`
- `createOrder()` mobile sekarang:
  - membuat `UUID` order di client
  - menyimpan order optimistik ke SQLite
  - mengantrikan `ORDER_CREATE`
  - mencoba sync langsung bila online
- Invoice lease client sekarang:
  - consume invoice dari lease lokal bila tersedia
  - claim range untuk hari ini + besok saat online bila buffer menipis

Catatan fase 3:
- Backend sync dikoreksi agar `ORDER_CREATE` menerima `payload.id` dari client dan sinkron dengan flow pickup-first mobile.
- `ORDER_CREATE` explicit pickup sekarang mengizinkan `items=[]` selama slot pickup ada, sama seperti endpoint domain `/orders`.

### Phase 4 - Outbox Payment & Status
Tujuan:
- payment/status core juga masuk jalur offline-first

Checklist:
- [x] Tambah `ORDER_ADD_PAYMENT`
- [x] Tambah `ORDER_UPDATE_LAUNDRY_STATUS`
- [x] Tambah `ORDER_UPDATE_COURIER_STATUS`
- [ ] Tambah `ORDER_ASSIGN_COURIER` jika memang dipakai mobile
- [x] Update detail order agar membaca state lokal + server merge

Acceptance gate:
- Payment manual dan status update bisa dicatat offline
- Setelah sync, server state dan local state konsisten
- `npm run typecheck` lulus

Status implementasi `2026-03-21`:
- Selesai untuk scope mobile yang benar-benar dipakai saat ini.
- `addOrderPayment()`, `updateLaundryStatus()`, dan `updateCourierStatus()` sekarang:
  - menulis optimistik ke local DB
  - mengantrikan mutation sync
  - mencoba sync langsung bila online
- Bila server menolak mutation:
  - outbox ditandai `rejected`
  - detail order direfresh lagi dari server saat memungkinkan
  - UI order menampilkan badge failure/pending

Catatan fase 4:
- `ORDER_ASSIGN_COURIER` backend sudah ada, tetapi mobile saat ini belum punya UI assignment kurir aktif. Karena itu checklist item ini sengaja tetap tidak dicentang.

### Phase 5 - UX Conflict & Observability
Tujuan:
- membuat perilaku offline/online bisa dipahami user dan aman dioperasikan

Checklist:
- [x] Badge online/offline global
- [x] Badge `pending sync` / `sync gagal`
- [x] Tombol `sync sekarang`
- [x] Queue screen ringan atau panel pending mutations
- [x] Mapping `reason_code` ke pesan yang bisa dipahami user
- [x] Telemetry minimum: last sync time, unsynced count, rejected count

Acceptance gate:
- User bisa tahu mana data yang belum sinkron
- Rejected mutation tidak diam-diam hilang
- `npm run typecheck` lulus

Status implementasi `2026-03-21`:
- Selesai.
- UX fase 5 yang sudah ada:
  - badge global `Online/Offline/Belum Sinkron/Sync Gagal`
  - badge status sync per order di daftar dan detail
  - panel antrean sync di `AccountHub`
  - tombol `Sync Sekarang`
  - telemetry tersimpan: `lastSuccessfulSyncAt`, `unsyncedCount`, `rejectedCount`
- Mapper reason code ada di:
  - `mobile/src/features/sync/syncConflictMapper.ts`

## 8) Urutan File yang Paling Layak Disentuh

Urutan kerja yang disarankan:
1. `mobile/src/state/SessionContext.tsx`
2. Tambah modul local DB dan sync state
3. Tambah connectivity service
4. Tambah repository layer
5. Baru sentuh screen inti:
   - `OrderCreateScreen`
   - `OrdersTodayScreen`
   - `OrderDetailScreen`
6. Setelah itu baru refactor `orderApi.ts`

Catatan penting:
- Jangan langsung mengganti semua pemanggilan API di seluruh app.
- Pertahankan kompatibilitas screen lama sejauh mungkin.
- Gunakan adapter/repository agar migrasi bertahap.

## 9) Risiko yang Harus Diingat AI

1. `SessionContext` sekarang menganggap kegagalan `/me` bisa berarti sesi invalid.
   Ini harus dibedakan antara `network error` vs `401/403`.

2. Backend sync saat ini fokus di mutation order core.
   Jangan merencanakan offline standalone customer edit/create sebagai fase awal, kecuali dibawa melalui payload `ORDER_CREATE` atau backend ditambah mutation baru.

3. Query cache sekarang non-persisten.
   Jangan menganggap cache lama cukup untuk offline mode.

4. QRIS dan WA sangat sensitif terhadap idempotency dan koneksi.
   Jangan dibawa ke offline phase awal.

5. Conflict handling harus minimal tapi nyata.
   Mutation rejected harus tetap terlihat di UI.

## 10) Rules Saat AI Mengerjakan Bertahap

Aturan kerja untuk AI berikutnya:

1. Kerjakan per fase, jangan lompat.
2. Setelah tiap fase:
   - jalankan `cd mobile && npm run typecheck`
   - update checklist di dokumen ini
   - jika ada perubahan arsitektur penting, tulis change note di `docs/changes/`
3. Jangan mengubah kontrak backend sync kecuali memang ada mismatch yang terverifikasi.
4. Jika perlu dependency baru, tambahkan hanya pada fase 1.
5. Jangan membongkar UI besar-besaran pada fase fondasi.
6. Jika menemui blocker backend, catat blocker itu eksplisit sebelum lanjut.

## 11) First Execution Target

Target eksekusi pertama yang paling aman:
- selesaikan `Phase 1 - Foundation`

Deliverable minimum phase 1:
- app tetap bisa boot dengan sesi lama saat offline
- ada `device_id`
- ada `sync state`
- ada connectivity status
- ada local DB kosong siap dipakai fase berikutnya

Jangan mulai dari create order offline sebelum foundation ini selesai.
