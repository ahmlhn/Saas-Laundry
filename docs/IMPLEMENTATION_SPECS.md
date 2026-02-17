# Implementation Specs (Merged) — SaaS Laundry
Version: 1.1
Status: READY-FOR-EXECUTION-PLAN (mengacu ke SAAS_LAUNDRY_BLUEPRINT.md yang LOCKED)
Backend: Laravel 12
Clients:
- Mobile (Android/iOS): offline-first + sync
- Web: online-first (PWA kasir offline terbatas opsional)

Isi file ini menggabungkan:
1) State Machine Transitions
2) Invoice Range Booking Spec
3) WhatsApp Messaging Spec (Multi-provider)
4) RBAC Permissions Matrix
5) Web MVP Scope
6) DB Schema High Level (ERD ringkas)

---

## 1) State Machine Transitions (LOCKED RULE: “Status maju semua”)

### 1.1 Pipeline: Courier
Status:
- pickup_pending
- pickup_on_the_way
- picked_up
- at_outlet
- delivery_pending
- delivery_on_the_way
- delivered

Allowed transitions (maju saja):

| Current Status       | Allowed Next Status        | Who can update | WA Trigger (Premium/Pro) | Notes |
|---------------------|----------------------------|----------------|--------------------------|------|
| pickup_pending      | pickup_on_the_way          | Kurir          | WA_PICKUP_OTW            | Kurir mulai OTW jemput |
| pickup_on_the_way   | picked_up                  | Kurir          | -                        | Barang sudah diambil |
| picked_up           | at_outlet                  | Kurir / Admin  | -                        | Sampai outlet (Admin boleh koreksi jika perlu) |
| at_outlet           | delivery_pending           | Admin          | -                        | Siap antri antar (biasanya setelah ready) |
| delivery_pending    | delivery_on_the_way        | Kurir          | WA_DELIVERY_OTW          | Kurir mulai OTW antar |
| delivery_on_the_way | delivered                  | Kurir          | WA_ORDER_DONE (opsional policy) | Selesai antar |

Catatan:
- Courier pipeline hanya aktif jika `is_pickup_delivery = true`.
- Jika order bukan antar-jemput, courier_status boleh null atau langsung “delivered” tidak digunakan.

### 1.2 Pipeline: Laundry
Status:
- received
- washing
- drying
- ironing
- ready
- completed (opsional; kalau mau unified finish)

Allowed transitions:

| Current Status | Allowed Next Status | Who can update     | WA Trigger (Premium/Pro) | Notes |
|---------------|---------------------|--------------------|--------------------------|------|
| received      | washing             | Pekerja / Admin    | -                        | Mulai proses |
| washing       | drying              | Pekerja / Admin    | -                        | |
| drying        | ironing             | Pekerja / Admin    | -                        | |
| ironing       | ready               | Pekerja / Admin    | WA_LAUNDRY_READY         | Laundry selesai |
| ready         | completed           | Admin / Kasir      | WA_ORDER_DONE (policy)   | Opsional finalization |

Catatan:
- Kasir tidak mengubah status produksi kecuali “received” saat order dibuat (implisit).
- Server wajib validasi transition table. Jika tidak sesuai -> reject: `INVALID_TRANSITION` atau `STATUS_NOT_FORWARD`.

### 1.3 Cross-pipeline constraints
- Jika `laundry_status != ready`, maka `courier_status` boleh tetap pada pickup/at_outlet/delivery_pending.
- `delivery_pending` biasanya hanya boleh diset jika `laundry_status = ready` (rule disarankan).
- Setelah `delivered`, `laundry_status` seharusnya minimal `ready` (atau `completed`). Jika belum, itu anomaly—server boleh warning/audit.

### 1.4 WA Trigger Policy (disarankan)
- WA_PICKUP_CONFIRM: saat ORDER_CREATE (is_pickup_delivery=true)
- WA_PICKUP_OTW: saat courier -> pickup_on_the_way
- WA_LAUNDRY_READY: saat laundry -> ready
- WA_DELIVERY_OTW: saat courier -> delivery_on_the_way
- WA_ORDER_DONE: saat courier -> delivered (untuk antar-jemput) ATAU saat laundry -> completed (untuk non antar-jemput)

WA hanya untuk Premium/Pro dan server-side (bukan client).

---

## 2) Invoice Range Booking Spec (Reset Harian + Offline)

### 2.1 Format invoice (LOCKED)
{OUTLET_CODE}-{YYMMDD}-{COUNTER4}
Contoh: BL-260215-0042
- COUNTER4: 0001–9999
- Reset harian per outlet
- Tanggal berdasarkan created_at order (timezone outlet, default Asia/Jakarta)
- Gap allowed (nomor boleh lompat)

### 2.2 Range lease model
Tujuan: mencegah bentrok multi device saat offline.

Konsep:
- Per outlet per tanggal, server mengalokasikan range counter ke device:
  - lease_id, date, from, to, prefix, expires_at
- Device memakai counter lokal dari lease untuk membentuk invoice_no.
- Jika lease habis saat offline -> invoice pending.

### 2.3 Claim API behavior (ringkas)
- Device request range untuk:
  - hari ini + besok (default)
- Server:
  - allocate counter range non-overlap
  - simpan lease (outlet_id+date+range+device_id)
  - return prefix + from/to

### 2.4 Validasi server saat menerima ORDER_CREATE
Jika client mengirim invoice_no:
- Server parse invoice_no -> outlet_code + date + counter
- Pastikan:
  - outlet_code cocok outlet
  - date cocok created_at (atau aturan toleransi jika created_at beda sedikit: disarankan harus sama)
  - counter berada dalam lease range milik device_id dan belum dipakai
