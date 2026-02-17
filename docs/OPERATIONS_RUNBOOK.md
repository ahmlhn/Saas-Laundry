# Operations Runbook

Dokumen ini adalah SOP operasional minimum untuk MVP SaaS Laundry.

## 1) Service Start/Stop

### 1.1 API server
- Start: `php artisan serve --host=127.0.0.1 --port=8000`
- Stop: hentikan process terminal server.

### 1.2 Queue worker
- Start: `php artisan queue:work --queue=default,messaging`
- Restart graceful: `php artisan queue:restart`
- Saat deploy kode baru, jalankan `queue:restart` agar worker reload kode.

### 1.3 Scheduler (opsional host)
- Jalankan cron tiap menit:
  - `* * * * * php /path/to/artisan schedule:run >> /dev/null 2>&1`

## 2) Incident Handling

### 2.1 WA message banyak gagal
1. Cek log: `storage/logs/laravel.log`.
2. Cek tabel `wa_messages` status `failed` dan `last_error_code`.
3. Verifikasi provider config aktif di halaman WA/web atau endpoint API.
4. Jika transient dan provider sudah normal, re-drive manual:
   - `php artisan ops:wa:redrive-failed --limit=100`
   - lalu pastikan worker aktif: `php artisan queue:work --queue=default,messaging`

### 2.2 Sync reject spike
1. Lihat reason code dominan di respons `/api/sync/push`.
2. Validasi data lease invoice (`invoice_leases`) dan status transition.
3. Pastikan waktu device benar dan outlet timezone valid.

### 2.3 Login brute-force/abuse
1. Sistem sudah throttling login (`auth-login`).
2. Pantau `audit_events` untuk `AUTH_LOGIN_FAILED`.
3. Jika perlu, blok IP di level reverse proxy/firewall.

## 3) Database Operations

### 3.1 Fresh seed (local/dev)
- `php artisan migrate:fresh --seed`

### 3.2 Backup (minimum)
- Backup harian full DB.
- Retention minimal 7 hari.
- Enkripsi backup saat at-rest.

### 3.3 Audit archive maintenance
- Dry run:
  - `php artisan ops:audit:archive --days=90 --dry-run`
- Eksekusi archive:
  - `php artisan ops:audit:archive --days=90`
- Archive file tersimpan di `storage/app/audit-archives/`.

### 3.4 Quota reconciliation
- Rekonsiliasi periode berjalan:
  - `php artisan ops:quota:reconcile`
- Rekonsiliasi periode spesifik:
  - `php artisan ops:quota:reconcile 2026-02`

### 3.5 Reminder WA aging
- Dry run reminder:
  - `php artisan ops:wa:send-aging-reminders --dry-run`
- Eksekusi reminder harian:
  - `php artisan ops:wa:send-aging-reminders --limit=200`

## 4) Health Checks

### 4.1 App health
- Endpoint framework health: `GET /up`
- API auth sanity: login + `/api/me`.
- Readiness gate command:
  - `php artisan ops:readiness:check`
  - gunakan `php artisan ops:readiness:check --strict` untuk CI/release gate.
- Observability gate command:
  - `php artisan ops:observe:health`
  - gunakan `php artisan ops:observe:health --strict` untuk release gate.

### 4.2 Queue health
- Tidak ada backlog berkepanjangan pada queue `messaging`.
- Tidak ada growth anomali pada tabel `failed_jobs`.

## 5) Release Checklist
1. `php artisan migrate --force`
2. `php artisan config:clear && php artisan route:clear && php artisan view:clear`
3. `npm run build`
4. `php artisan ops:readiness:check --strict`
5. `php artisan ops:observe:health --strict`
6. `php artisan test`
7. Restart queue: `php artisan queue:restart`
8. UAT smoke flow API (kasir -> pekerja -> kurir -> payment -> WA):
   - `php artisan test --testsuite=Feature --filter=UatOperationalFlowTest`
9. Smoke test login + create order + sync push + WA message log.

## 7) Business UAT Pack
- Playbook skenario:
  - `docs/UAT_BUSINESS_PLAYBOOK.md`
- Template hasil temuan dan sign-off:
  - `docs/UAT_FINDINGS_TEMPLATE.md`
- Contoh report hasil eksekusi:
  - `docs/uat-reports/UAT-20260216-engineering-dryrun.md`
- Command otomatis run UAT pack + generate report:
  - `php artisan ops:uat:run --seed-demo`
- Akun demo lintas role tersedia via seeder (`php artisan migrate --seed`):
  - `owner@demo.local`
  - `admin@demo.local`
  - `cashier@demo.local`
  - `worker@demo.local`
  - `courier@demo.local`
  - password semua akun: `password`

## 8) Scheduled Jobs Baseline
- `ops:wa:redrive-failed --limit=100` -> setiap 10 menit
- `ops:observe:health --lookback-minutes=15` -> setiap 15 menit
- `ops:wa:send-aging-reminders --limit=100` -> harian jam 09:00
- `ops:quota:reconcile` -> harian jam 00:10
- `ops:audit:archive --days=90` -> harian jam 02:00
