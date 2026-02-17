# SaaS Laundry (Laravel 12)

Backend + web panel MVP untuk aplikasi laundry multi-tenant.

## Fitur yang sudah tersedia
- Auth API (Sanctum) + tenant/outlet scope
- Order core: create, payment append-only, status pipeline laundry/courier
- Offline sync: push/pull mutation + invoice lease claim
- WA engine: provider config, template renderer DSL, queue + retry, message logs
- Web panel Owner/Admin (`/t/{tenant}`)
- Quota enforcement + plan gate WA (Premium/Pro)
- Audit trail event kritikal
- Data model hardening: `created_by/updated_by/source_channel` + soft delete master data
- Master lifecycle API: archive/restore `customers`, `services`, `outlets`, `users`
- Web management lifecycle: archive/restore `users/outlets` (owner-only) + `customers/services` (owner/admin)

## Requirements
- PHP 8.2+
- Composer
- Node.js 20+
- MySQL 8+

## Setup lokal
```bash
composer install
npm install
cp .env.example .env
php artisan key:generate
```

Set koneksi DB di `.env` (contoh):
```env
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=saas_laundry_dev
DB_USERNAME=root
DB_PASSWORD=
```

Migrasi + seed:
```bash
php artisan migrate --seed
```

Build frontend:
```bash
npm run build
```

Jalankan app:
```bash
php artisan serve --host=127.0.0.1 --port=8000
```

Jalankan queue worker (terminal terpisah):
```bash
php artisan queue:work --queue=default,messaging
```

## Demo credentials
- Password semua akun: `password`
- `owner@demo.local`
- `admin@demo.local`
- `cashier@demo.local`
- `worker@demo.local`
- `courier@demo.local`

Cari tenant id demo:
```bash
php artisan tinker --execute="echo App\\Models\\Tenant::query()->where('name','Demo Laundry')->value('id');"
```

Akses login web:
- `http://127.0.0.1:8000/t/{tenant_id}/login`

## Test
Pastikan database test tersedia (default: `saas_laundry_test`) dan kredensial di `.env.testing` sesuai mesin lokal.

```bash
php artisan test
```

UAT smoke flow operasional:
```bash
php artisan test --testsuite=Feature --filter=UatOperationalFlowTest
```

UAT business pack otomatis + report:
```bash
php artisan ops:uat:run --seed-demo
```

## Operational Commands
- Readiness check staging/release:
  - `php artisan ops:readiness:check`
  - strict gate: `php artisan ops:readiness:check --strict`
- Archive audit lama:
  - `php artisan ops:audit:archive --days=90`
- Redrive WA failed transient:
  - `php artisan ops:wa:redrive-failed --limit=100`
- Reconcile quota usage:
  - `php artisan ops:quota:reconcile`

## CI
Workflow tersedia di:
- `.github/workflows/ci.yml`

## Dokumentasi
- `docs/IMPLEMENTATION_SPECS.md`
- `docs/SYNC_API_CONTRACT.md`
- `docs/OBSERVABILITY_BASELINE.md`
- `docs/OPERATIONS_RUNBOOK.md`
- `docs/UAT_BUSINESS_PLAYBOOK.md`
- `docs/UAT_FINDINGS_TEMPLATE.md`
- `docs/uat-reports/`
- `docs/changes/`