Jika tidak valid -> reject `INVOICE_RANGE_INVALID` atau server override dengan invoice baru (pilih kebijakan; disarankan reject agar konsisten).

Jika client invoice pending (invoice_no null):
- Server assign invoice saat online jika counter tersedia.
- Jika server assign invoice_no:
  - return effects.invoice_no_assigned di push response.

### 2.5 Pending invoice policy
- Jika pending: gunakan order_code sebagai identitas user-facing sementara.
- Tidak wajib kirim WA “nomor final” setelah invoice assign (kecuali nanti ingin event khusus).

### 2.6 Edge cases
- Cancel order -> gap accepted.
- Device reinstall -> device_id baru; lease lama bisa expire.
- Counter overflow (>9999):
  - disarankan: blok create order untuk outlet+date tersebut dan minta admin lakukan tindakan (rare).
  - atau gunakan fallback “pending invoice” untuk order berikutnya sampai tanggal berganti.

---

## 3) WhatsApp Messaging Spec (Multi-Provider, Premium/Pro)

### 3.1 Prinsip (LOCKED)
- Multi-provider, third party
- Provider-agnostic core
- Queue-based send + retry/backoff
- Message log (delivered/failed)
- Idempotency: 1 event per template per invoice/code

### 3.2 Provider interface (konsep)
Setiap provider driver minimal punya:
- sendText(to_phone, text, metadata) -> provider_message_id / error
- healthCheck() -> ok/error
- normalizeError(err) -> {is_transient, reason_code, message}

### 3.3 Template definition model (line-conditional)
Template disimpan sebagai:
- template_id (WA_PICKUP_CONFIRM, ...)
- version
- required_vars_all
- required_vars_any (invoice_no / order_code)
- body_lines[]:
  - text
  - condition (optional DSL)

Condition DSL allowed:
- exists, notExists
- eq, ne, gt, gte, lt, lte
- and, or, not
- isValidUrl
- isTrue

Rendering pipeline (LOCKED):
1) resolve template (outlet override -> tenant override -> default)
2) merge vars
3) apply fallbacks
4) normalize string
5) preflight validation
6) render line-by-line (condition)
7) strip empty lines
8) enforce max length (drop optional lines first)
9) output payload + idempotency_key

Idempotency key:
{tenant_id}:{outlet_id}:{invoice_or_code}:{template_id}

### 3.4 Events & required vars (summary)
Event -> template_id:
- OrderCreated (pickup) -> WA_PICKUP_CONFIRM
- Courier pickup_on_the_way -> WA_PICKUP_OTW
- Laundry ready -> WA_LAUNDRY_READY
- Courier delivery_on_the_way -> WA_DELIVERY_OTW
- Delivered / Completed -> WA_ORDER_DONE

Core required:
- brand_name, customer_name (fallback), to_phone, invoice_no||order_code

Optional:
- courier_name/phone, maps_link, pickup_slot, address_short, totals

### 3.5 Retry policy (recommended)
- transient errors (rate limit, network): retry with exponential backoff
- permanent errors (invalid phone): stop
- max attempts: 5 (example)
- store last_error_code/message in message_log

### 3.6 Plan enforcement
- Only Premium/Pro:
  - WA settings page enabled
  - WA events enqueue enabled
- When downgrade:
  - optional cancel pending queue (policy)

---

## 4) RBAC Permissions Matrix (MVP)

Roles:
- Owner, Admin, Kasir, Pekerja, Kurir
(Platform Superadmin terpisah: mengelola SaaS global)

Legend:
- ✅ allowed
- ⚠️ allowed terbatas
- ❌ not allowed

### 4.1 Permissions (Actions)
| Action | Owner | Admin | Kasir | Pekerja | Kurir | Notes |
|---|---:|---:|---:|---:|---:|---|
| View dashboard (agregat) | ✅ | ⚠️ | ❌ | ❌ | ❌ | Admin: outlet saja |
| View orders list | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Pekerja/Kurir hanya terkait workflow mereka |
| Create order | ⚠️ | ⚠️ | ✅ | ❌ | ❌ | Owner/Admin opsional, Kasir utama; cek quota |
| Edit order notes | ✅ | ✅ | ⚠️ | ⚠️ | ❌ | Kasir/Pekerja terbatas |
| Add payment (append-only) | ✅ | ✅ | ✅ | ❌ | ❌ | |
| Edit/delete payment | ❌ | ❌ | ❌ | ❌ | ❌ | MVP: append-only |
| Update laundry status (received->ready) | ⚠️ | ✅ | ❌ | ✅ | ❌ | Kasir tidak produksi; Admin bisa koreksi |
| Update courier status (pickup/delivery) | ⚠️ | ✅ | ❌ | ❌ | ✅ | Admin koreksi terbatas jika perlu |
| Assign courier | ✅ | ✅ | ❌ | ❌ | ❌ | |
| Edit pickup/delivery schedule | ✅ | ✅ | ⚠️ | ❌ | ❌ | Kasir hanya sebelum pickup OTW |
| Edit shipping fee | ✅ | ✅ | ⚠️ | ❌ | ❌ | |
| Manage services (tenant catalog) | ✅ | ⚠️ | ❌ | ❌ | ❌ | Admin bisa edit jika diberi |
| Manage outlet service overrides | ✅ | ✅ | ❌ | ❌ | ❌ | |
| Manage customers (tenant) | ✅ | ✅ | ✅ | ❌ | ❌ | Kasir create/update dasar |
| Manage users + assign outlets | ✅ | ⚠️ | ❌ | ❌ | ❌ | Admin opsional dibatasi |
| Manage outlets + outlet code | ✅ | ⚠️ | ❌ | ❌ | ❌ | Owner utama |
| View billing/quota | ✅ | ⚠️ | ❌ | ❌ | ❌ | Admin boleh lihat sisa kuota outlet/tenant |
| WhatsApp settings & templates | ✅ | ✅ | ❌ | ❌ | ❌ | Premium/Pro only |
| View WA message logs | ✅ | ✅ | ❌ | ❌ | ❌ | Premium/Pro only |

