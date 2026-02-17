# Observability Baseline

Dokumen ini menetapkan baseline observability untuk MVP.

## 1) Structured Logging Context

Context wajib di log request:
- `request_id`
- `tenant_id`
- `user_id`
- `outlet_id`
- `device_id` (jika ada)

Implementasi saat ini:
- Middleware `AttachRequestContext` menambahkan context di awal request API.

## 2) Audit Trail Events

Tabel: `audit_events`

Event minimum yang dicatat:
- `AUTH_LOGIN_SUCCESS`
- `AUTH_LOGIN_FAILED`
- `AUTH_LOGIN_INACTIVE`
- `AUTH_LOGOUT`
- `ORDER_CREATED`
- `PAYMENT_ADDED`
- `ORDER_LAUNDRY_STATUS_UPDATED`
- `ORDER_COURIER_STATUS_UPDATED`
- `ORDER_COURIER_ASSIGNED`
- `ORDER_SCHEDULE_UPDATED`
- `WA_PROVIDER_CONFIG_UPDATED`
- `WA_TEMPLATE_UPDATED`

Field utama audit:
- `tenant_id`, `user_id`, `outlet_id`
- `event_key`, `channel`
- `entity_type`, `entity_id`
- `request_id`, `ip_address`
- `metadata_json`

## 3) Metrics Baseline

Metrik minimum (bisa dihitung dari log + DB):
- API latency p50/p95 (per endpoint)
- Error rate 4xx/5xx
- Sync applied vs rejected ratio
- WA queued/sent/failed count
- Quota block count (`QUOTA_EXCEEDED`)

## 4) Alert Baseline

Threshold awal yang direkomendasikan:
- WA failed ratio > 20% dalam 15 menit
- Sync rejected ratio > 30% dalam 10 menit
- Error 5xx > 2% dalam 5 menit
- Queue backlog messaging > threshold operasional (sesuaikan traffic)
- Tenant usage quota > 85% di periode aktif

## 5) Investigation Queries (Contoh)

### 5.1 Audit login gagal terbaru
```sql
select created_at, tenant_id, user_id, metadata_json
from audit_events
where event_key = 'AUTH_LOGIN_FAILED'
order by created_at desc
limit 50;
```

### 5.2 Event order per order_id
```sql
select created_at, event_key, metadata_json
from audit_events
where entity_type = 'order' and entity_id = 'ORDER_UUID'
order by created_at asc;
```

### 5.3 WA config updates
```sql
select created_at, tenant_id, user_id, metadata_json
from audit_events
where event_key = 'WA_PROVIDER_CONFIG_UPDATED'
order by created_at desc;
```

## 6) Retention & Reconciliation Commands

Command operasional yang terkait observability:
- Readiness check:
  - `php artisan ops:readiness:check`
- Observability check:
  - `php artisan ops:observe:health`
- Archive audit lama:
  - `php artisan ops:audit:archive --days=90`
- Redrive WA failed transient:
  - `php artisan ops:wa:redrive-failed --limit=100`
- Reminder WA aging:
  - `php artisan ops:wa:send-aging-reminders --limit=200`
- Reconcile quota usage:
  - `php artisan ops:quota:reconcile`
