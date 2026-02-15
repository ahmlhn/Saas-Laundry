# SaaS Laundry Blueprint (Mobile + Web, Multi-Tenant, Multi-Outlet, Offline-First)
Version: 1.1
Status: LOCKED (perencanaan final sebelum implementasi)
Backend: Laravel 12 (API + domain + billing + messaging)
Clients:
- Mobile App: Android & iOS (cross-platform)
- Web App: Owner/Admin panel + opsional Kasir POS
Messaging: WhatsApp third-party, multi-provider (Premium/Pro)

---

## 1) Tujuan Produk
Membangun aplikasi laundry berbasis SaaS yang digunakan oleh banyak usaha laundry (tenant) dengan sistem berlangganan bulanan.
Fokus market: laundry menengah ke bawah.

Kunci diferensiasi:
- Multi outlet
- Customer global tenant (lintas outlet)
- Offline-first (mobile) + sinkronisasi aman
- Invoice cantik reset harian + range booking
- WA otomatis multi-provider untuk paket Premium/Pro

---

## 2) Definisi Entitas Utama
- Tenant: 1 usaha laundry (pelanggan SaaS).
- Outlet: cabang/gerai milik tenant.
- User: pegawai tenant (role-based), bisa akses 1 atau banyak outlet.
- Customer: pelanggan laundry (GLOBAL per tenant).
- Service: layanan laundry (tenant-level catalog) + outlet override.
- Order: transaksi laundry (terikat outlet, mengacu customer global).
- OrderItem: snapshot layanan/harga pada saat order.
- Payment: pembayaran (append-only).
- PickupTask / DeliveryTask: workflow antar-jemput.
- SyncMutation: event perubahan untuk sinkronisasi (idempotent).
- MessageQueue/Log: antrian & audit pengiriman WA.

---

## 3) Role & Area Kerja (Role-based Workspace)
Roles:
- Owner, Admin, Kasir, Pekerja, Kurir

Konsep:
- Setiap role punya “workspace” sendiri (menu/landing berbeda), supaya UI fokus pekerjaan.

Default landing:
- Owner -> Owner Dashboard (Agregat)
- Admin -> Admin Dashboard (Outlet)
- Kasir -> New Order
- Pekerja -> Production Queue
- Kurir -> Tasks Today

---

## 4) Multi Outlet & Kode Outlet
Kode outlet dipakai sebagai prefix invoice.

Aturan:
- Default kode outlet diatur Superadmin.
- Owner bisa mengubah kode outlet pada tenant (unik di tenant).
- Perubahan kode outlet hanya untuk invoice ke depan (invoice lama tetap).

Validasi disarankan:
- 2–8 karakter, uppercase alphanumeric.

---

## 5) Customer GLOBAL (lintas outlet)
Customer bersifat global per tenant agar sinkron antar outlet.

Aturan:
- Nomor WA/HP jadi kunci unik per tenant (dinormalisasi format 62xxxxxxxxxx).
- Offline create allowed -> server upsert/merge berdasarkan phone saat sync.

---

## 6) Layanan (Service Catalog) & Override Outlet
- services (tenant-level): master layanan.
- outlet_services (outlet-level): active/nonactive + price/SLA override.

Snapshot:
- OrderItem menyimpan snapshot nama/unit/harga untuk menjaga histori walau master berubah.

---

## 7) Antar Jemput
Fitur pickup & delivery:
- jadwal (tanggal + slot jam)
- alamat ringkas + patokan + maps_link (opsional)
- ongkir (zona/flat/manual)
- assign kurir

---

## 8) State Machine: Status Maju Semua (LOCKED)
Rule:
- Status hanya boleh maju (progression only). Tidak boleh mundur.

Pemisahan pipeline:
A) Courier pipeline:
- pickup_pending -> pickup_on_the_way -> picked_up -> at_outlet -> delivery_pending -> delivery_on_the_way -> delivered

B) Laundry pipeline:
- received -> washing -> drying -> ironing -> ready -> completed (opsional)

Pembayaran:
- append-only (tambah transaksi baru, bukan edit).

---

## 9) Offline-First & Sinkronisasi (Mobile) (LOCKED)
Tujuan:
- Mobile tetap jalan saat offline.
- Saat online, sync aman tanpa duplikasi.

Arsitektur:
- Local DB + Outbox Mutation
- Push mutations (idempotent mutation_id)
- Pull changes (cursor)
- Konflik:
  - status maju semua (server reject jika mundur)
  - pembayaran append-only

UX wajib:
- online/offline badge
- unsynced count
- sync manual
- log error ringkas

Catatan Web:
- Web default online-first.
- Opsional: Web Kasir mode PWA (offline terbatas) setelah MVP mobile stabil.

---

## 10) Invoice Cantik: Reset Harian (LOCKED)
Format:
{OUTLET_CODE}-{YYMMDD}-{COUNTER4}
Contoh: BL-260215-0042

Aturan:
- COUNTER 4 digit (0001–9999)
- Reset harian per outlet
- Tanggal invoice mengikuti created_at (timezone outlet, default Asia/Jakarta)
- Nomor boleh lompat sedikit (gap allowed)
- ID internal order tetap UUID

### Range Booking (wajib untuk offline + multi device)
- Server mengalokasikan range invoice per outlet per hari ke device (lease).
- Device booking untuk hari ini + besok.
- Jika range habis saat offline:
  - order tetap dibuat (UUID)
  - invoice display “pending invoice” sampai online.