### 4.2 Outlet access rule
- Owner: all outlets within tenant
- Admin/Kasir/Pekerja/Kurir: hanya outlet yang di-assign (pivot user_outlets)

---

## 5) Web MVP Scope (Owner/Admin Panel)

### 5.1 Prinsip
- Web online-first (default)
- Fokus Owner + Admin
- Kasir web POS opsional setelah mobile stabil
- Kurir mobile priority

### 5.2 Web MVP (Owner)
Screens:
- Dashboard agregat (all outlets)
- Outlet management (CRUD + outlet code + timezone)
- User management (invite, role, assign outlets)
- Billing/Quota view (plan, remaining orders)
- WhatsApp settings/templates/logs (Premium/Pro)

### 5.3 Web MVP (Admin)
Screens:
- Dashboard outlet
- Orders list + order detail
- Assign courier + boards (pickup/delivery)
- Service overrides (outlet services)
- Shipping zones (ongkir)
- Customer search/detail
- WhatsApp logs (Premium/Pro)

### 5.4 Tech recommendation
- Laravel + Inertia (Vue/React) agar auth/RBAC satu pintu

---

## 6) DB Schema High-Level (ERD Ringkas)

### 6.1 Core tenant & access
- tenants
  - id (uuid), name, plan_id/current_plan, created_at
- outlets
  - id, tenant_id, name, code, timezone, address
  - unique: (tenant_id, code)
- users
  - id, tenant_id, name, phone/email, status
- roles
  - id, key (owner/admin/cashier/worker/courier)
- user_roles
  - user_id, role_id
- user_outlets
  - user_id, outlet_id (akses outlet)

Indexes:
- outlets(tenant_id, code) unique
- user_outlets(user_id, outlet_id) unique

### 6.2 Customers
- customers
  - id, tenant_id, name, phone_normalized, notes, updated_at
  - unique: (tenant_id, phone_normalized)

### 6.3 Services & pricing
- services
  - id, tenant_id, name, unit_type (kg/pcs), base_price_amount, active
- outlet_services
  - id, outlet_id, service_id, active, price_override_amount, sla_override

Indexes:
- services(tenant_id)
- outlet_services(outlet_id, service_id) unique

### 6.4 Orders
- orders
  - id, tenant_id, outlet_id, customer_id
  - invoice_no (nullable), order_code (required)
  - is_pickup_delivery
  - laundry_status, courier_status
  - shipping_fee_amount, discount_amount, total_amount
  - pickup_json, delivery_json (atau kolom terpisah)
  - notes
  - created_at, updated_at
- order_items
  - id, order_id, service_id
  - service_name_snapshot, unit_type_snapshot
  - qty, weight_kg
  - unit_price_amount, subtotal_amount
- payments
  - id, order_id, amount, method, paid_at, notes

Indexes:
- orders(tenant_id, outlet_id, created_at)
- orders(outlet_id, invoice_no) unique (atau tenant_id+invoice_no unique)
- orders(tenant_id, order_code) unique
- order_items(order_id)
- payments(order_id, paid_at)

### 6.5 Courier tasks (optional if not embedded)
- courier_tasks
  - id, order_id, type (pickup/delivery), status, courier_user_id
  - schedule_date, schedule_slot, address_short, maps_link
  - updated_at

### 6.6 Sync & devices
- devices
  - id (device_id uuid), tenant_id, user_id, last_seen_at
- sync_mutations
  - id (mutation_id uuid), tenant_id, device_id, seq, type, entity_type, entity_id, payload_json, client_time, status, processed_at
  - unique: (tenant_id, mutation_id)
- sync_changes (server change log)
  - change_id uuid, tenant_id, entity_type, entity_id, op, data_json, updated_at, cursor
  - index: (tenant_id, cursor)
(Alternatif: gunakan updated_at based pull + cursor watermark.)

### 6.7 Invoice leasing
- invoice_leases
  - lease_id uuid, tenant_id, outlet_id, device_id, date, prefix, from_counter, to_counter, expires_at, created_at
- invoice_usage (optional)
  - outlet_id, date, counter_used (atau cukup enforce via orders.invoice_no unique)

### 6.8 WhatsApp messaging
- wa_providers
  - id, key, name (registry global)
- wa_provider_configs
  - id, tenant_id, provider_id, credentials_json, is_active
- wa_templates
  - id, tenant_id, outlet_id nullable (override), template_id, version, definition_json
- wa_messages
  - id uuid, tenant_id, outlet_id, order_id nullable
  - template_id, idempotency_key, to_phone, body_text
  - status (queued/sent/delivered/failed), attempts, last_error_code, last_error_message
  - provider_id, provider_message_id
  - created_at, updated_at
  - unique: (tenant_id, idempotency_key)

### 6.9 Billing & quota
- plans
  - id, key (free/standard/premium/pro), orders_limit
- tenant_subscriptions
  - tenant_id, plan_id, period (YYYY-MM), starts_at, ends_at, status
- quota_usage
  - tenant_id, period, orders_used
(Atau hitung dari orders.created_at per period, tapi quota_usage lebih cepat.)

---

## 7) Final Notes (Implementation Guidance)
- Semua validasi kritikal harus di server:
  - transition table (status maju)
  - quota enforcement
  - invoice lease validation
  - phone normalization & uniqueness customer
