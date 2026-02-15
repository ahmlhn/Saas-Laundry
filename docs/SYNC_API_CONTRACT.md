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
