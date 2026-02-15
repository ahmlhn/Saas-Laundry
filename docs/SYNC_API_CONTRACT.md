# Sync API Contract (MVP) — SaaS Laundry (Mobile Offline-First + Web Online-First)
Version: 1.0
Status: DRAFT-FOR-IMPLEMENTATION (mengacu pada BLUEPRINT yang LOCKED)
Backend: Laravel 12
Clients:
- Mobile (Android/iOS): offline-first, outbox mutations
- Web: online-first (PWA offline kasir opsional)

---

## 0) Goals
- Mobile dapat membuat/ubah data saat offline.
- Saat online, perubahan tersinkron aman, tanpa duplikasi.
- Server menegakkan aturan bisnis:
  - status maju semua
  - payment append-only
  - quota paket (order/bulan)
- Invoice cantik reset harian tetap unik via range booking.

---

## 1) Identity & Scoping
- Tenant ditentukan dari access token (JWT/session token).
- Semua request harus AUTH.
- device_id wajib untuk sync (UUID per instalasi).
- outlet context:
  - sebagian besar mutation bersifat outlet-scoped (outlet_id wajib).
  - customer bersifat tenant-global; outlet_id boleh tetap dikirim sebagai konteks operasional.

Entity IDs:
- Semua entity internal: UUID.
- invoice_no: string cantik (prefix outlet + date + counter4).

Timezone:
- outlet.timezone default Asia/Jakarta.
- created_at order menentukan tanggal invoice.

---

## 2) Endpoints

### 2.1 Auth & Context
- POST /api/auth/login
- GET /api/me
  - return: user, roles, allowed_outlets, plan/quota

### 2.2 Sync
- POST /api/sync/push
- POST /api/sync/pull

### 2.3 Invoice Range Booking
- POST /api/invoices/range/claim

---

## 3) Common Response Envelope (recommended)
All endpoints return:
- server_time (ISO)
- request_id (uuid) (optional, for tracing)

---

## 4) Sync Push

### 4.1 POST /api/sync/push
Purpose: client mengirim outbox mutations.