- WA event hanya server-side; client tidak mengirim WA.
- Server adalah source-of-truth akhir untuk:
  - status order
  - total payment dan due
  - invoice_no final
  - eligibility fitur berbasis plan

---

## 8) Target Arsitektur Implementasi (MVP)

### 8.1 Backend (Laravel 12)
Pisahkan per bounded-context agar maintainable:
- Identity & Access: auth, role, outlet assignment, policy/guard
- Master Data: customers, services, outlet overrides, shipping zones
- Order Management: order create/update, state machine, payment append-only
- Sync Engine: push/pull, idempotency mutation, change feed cursor
- Invoice Engine: range lease, invoice validation, invoice assignment
- Messaging Engine: WA providers, templates, queue, log, retry
- Billing & Quota: plan, usage counter, enforcement
- Audit & Observability: audit trail, logs, metrics event

Pattern disarankan:
- Controller -> Action/UseCase -> Domain Service -> Repository/Model
- Gunakan DB transaction pada mutation kritikal (order create, payment add, status update, lease claim).

### 8.2 Queue & Async jobs
Gunakan queue terpisah:
- `default`: pekerjaan normal
- `critical`: sync apply + invoice assignment + quota update
- `messaging`: WA send + retry

Job minimum:
- `ProcessSyncMutationJob`
- `EnqueueWaEventsJob`
- `SendWaMessageJob`
- `RetryWaMessageJob`
- `ExpireInvoiceLeaseJob` (opsional scheduler)
- `RebuildQuotaUsageJob` (maintenance)

### 8.3 Client architecture
Mobile (offline-first):
- Local DB
- Outbox table
- Sync service (push lalu pull)
- Retry manager + network listener

Web (online-first):
- Inertia + server-rendered data fetch
- Optimistic UI hanya untuk aksi ringan
- Tidak ada outbox umum di MVP web

---

## 9) API Scope Matrix (MVP)