---

## 11) Paket Berlangganan (Model Opsi A) (LOCKED)
Tier:
- Gratis, Standar, Premium, Pro

Retensi data:
- UNLIMITED untuk semua paket (LOCKED)

Limit utama order/bulan (LOCKED):
- Gratis: 200
- Standar: 1.000
- Premium: 5.000
- Pro: 20.000

WA otomatis:
- Hanya Premium & Pro (LOCKED)

Rekomendasi limit outlet & user (bisa disesuaikan belakangan):
- Gratis: 1 outlet, 2 user
- Standar: 1 outlet, 5 user
- Premium: 3 outlet, 15 user
- Pro: 10 outlet, 50 user

Quota policy saat limit habis:
- Block create order baru
- Order existing tetap bisa diselesaikan (update status & payment)

---

## 12) WhatsApp Otomatis Multi-Provider (Third Party) (LOCKED)
Prinsip:
- Provider-agnostic (multi-provider)
- Queue-based + retry/backoff
- Message log (delivered/failed)
- Idempotent per event per invoice/code

Event WA otomatis (Premium/Pro):
1) WA_PICKUP_CONFIRM
2) WA_PICKUP_OTW
3) WA_LAUNDRY_READY
4) WA_DELIVERY_OTW
5) WA_ORDER_DONE

Catatan:
- WA event dipicu server-side saat mutation applied (bukan dari client).

---

## 13) Template WhatsApp Default (Plain Text) (LOCKED)
Fallback global:
- customer_name => "Pelanggan"
- invoice_no => order_code (kalau invoice pending)
- courier_name => "kurir kami"
- order_summary => "Laundry"
- paid => "Rp 0"
- due => "Rp 0"
- due_amount => 0 jika null
- maps_link/courier_phone/pickup_slot optional: tampil hanya jika ada & valid

Template ringkas:
- WA_PICKUP_CONFIRM: konfirmasi jadwal pickup + alamat (+ maps jika ada)
- WA_PICKUP_OTW: kurir OTW jemput (+ slot + kontak kurir opsional)
- WA_LAUNDRY_READY: laundry selesai + ringkasan + total/paid/due
- WA_DELIVERY_OTW: kurir OTW antar + COD jika due_amount>0
- WA_ORDER_DONE: order selesai + total + metode bayar opsional

---

## 14) Template Rendering Rules (Line-Conditional Engine) (LOCKED)
Condition DSL:
- exists, notExists
- eq, ne, gt, gte, lt, lte
- and, or, not
- isValidUrl
- isTrue

Pipeline:
1) resolve template (outlet override -> tenant override -> default)
2) merge vars
3) apply fallback
4) normalize string (trim, remove control chars)
5) preflight validation (required vars)
6) render line-by-line (condition)
7) strip empty lines
8) enforce max length (remove optional blocks dulu)
9) output provider-agnostic payload + idempotency_key

Idempotency key:
{tenant_id}:{outlet_id}:{invoice_or_code}:{template_id}

---

## 15) Role-based Screen List (MVP)
Core:
- Splash, Login, Select Outlet (if needed), Sync Status, Profile

Kasir:
- New Order, Customer Search/Create, Order Success, Orders Today, Order Detail, Add Payment, Receivables

Pekerja:
- Production Queue, Order Production Detail, Next Status

Kurir:
- Tasks Today, Pickup Detail, Delivery Detail

Admin:
- Dashboard Outlet, Orders List, Admin Order Detail, Assign Courier, Shipping Zones, Outlet Service Settings, Customers

Owner:
- Dashboard Agregat, Outlet Summary, Outlets CRUD (incl code), Users CRUD+assign outlet, Billing/Quota view

WhatsApp (Premium/Pro):
- Provider Settings, Template Manager, Message Log

---

## 16) Navigation Map (MVP Guards)
Guards:
- AUTH, OUTLET_CTX, PLAN_WA, PLAN_ORDER_QUOTA, SYNC_AWARE

Default landings:
- Owner: /owner/dashboard
- Admin: /admin/dashboard
- Kasir: /cashier/new-order
- Pekerja: /worker/queue
- Kurir: /courier/tasks

---

## 17) Data Contract Sync (MVP Summary)
Sync endpoints:
- POST /api/sync/push
- POST /api/sync/pull
- POST /api/invoices/range/claim

Push:
- device_id + mutations[]
- mutation_id idempotent
- response: ack/rejected + quota

Pull:
- cursor-based changes (upsert/delete)
- include quota in response

Error codes:
- QUOTA_EXCEEDED, OUTLET_ACCESS_DENIED, STATUS_NOT_FORWARD, INVALID_TRANSITION, VALIDATION_FAILED, INVOICE_RANGE_INVALID, PHONE_INVALID

---

## 18) Web App Plan (NEW: LOCKED ADDITION)
Web app dibuat sebagai client resmi selain mobile:
- Web fokus: Owner + Admin (setup, laporan, kontrol operasional, WA settings/log, user/outlet mgmt)
- Web Kasir POS: opsional (tahap setelah MVP mobile stabil)
- Kurir: mobile priority
- Offline di web: online-first; PWA kasir offline terbatas opsional

Rekomendasi arsitektur web:
- Laravel + Inertia (Vue/React) agar RBAC & auth satu pintu, UI dashboard nyaman.

Multi-tenant routing (diputuskan nanti):
- subdomain per tenant atau path-based.

---
END OF DOCUMENT