#### Request
```json
{
  "device_id": "dev-uuid",
  "last_known_server_cursor": "cursor-or-null",
  "mutations": [
    {
      "mutation_id": "mut-uuid",
      "seq": 124,
      "type": "ORDER_CREATE",
      "outlet_id": "outlet-uuid",
      "entity": { "entity_type": "order", "entity_id": "order-uuid" },
      "client_time": "2026-02-15T10:02:00+07:00",
      "payload": {}
    }
  ]
}

Notes:

seq meningkat per device (monotonic). Berguna untuk debugging ordering, tapi server tetap idempotent by mutation_id.

Response
{
  "server_time": "2026-02-15T10:02:03+07:00",
  "ack": [
    {
      "mutation_id": "mut-uuid",
      "status": "applied",
      "server_cursor": "cursor-after-this-change",
      "entity_refs": [
        { "entity_type": "order", "entity_id": "order-uuid" }
      ],
      "effects": {
        "invoice_no_assigned": "BL-260215-0042",
        "id_map": {
          "customer_client_id": "cust-client-uuid",
          "customer_server_id": "cust-server-uuid"
        },
        "wa_events_enqueued": ["WA_PICKUP_CONFIRM"]
      }
    }
  ],
  "rejected": [
    {
      "mutation_id": "mut-uuid2",
      "status": "rejected",
      "reason_code": "STATUS_NOT_FORWARD",
      "message": "Cannot move laundry_status from drying to washing",
      "current_server_state": {
        "entity_type": "order",
        "entity_id": "order-uuid",
        "laundry_status": "drying",
        "updated_at": "2026-02-15T10:01:50+07:00"
      }
    }
  ],
  "quota": {
    "plan": "premium",
    "period": "2026-02",
    "orders_limit": 5000,
    "orders_used": 1234,
    "orders_remaining": 3766,
    "can_create_order": true
  }
}

Status values

applied: mutation diproses dan committed

duplicate: mutation_id sudah pernah diproses (server harus return applied/duplicate secara konsisten)

rejected: melanggar validasi bisnis atau akses

error: payload invalid / server error (sebaiknya tidak di-ack, tapi ditolak request)

5) Sync Pull
5.1 POST /api/sync/pull

Purpose: client mengambil perubahan terbaru sejak cursor.

Request
{
  "device_id": "dev-uuid",
  "cursor": "cursor-or-null",
  "scope": {
    "mode": "selected_outlet",
    "outlet_id": "outlet-uuid"
  },
  "limit": 200
}


Scope.mode:

selected_outlet: default untuk mobile kasir/pekerja/kurir/admin

all_outlets: untuk owner (opsional, harus paginated)

Response
{
  "server_time": "2026-02-15T10:05:00+07:00",
  "next_cursor": "cursor-next",
  "has_more": false,
  "changes": [
    {
      "change_id": "chg-uuid",
      "entity_type": "order",
      "entity_id": "order-uuid",
      "op": "upsert",
      "updated_at": "2026-02-15T10:04:55+07:00",
      "data": {}
    },
    {
      "change_id": "chg-uuid2",
      "entity_type": "payment",
      "entity_id": "pay-uuid",
      "op": "upsert",
      "updated_at": "2026-02-15T10:04:40+07:00",
      "data": {}
    }
  ],
  "quota": {
    "plan": "premium",
    "period": "2026-02",
    "orders_limit": 5000,
    "orders_used": 1234,
    "orders_remaining": 3766,
    "can_create_order": true
  }
}


op values:

upsert

delete (tahap MVP bisa tidak dipakai dulu kecuali soft-delete; kalau delete dipakai, client harus handle)

6) Invoice Range Booking
6.1 POST /api/invoices/range/claim

Purpose: perangkat meminta range counter invoice untuk hari ini & besok.

Request
{
  "device_id": "dev-uuid",
  "outlet_id": "outlet-uuid",
  "days": [
    { "date": "2026-02-15", "count": 200 },
    { "date": "2026-02-16", "count": 200 }
  ]
}

Response
{
  "server_time": "2026-02-15T08:00:00+07:00",
  "ranges": [
    {
      "lease_id": "lease-uuid",
      "outlet_id": "outlet-uuid",
      "date": "2026-02-15",
      "prefix": "BL-260215-",
      "from": 401,
      "to": 600,
      "expires_at": "2026-02-17T00:00:00+07:00"
    }
  ]
}


Rules:

lease per device

gap accepted (range tidak habis dipakai atau cancel)

server harus memastikan tidak ada overlap antar lease untuk outlet+date.

Client usage:

invoice_counter dipakai lokal -> invoice_no dibentuk dari prefix + counter4.

jika range habis saat offline -> set invoice pending (gunakan order_code) sampai online.

7) Entity Data Shapes (Minimum MVP)

Data berikut adalah bentuk yang direkomendasikan untuk changes[].data pada pull dan untuk payload create.

7.1 Order (minimum)
{
  "id": "order-uuid",
  "outlet_id": "outlet-uuid",
  "customer_id": "cust-uuid",

  "invoice_no": "BL-260215-0042",
  "order_code": "ORD-8F3K2Q1A",

  "created_at": "2026-02-15T10:02:00+07:00",
  "updated_at": "2026-02-15T10:04:55+07:00",

  "is_pickup_delivery": true,
  "laundry_status": "washing",
  "courier_status": "pickup_on_the_way",

  "shipping_fee_amount": 10000,
  "discount_amount": 0,
  "total_amount": 55000,

  "notes": "Parfum yang wangi",

  "pickup": {
    "pickup_date": "2026-02-15",
    "pickup_slot": "09.00–11.00",
    "address_short": "Jl. Mawar No.10",
    "maps_link": "https://..."
  },
  "delivery": {
    "delivery_date": null,
    "delivery_slot": null,
    "address_short": "Jl. Mawar No.10",
    "maps_link": "https://..."
  }
}

7.2 OrderItem (snapshot)
{
  "id": "item-uuid",
  "order_id": "order-uuid",
  "service_id": "svc-uuid",
  "service_name_snapshot": "Kiloan Reguler",
  "unit_type_snapshot": "kg",
  "qty": null,
  "weight_kg": 5.2,
  "unit_price_amount": 8000,
  "subtotal_amount": 41600
}

7.3 Payment
{
  "id": "pay-uuid",
  "order_id": "order-uuid",
  "amount": 20000,
  "method": "cash",
  "paid_at": "2026-02-15T10:03:10+07:00",
  "notes": ""
}

7.4 Customer (tenant-global)
{
  "id": "cust-uuid",
  "name": "Budi",
  "phone_normalized": "62812xxxxxxx",
  "notes": "",
  "updated_at": "2026-02-15T09:00:00+07:00"
}

8) Mutation Types (MVP)
8.1 ORDER_CREATE

Payload:

{
  "order": {
    "id": "order-uuid",
    "outlet_id": "outlet-uuid",
    "customer_id": "cust-uuid",
    "invoice_no": "BL-260215-0042-or-null",
    "order_code": "ORD-8F3K2Q1A",
    "created_at": "2026-02-15T10:02:00+07:00",
    "is_pickup_delivery": true,
    "notes": "..."
  },
  "items": [
    {
      "id": "item-uuid",
      "service_id": "svc-uuid",
      "service_name_snapshot": "Kiloan Reguler",
      "unit_type_snapshot": "kg",
      "weight_kg": 5.2,
      "unit_price_amount": 8000,
      "subtotal_amount": 41600
    }
  ],
  "pickup": {
    "pickup_date": "2026-02-15",
    "pickup_slot": "09.00–11.00",
    "address_short": "Jl. Mawar No.10",
    "maps_link": "https://..."
  },
  "delivery": {
    "delivery_date": null,
    "delivery_slot": null,
    "address_short": "Jl. Mawar No.10",
    "maps_link": "https://..."
  },
  "shipping_fee_amount": 10000,
  "discount_amount": 0,
  "total_amount": 55000,
  "initial_payment": {
    "id": "pay-uuid",
    "amount": 20000,
    "method": "cash",
    "paid_at": "2026-02-15T10:03:10+07:00"
  }
}


Server rules:

cek plan quota (QUOTA_EXCEEDED jika habis)

validasi outlet access

validasi invoice_no:

jika client assign invoice_no (dari range lease), server verifikasi valid dan belum dipakai.

jika invoice_no null, server assign saat online jika memungkinkan.

simpan snapshot items

trigger WA_PICKUP_CONFIRM jika is_pickup_delivery & plan Premium/Pro

Effects:

invoice_no_assigned (jika server meng-assign)

id_map jika ada merge customer

8.2 ORDER_UPDATE_STATUS

Payload:

{
  "order_id": "order-uuid",
  "pipeline": "laundry",
  "to_status": "drying",
  "from_status": "washing"
}


Server rules:

enforce transition table (maju semua)

STATUS_NOT_FORWARD / INVALID_TRANSITION jika tidak sah

trigger WA_LAUNDRY_READY saat to_status=ready (Premium/Pro)

8.3 COURIER_UPDATE_STATUS

Payload:

{
  "order_id": "order-uuid",
  "pipeline": "courier",
  "to_status": "pickup_on_the_way"
}


Server rules:

enforce courier transitions

trigger:

WA_PICKUP_OTW saat pickup_on_the_way

WA_DELIVERY_OTW saat delivery_on_the_way

WA_ORDER_DONE saat delivered (atau completed)

8.4 PAYMENT_ADD (append-only)

Payload:

{
  "payment": {
    "id": "pay-uuid",
    "order_id": "order-uuid",
    "amount": 20000,
    "method": "cash",
    "paid_at": "2026-02-15T10:03:10+07:00",
    "notes": ""
  }
}


Server rules:

append-only

recalc paid_amount/due_amount

(optional) if due becomes 0 and order already delivered/completed -> can trigger WA_ORDER_DONE (policy decision later)

8.5 CUSTOMER_UPSERT (tenant-global)

Payload:

{
  "customer": {
    "id": "cust-client-uuid",
    "name": "Budi",
    "phone_raw": "0812....",
    "phone_normalized": "62812....",
    "notes": ""
  }
}


Server rules:

normalize phone

upsert by (tenant_id, phone_normalized)

jika merge:

return effects.id_map: client_id -> server_id

8.6 COURIER_ASSIGN (Admin/Owner)

Payload:

{
  "order_id": "order-uuid",
  "courier_user_id": "user-uuid",
  "pickup_overrides": {
    "pickup_date": "2026-02-15",
    "pickup_slot": "09.00–11.00"
  }
}


Server rules:

role check (OUTLET_ACCESS_DENIED jika tidak)

only if is_pickup_delivery=true

create/update task assignment

9) Quota Enforcement (LOCKED)

Plan limit order/bulan: 200/1000/5000/20000

Server menolak ORDER_CREATE saat limit habis:

reason_code: QUOTA_EXCEEDED

Response push/pull selalu menyertakan quota summary.

10) Error Codes (Standard)

QUOTA_EXCEEDED

OUTLET_ACCESS_DENIED

STATUS_NOT_FORWARD

INVALID_TRANSITION

VALIDATION_FAILED

INVOICE_RANGE_INVALID

PHONE_INVALID

ENTITY_NOT_FOUND

DUPLICATE_ENTITY

Rejected object fields:

mutation_id

reason_code

message

current_server_state (optional)

11) Idempotency & Ordering Guarantees

mutation_id is idempotency key utama.

Server harus menyimpan record processed mutations (tenant_id + mutation_id).

Jika duplicate:

server return status duplicate/applied tanpa melakukan perubahan baru.

seq hanya membantu debugging dan deteksi missing mutations (optional).

12) Web Client Notes

Web online-first bisa langsung memakai endpoint domain biasa (tanpa outbox).

Jika nanti Web Kasir PWA:

reuse kontrak push/pull + local outbox sama seperti mobile.