### 9.1 Auth, user, context
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/me`
- `GET /api/outlets/allowed`

### 9.2 Master data
- `GET /api/customers`
- `POST /api/customers`
- `PATCH /api/customers/{id}`
- `GET /api/services`
- `GET /api/outlet-services`
- `PATCH /api/outlet-services/{id}`
- `GET /api/shipping-zones`
- `POST /api/shipping-zones`

### 9.3 Orders & payments
- `POST /api/orders` (web online-first)
- `GET /api/orders`
- `GET /api/orders/{id}`
- `POST /api/orders/{id}/payments` (append-only)
- `POST /api/orders/{id}/status/laundry`
- `POST /api/orders/{id}/status/courier`
- `POST /api/orders/{id}/assign-courier`

### 9.4 Sync & invoice
- `POST /api/sync/push`
- `POST /api/sync/pull`
- `POST /api/invoices/range/claim`

### 9.5 WA & billing (plan-gated)
- `GET /api/wa/providers`
- `POST /api/wa/provider-config`
- `GET /api/wa/templates`
- `PUT /api/wa/templates/{template_id}`
- `GET /api/wa/messages`
- `GET /api/billing/quota`

Catatan implementasi:
- Kontrak detail sync tetap refer ke `docs/SYNC_API_CONTRACT.md`.
- Semua endpoint harus menggunakan policy check berbasis role + outlet scope.

---

## 10) Detail Aturan Konflik Sync (MVP)

### 10.1 Prinsip resolusi konflik
- Server selalu menang sebagai state akhir.
- Client wajib menandai mutation rejected dan menampilkan alasan.
- Idempotency kunci:
  - mutation: `tenant_id + mutation_id`
  - WA message: `tenant_id + idempotency_key`

### 10.2 Conflict matrix
1) Status mundur:
- Kasus: client kirim `drying -> washing`
- Hasil: reject `STATUS_NOT_FORWARD` + current state server

2) Duplikasi payment:
- Kasus: retry network mengirim payment sama
- Hasil: detect via payment client_ref/idempotency key, return duplicate-applied

3) Customer duplikat offline:
- Kasus: dua device create customer dengan nomor sama
- Hasil: upsert by `phone_normalized`, kirim `effects.id_map`

4) Invoice di luar lease:
- Kasus: client kirim invoice_no dari counter tidak valid
- Hasil: reject `INVOICE_RANGE_INVALID`

### 10.3 Client UX minimum saat conflict
- Badge "Perlu sinkronisasi ulang"
- Tombol refresh entity terkait
- Menampilkan `reason_code` + pesan singkat yang dapat dipahami user

---

## 11) Rencana Data Model Detail (Tambahan)

### 11.1 Kolom audit wajib
Tambahkan ke tabel kritikal:
- `created_by`, `updated_by` (nullable untuk proses sistem)
- `source_channel` (`mobile`, `web`, `system`)

Tabel minimal:
- orders
- payments
- wa_messages
- sync_mutations

### 11.2 Soft delete policy
MVP disarankan:
- `customers`, `services`, `outlets`, `users`: soft delete
- `orders`, `payments`, `sync_mutations`, `wa_messages`: tidak dihapus, hanya status lifecycle

### 11.3 Constraint tambahan
- `orders.invoice_no` unique dalam tenant saat not null
- `payments.amount > 0`
- `orders.total_amount >= 0`
- `orders.discount_amount >= 0`
- `courier_status` null jika `is_pickup_delivery = false`

---

## 12) Security, Privacy, dan Compliance Baseline

### 12.1 Security baseline
- Password hashing: Argon2id / bcrypt Laravel default
- Access token dengan expiry dan revoke support
- Rate limiting endpoint auth + sync push
- Validasi strict untuk semua payload JSON

### 12.2 Authorization baseline
- Gunakan Laravel Policy + Gate untuk kombinasi:
  - role permission
  - tenant scope
  - outlet assignment

### 12.3 Privacy baseline
- Masking nomor telepon pada log aplikasi
- Enkripsi field sensitif provider credential (at-rest)
- Backup data terenkripsi

### 12.4 Audit trail
Audit event minimum:
- login sukses/gagal
- create/update order
- add payment
- update status
- update WA template/provider
- perubahan plan/quota

---

## 13) Observability dan Operasional

### 13.1 Logging
- Structured logs JSON
- Sertakan: `request_id`, `tenant_id`, `outlet_id`, `user_id`, `device_id`, `mutation_id` (jika ada)

### 13.2 Metrics minimum
- API latency per endpoint (p50/p95)
- Error rate 4xx/5xx
- Sync mutation applied/rejected ratio
- WA queue pending/success/failed
- Quota block count (`QUOTA_EXCEEDED`)

### 13.3 Alert baseline
- WA failure rate > 20% dalam 15 menit
- Queue backlog `messaging` > threshold
- Error 5xx > threshold
- Sync reject spike mendadak

### 13.4 Operational runbook
- Restart worker queue
- Re-drive failed WA messages
- Rebuild quota usage per period
- Investigasi invoice collision/anomaly

---

## 14) Test Strategy (Matang untuk MVP)

### 14.1 Test pyramid
- Unit test:
  - state transition validator
  - invoice parser/validator
  - WA template renderer + DSL condition
  - quota calculator
- Feature/integration test:
  - sync push/pull flow
  - order create (invoice valid/pending)
  - payment append-only
  - RBAC access matrix
  - WA enqueue + retry logic
- End-to-end smoke:
  - kasir create order -> pekerja update -> kurir deliver -> payment complete

### 14.2 Regression suite wajib sebelum rilis
- Status tidak bisa mundur
- Invoice tidak bentrok lintas device
- Quota block create order saat limit habis
- Customer merge berdasarkan nomor HP
- WA hanya aktif untuk Premium/Pro

### 14.3 Data test fixtures
- Tenant multi-plan (free, standard, premium, pro)
- Multi outlet + user roles lengkap
- Order pickup dan non pickup
- Skenario invoice pending lalu assigned

---

## 15) Rencana Implementasi Bertahap (Execution Plan)

### Phase 0 - Foundation (Week 1)
Deliverables:
- setup project Laravel 12, auth baseline, multi-tenant scoping
- migration core tables: tenant/outlet/user/role/customer/service/order/payment
- seed plans + roles

Definition of done:
- login + role guard berjalan
- unit test auth/policy dasar lulus

### Phase 1 - Core Operations (Week 2-3)
Deliverables:
- order management API + payment append-only
- state machine validator server-side
- customer global + service override

Definition of done:
- flow order end-to-end (online) lulus
- regression status forward-only lulus

### Phase 2 - Sync Engine + Invoice Lease (Week 4-5)
Deliverables:
- `/sync/push`, `/sync/pull`, `/invoices/range/claim`
- idempotency mutation + cursor changes
- invoice validation against lease

Definition of done:
- simulasi 2 device offline->online tanpa invoice collision
- reject matrix reason_code konsisten

### Phase 3 - WA Messaging + Plan Enforcement (Week 6)
Deliverables:
- provider abstraction + config + template manager
- queue send/retry + message log
- plan gate (Premium/Pro WA, quota order/bulan)

Definition of done:
- event WA otomatis berjalan di environment staging
- downgrade behavior tervalidasi

### Phase 4 - Web Owner/Admin + Hardening (Week 7-8)
Deliverables:
- owner/admin web screens MVP
- observability dashboards + alerts
- security hardening + audit trail

Definition of done:
- UAT scenario utama lulus
- readiness checklist go-live terpenuhi

---

## 16) Checklist Go-Live

### 16.1 Teknis
- Semua migration sudah idempotent
- Queue worker autosupervised
- Scheduler aktif
- Backup restore test lulus
- Secret management production tervalidasi

### 16.2 Produk
- RBAC matrix tervalidasi per role
- Copy WA template default diset
- Dokumen SOP operasional tersedia
- Training singkat admin/kasir selesai

### 16.3 Quality gate
- Critical test pass rate 100%
- No open bug severity high
- Monitoring + alert aktif dan diuji

---

## 17) Risk Register (MVP)

| Risk | Dampak | Mitigasi |
|---|---|---|
| Invoice collision karena logic lease salah | Tinggi | unik DB constraint + test multi-device + property test parser |
| Sync reject terlalu tinggi membingungkan user | Tinggi | perbaiki error message UX + retry policy + telemetry reason_code |
| WA provider sering timeout | Sedang | multi-provider fallback + retry backoff + alert cepat |
| Quota period salah hitung | Tinggi | gunakan `quota_usage` + nightly reconciliation job |
| Role leakage antar outlet | Tinggi | policy test matrix + query scoping wajib tenant/outlet |

---

## 18) Open Decisions (Harus diputuskan sebelum coding penuh)

1) Multi-tenant routing web:
- Opsi A: subdomain tenant
- Opsi B: path-based (`/t/{tenant}`)
- Default rekomendasi MVP: path-based (lebih cepat implementasi)

2) Metode auth mobile:
- Opsi A: Sanctum token
- Opsi B: JWT
- Default rekomendasi MVP: Sanctum token personal access

3) Worker infra:
- Opsi A: database queue (awal)
- Opsi B: Redis queue
- Default rekomendasi MVP: Redis (lebih stabil untuk messaging)

4) Web kasir offline:
- Opsi A: ditunda pasca MVP
- Opsi B: mulai basic PWA sejak awal
- Default rekomendasi MVP: ditunda pasca MVP

---

## 19) Post-MVP Backlog (Setelah Stabil)
- Analitik owner (revenue trend, SLA pickup/delivery, cohort customer)
- Promo/voucher engine
- Membership/tier customer
- E-invoice PDF + branded print profile
- Web kasir offline terbatas (PWA)
- Omnichannel messaging selain WA

---

## 20) MVP Decision Freeze (Untuk Kickoff)

Keputusan ini dipakai sebagai baseline implementasi mulai Sprint 1 (mulai 16 February 2026).
Perubahan keputusan hanya boleh lewat changelog dokumen ini.

| Decision ID | Topik | Keputusan Baseline | Alasan |
|---|---|---|---|
| DEC-001 | Multi-tenant web routing | Path-based (`/t/{tenant}`) | Implementasi lebih cepat, migrasi ke subdomain bisa dilakukan setelah product-market fit |
| DEC-002 | Mobile auth | Laravel Sanctum token | Integrasi native Laravel lebih sederhana untuk MVP |
| DEC-003 | Queue infra | Redis queue | Lebih stabil untuk beban async WA + retry dibanding DB queue |
| DEC-004 | Web kasir offline | Ditunda pasca MVP | Fokus stabilitas mobile offline-first dulu |

Catatan:
- Section 18 tetap disimpan sebagai referensi opsi.
- Jika ada perubahan keputusan, buat entri baru `DEC-00X` (jangan overwrite history).

---

## 21) EPIC Backlog (Ready for Ticketing)

| Epic ID | Epic Name | Output Utama | Depends On |
|---|---|---|---|
| EPIC-01 | Foundation & Tenant Access | auth, RBAC, tenant-outlet scope, seed plan | - |
| EPIC-02 | Order Core Operations | order, item snapshot, payment append-only, state machine | EPIC-01 |
| EPIC-03 | Offline Sync & Invoice Lease | sync push/pull, idempotency, cursor, lease invoice | EPIC-01, EPIC-02 |
| EPIC-04 | WA Messaging & Plan Enforcement | WA engine, template, queue retry, quota gate | EPIC-02, EPIC-03 |
| EPIC-05 | Web Owner/Admin MVP | dashboard, order board, user/outlet/service admin | EPIC-01, EPIC-02 |
| EPIC-06 | QA, Observability, Release Hardening | test suite, metrics, alerting, runbook, UAT | EPIC-01..EPIC-05 |

Definition of Ready (DoR) per Epic:
- scope endpoint/screen sudah jelas
- dependency selesai atau bisa dimock
- acceptance criteria testable
- data migration impact sudah dianalisis

---

## 22) Sprint Plan (8 Minggu, Fixed Dates)

### Sprint 1 (16 February 2026 - 28 February 2026)
Target:
- EPIC-01 selesai 100%
- EPIC-02 mulai (order create + payment)

Exit criteria:
- login, role guard, outlet guard berjalan
- create order online + append payment lulus integration test

### Sprint 2 (1 March 2026 - 14 March 2026)
Target:
- EPIC-02 selesai
- EPIC-03 mulai (sync push/pull skeleton)

Exit criteria:
- status validator forward-only aktif
- sync push/pull basic cursor berjalan di staging

### Sprint 3 (15 March 2026 - 28 March 2026)
Target:
- EPIC-03 selesai
- EPIC-04 mulai (WA provider abstraction + template renderer)

Exit criteria:
- invoice lease claim + validation aktif
- simulasi 2 device tidak bentrok invoice

### Sprint 4 (29 March 2026 - 11 April 2026)
Target:
- EPIC-04 selesai
- EPIC-05 dan EPIC-06 (MVP subset) selesai

Exit criteria:
- owner/admin web MVP bisa dipakai UAT
- checklist go-live section 16 terpenuhi

---

## 23) Ticket Breakdown (MVP Execution)

### 23.1 EPIC-01 - Foundation & Tenant Access
| Ticket | Deskripsi | Acceptance Criteria | Estimasi |
|---|---|---|---|
| BE-001 | Setup auth + me endpoint + outlet context | `POST /auth/login`, `GET /me` mengembalikan roles + allowed_outlets | 2d |
| BE-002 | Migration tenant/outlet/user/role/user_outlets | semua constraint unik valid, seed role+plan jalan | 2d |
| BE-003 | Policy guard tenant+outlet scope | akses outlet yang tidak diassign return `OUTLET_ACCESS_DENIED` | 2d |
| BE-004 | Middleware request metadata | `request_id`, `tenant_id`, `outlet_id` masuk structured log | 1d |

### 23.2 EPIC-02 - Order Core Operations
| Ticket | Deskripsi | Acceptance Criteria | Estimasi |
|---|---|---|---|
| BE-010 | Create order + item snapshot + total calc | snapshot nama/unit/harga tersimpan; total konsisten | 3d |
| BE-011 | Payment append-only endpoint | payment tidak bisa di-edit/delete; due terhitung benar | 2d |
| BE-012 | State machine validator | transition invalid ditolak `INVALID_TRANSITION` / `STATUS_NOT_FORWARD` | 2d |
| BE-013 | Customer upsert by phone normalized | duplicate phone dalam tenant ter-merge benar | 2d |
| BE-014 | Courier assignment + schedule update rules | role guard dan constraint status terpenuhi | 2d |

### 23.3 EPIC-03 - Offline Sync & Invoice Lease
| Ticket | Deskripsi | Acceptance Criteria | Estimasi |
|---|---|---|---|
| BE-020 | Sync mutation table + idempotency | duplicate mutation return konsisten `duplicate/applied` | 2d |
| BE-021 | `POST /sync/push` apply mutations | ack/reject envelope sesuai kontrak | 3d |
| BE-022 | `POST /sync/pull` cursor changes | pull paginated + `next_cursor` + `has_more` valid | 2d |
| BE-023 | `POST /invoices/range/claim` | lease non-overlap per outlet+date+device | 2d |
| BE-024 | Invoice validator on order create/push | invoice di luar lease ditolak `INVOICE_RANGE_INVALID` | 2d |
| BE-025 | Conflict reason mapper | semua reject penting mengembalikan `reason_code` yang standar | 1d |

### 23.4 EPIC-04 - WA Messaging & Plan Enforcement
| Ticket | Deskripsi | Acceptance Criteria | Estimasi |
|---|---|---|---|
| BE-030 | Quota service + enforcement create order | saat limit habis return `QUOTA_EXCEEDED` | 2d |
| BE-031 | WA provider interface + provider config API | health check + send mock provider jalan | 2d |
| BE-032 | Template renderer line-conditional DSL | pipeline 1-9 section 3.3 tervalidasi unit test | 3d |
| BE-033 | Queue jobs send/retry/backoff + log | transient retry max 5, permanent stop | 3d |
| BE-034 | WA plan gate Premium/Pro | paket free/standard tidak enqueue WA events | 1d |

### 23.5 EPIC-05 - Web Owner/Admin MVP
| Ticket | Deskripsi | Acceptance Criteria | Estimasi |
|---|---|---|---|
| WEB-001 | Owner dashboard + billing/quota view | data agregat outlet + quota tampil benar | 2d |
| WEB-002 | Admin orders list/detail + assign courier | filter outlet + update status sesuai RBAC | 3d |
| WEB-003 | Outlet/service override + shipping zones | CRUD berjalan dengan policy benar | 2d |
| WEB-004 | User/outlet management | invite user + assign outlet sukses | 2d |
| WEB-005 | WA settings/templates/logs page | hanya Premium/Pro, log status terlihat | 2d |

### 23.6 EPIC-06 - QA/Release Hardening
| Ticket | Deskripsi | Acceptance Criteria | Estimasi |
|---|---|---|---|
| QA-001 | Unit + feature regression suite | seluruh skenario section 14.2 pass | 3d |
| OPS-001 | Metrics + alert baseline | alert rule section 13.3 diuji | 2d |
| OPS-002 | CI pipeline (lint/test) | PR wajib pass lint + test | 1d |
| OPS-003 | Runbook + rollback SOP | runbook operasional section 13.4 tersedia | 1d |
| REL-001 | UAT checklist execution | semua item section 16 checked | 2d |

---

## 24) Critical Path (Tidak Boleh Slip)

Urutan kritikal:
1) BE-001 -> BE-002 -> BE-003
2) BE-010 -> BE-011 -> BE-012
3) BE-020 -> BE-021 -> BE-022
4) BE-023 -> BE-024
5) BE-030 -> BE-034
6) QA-001 -> REL-001

Jika salah satu ticket kritikal terlambat >2 hari:
- freeze ticket non-kritikal sprint berjalan
- fokus swarm ke blocker
- update estimasi sprint berikutnya

---

## 25) Definition of Done (DoD) per Ticket

Ticket dianggap selesai jika semua terpenuhi:
- kode + migration + test terkait sudah merge
- endpoint/screen tervalidasi di staging
- logs/metrics minimal tersedia untuk fitur baru
- dokumentasi API/behavior diperbarui (jika ada perubahan kontrak)
- tidak ada bug severity high terbuka untuk ticket tersebut

---

## 26) Mandatory Change Documentation Protocol (AI Wajib Ikuti)

Aturan ini mengikat semua implementasi kode/fitur baru, bugfix, refactor, migration, dan perubahan konfigurasi.

### 26.1 Perintah operasional untuk AI agent
Sebelum mulai coding:
1) Buat file dokumentasi perubahan di `docs/changes/` dengan format nama:
   - `CHG-YYYYMMDD-<slug-singkat>.md`
2) Gunakan template dari `docs/CHANGE_DOC_TEMPLATE.md`.
3) Isi minimal: `status=planned`, tujuan, scope, acceptance criteria, risiko.

Saat coding:
1) Update bagian progress dan keputusan teknis penting.
2) Catat semua file yang diubah dan alasan perubahan.
3) Catat dampak kontrak API/DB jika ada perubahan.

Setelah coding selesai:
1) Ubah `status=done`.
2) Isi ringkasan implementasi final, daftar file berubah, dan dampak user/business.
3) Isi bukti validasi: test yang dijalankan + hasil.
4) Jika test belum dijalankan, wajib tulis alasan dan risiko.
5) Isi rollback plan singkat.

### 26.2 Rule of completion
- Perubahan dianggap belum complete jika file dokumentasi perubahan belum ada atau belum di-update ke status akhir.
- Untuk perubahan kecil (hotfix ringan), dokumentasi tetap wajib (boleh ringkas).

### 26.3 Output minimum di respons AI
Pada akhir pekerjaan, AI wajib menyebutkan:
- path file dokumentasi perubahan
- ringkasan perubahan teknis
- status validasi/test

---

## 27) Lokasi dan Format Dokumen Perubahan

- Folder: `docs/changes/`
- Template wajib: `docs/CHANGE_DOC_TEMPLATE.md`
- Satu perubahan utama = satu file dokumentasi.
- Jika satu task sangat besar dan melewati beberapa fase, gunakan file yang sama dan update status/progress bertahap.

---

## 28) Execution Pivot (Web-First Transaction)

Efektif mulai `16 February 2026`, prioritas implementasi dipivot ke **web-first** sampai transaksi operasional bisa dijalankan penuh dari web panel.

Catatan penting:
- Aturan domain LOCKED pada dokumen ini tetap berlaku (state machine, quota, invoice, WA policy).
- Pivot ini hanya mengubah **urutan eksekusi**, bukan mengubah business rule inti.

Tujuan utama pivot:
- Owner/Admin/Kasir dapat menjalankan transaksi harian langsung dari web.
- Web menjadi channel operasional utama terlebih dahulu sebelum ekspansi fitur mobile lanjutan.

---

## 29) Definisi “Web Transaksi Siap Pakai”

Status dianggap siap pakai jika semua kondisi ini terpenuhi:
1. Kasir/Admin dapat membuat order baru dari web (customer + item + ongkir/diskon + total otomatis).
2. Kasir/Admin dapat menambah pembayaran append-only dari web dan due amount selalu konsisten.
3. Tim operasional dapat memperbarui status order (laundry/courier) dari web sesuai aturan forward-only.
4. Invoice/ref order dan ringkasan transaksi dapat ditampilkan/di-print dari web.
5. Semua aksi transaksi utama tercatat audit trail.
6. Skenario UAT web transaksi lulus tanpa bug severity high.

---

## 30) Scope Freeze Web-First (V1)

In scope (wajib selesai dulu):
- Halaman **Buat Transaksi** di web:
  - pilih outlet (sesuai scope user),
  - cari/buat customer cepat,
  - tambah item layanan multi baris,
  - hitung subtotal/total/due secara konsisten server-side.
- Halaman **Detail Transaksi**:
  - ringkasan order + item + timeline status,
  - tambah pembayaran (append-only),
  - aksi cepat status operasional.
- Halaman **Daftar Transaksi**:
  - filter, pencarian, dan aksi operasional harian.
- Halaman **Cetak Ringkas** (invoice/struk sederhana).
- Guard role dan outlet scope untuk alur kasir/admin/owner.
- Test coverage web transaction flow.

Out of scope (setelah V1 stabil):
- Web offline/PWA kasir.
- Promo/voucher, membership, analitik lanjutan.
- Omnichannel messaging selain WA.

---

## 31) Ticket Breakdown Baru (Web Transaction First)

### WF-01 — Transaction Entry (Web)
| Ticket | Deskripsi | Acceptance Criteria | Estimasi |
|---|---|---|---|
| WEB-TX-001 | Form create order web + validasi payload | Order bisa dibuat dari web untuk tenant/outlet valid | 2d |
| WEB-TX-002 | Customer quick search + quick create (inline) | Kasir dapat pilih customer existing atau buat baru cepat | 2d |
| WEB-TX-003 | Item builder + total calculator (server-authoritative) | Subtotal/total/due konsisten dengan rule backend | 2d |

### WF-02 — Payment & Receipt (Web)
| Ticket | Deskripsi | Acceptance Criteria | Estimasi |
|---|---|---|---|
| WEB-TX-010 | Add payment di detail order (append-only) | Pembayaran tercatat dan due update benar | 1d |
| WEB-TX-011 | Quick payment actions (lunas/nominal tertentu) | Kasir bisa input pembayaran cepat tanpa edit histori | 1d |
| WEB-TX-012 | Print-friendly invoice/receipt page | Ringkasan transaksi dapat dicetak jelas dari browser | 1d |

### WF-03 — Operational Completion
| Ticket | Deskripsi | Acceptance Criteria | Estimasi |
|---|---|---|---|
| WEB-TX-020 | Status action di detail order | Status laundry/courier bisa diupdate sesuai transition rule | 1.5d |
| WEB-TX-021 | Integrasi assignment courier di detail | Admin/owner bisa assign courier dari detail transaksi | 1d |
| WEB-TX-022 | Guard UX untuk invalid transition | Error reason tampil jelas ke user web | 1d |

### WF-04 — Hardening & UAT
| Ticket | Deskripsi | Acceptance Criteria | Estimasi |
|---|---|---|---|
| QA-WEB-001 | Feature tests web transaction end-to-end | Skenario create->pay->status lulus otomatis | 2d |
| QA-WEB-002 | UAT script khusus kasir/admin web | Skenario UAT web bisa dijalankan repeatable | 1d |
| REL-WEB-001 | Release checklist web transaction | No high severity bug + dokumen operasional update | 1d |

---

## 32) Urutan Eksekusi Prioritas (Mulai Sekarang)

Prioritas 1:
- WF-01 (Transaction Entry)

Prioritas 2:
- WF-02 (Payment & Receipt)

Prioritas 3:
- WF-03 (Operational Completion)

Prioritas 4:
- WF-04 (Hardening & UAT)

Rule prioritas:
- Jangan ambil fitur non-transaksi baru sebelum WF-01 s.d WF-03 selesai.
- Bug pada alur transaksi web selalu lebih tinggi prioritas dibanding enhancement visual minor.

---

## 33) Quality Gate Khusus Web Transaction

Sebelum dinyatakan siap dipakai operasional:
1. `php artisan test --testsuite=Feature --filter=WebPanelTest` pass.
2. Tambahan suite `WebTransaction*Test` pass (setelah ticket QA-WEB-001 dibuat).
3. `php artisan test` pass penuh.
4. `npm run build` pass.
5. UAT web kasir/admin minimal 1 siklus pass dengan evidence report.

---

## 34) Next Action (Immediate)

Urutan kerja langsung setelah plan ini disetujui:
1. Implementasi `WEB-TX-001` (route + controller + view create order web).
2. Implementasi `WEB-TX-002` (customer quick search/create inline).
3. Implementasi `WEB-TX-003` (item builder + server-authoritative calculator).
4. Tutup WF-01 dengan test + change docs per ticket.

---
END OF DOCUMENT
