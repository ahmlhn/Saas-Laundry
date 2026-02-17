# CHG-20260216-epic06-ops-hardening

## Header
- Change ID: `CHG-20260216-epic06-ops-hardening`
- Status: `done`
- Date: `2026-02-16`
- Owner: `codex`
- Related Ticket: `QA-001, OPS-001, OPS-002, OPS-003`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Mematangkan quality gate, observability baseline, dan kesiapan operasional rilis.
- Solusi yang akan/dilakukan: Menambahkan audit trail terstruktur, rate limiting endpoint kritikal, workflow CI GitHub Actions, serta dokumen runbook dan observability baseline.
- Dampak bisnis/user: Operasional lebih aman, aktivitas kritikal bisa ditelusuri, dan kualitas perubahan terjaga lewat pipeline CI.

## 2) Scope
- In scope:
  - Tabel + model `audit_events`
  - Service audit trail dan event key constants
  - Integrasi audit pada auth/order/wa flows (API + web)
  - Rate limit `auth-login` dan `sync-push`
  - CI workflow backend tests + frontend build
  - Dokumen operasional dan observability baseline
  - Update README agar sesuai state aplikasi
- Out of scope:
  - Integrasi provider alert eksternal production
  - Dashboard metrics eksternal penuh (Grafana/Prometheus)

## 3) Acceptance Criteria
1. Event audit minimum tercatat untuk login/order/payment/status/wa-config.
2. Endpoint login dan sync push memiliki rate limit aktif.
3. CI workflow tersedia untuk validasi test/build.
4. Runbook operasional dan baseline observability tersedia.

## 4) Implementasi Teknis
- Pendekatan:
  - Service `AuditTrailService` untuk insert audit event terstruktur.
  - `AuditEventKeys` sebagai sumber event key agar konsisten.
  - Rate limiter didefinisikan di `AppServiceProvider`.
  - Middleware throttle diterapkan ke route API kritikal.
- Keputusan teknis penting:
  - Audit metadata disimpan di `metadata_json` dengan context request (`request_id`, `ip_address`).
  - Rate limit login: 10 request/menit per kombinasi `email + ip`.
  - Rate limit sync push: 180 request/menit per `user + device + ip`.
- Trade-off:
  - Audit dicatat sinkron pada request mutation (menambah overhead kecil per request).
  - Alerting production masih berupa baseline dokumen, belum terhubung provider notifikasi.

## 5) File yang Diubah
- `database/migrations/2026_02_16_103000_create_audit_events_table.php`
- `app/Models/AuditEvent.php`
- `app/Domain/Audit/AuditEventKeys.php`
- `app/Domain/Audit/AuditTrailService.php`
- `app/Providers/AppServiceProvider.php`
- `routes/api.php`
- `app/Http/Controllers/Api/AuthController.php`
- `app/Http/Controllers/Api/OrderController.php`
- `app/Http/Controllers/Api/WaController.php`
- `app/Http/Controllers/Web/AuthController.php`
- `app/Http/Controllers/Web/WaSettingsController.php`
- `tests/Feature/AuthApiTest.php`
- `tests/Feature/OrderApiTest.php`
- `tests/Feature/WaApiTest.php`
- `tests/Feature/WebPanelTest.php`
- `.github/workflows/ci.yml`
- `docs/OPERATIONS_RUNBOOK.md`
- `docs/OBSERVABILITY_BASELINE.md`
- `README.md`

## 6) Dampak API/DB/Config
- API changes:
  - `POST /api/auth/login` kini di-throttle (`429` dengan `reason_code=TOO_MANY_REQUESTS`).
  - `POST /api/sync/push` kini di-throttle (`429` dengan `reason_code=TOO_MANY_REQUESTS`).
- DB migration:
  - Tabel baru `audit_events`.
- Env/config changes:
  - Tidak ada env wajib baru.
- Backward compatibility:
  - Additive + behavior hardening pada endpoint kritikal.

## 7) Testing dan Validasi
- Unit test:
  - Existing unit tests tetap pass.
- Integration test:
  - `php artisan test` -> pass (32 tests, 157 assertions).
  - Coverage tambahan:
    - login rate limit
    - audit login failed/success
    - audit order mutation
    - audit WA template/provider update
    - audit web login
- Manual verification:
  - `php artisan migrate --force` -> migration `audit_events` sukses.
  - `php artisan migrate:fresh --seed --force` (test db) -> sukses.
  - `npm run build` -> sukses.
- Hasil:
  - EPIC-06 hardening selesai untuk scope MVP operasional.

## 8) Risiko dan Mitigasi
- Risiko utama:
  - Pertumbuhan data audit jangka panjang.
  - False positive throttling pada trafik abnormal.
- Mitigasi:
  - Siapkan policy retention/archive audit di fase berikutnya.
  - Threshold throttle bisa disesuaikan via perubahan konfigurasi kode.

## 9) Rollback Plan
- Revert commit EPIC-06.
- Rollback migration `audit_events`.
- Hapus integrasi audit/rate-limit/workflow/docs jika diperlukan.

## 10) Changelog Singkat
- `2026-02-16 10:25` - Dokumen perubahan dibuat (planned).
- `2026-02-16 10:38` - Audit model/service/migration dan integrasi controller selesai.
- `2026-02-16 10:46` - Rate limiter + route throttle + test tambahan selesai.
- `2026-02-16 10:55` - CI workflow + docs observability/runbook + README diperbarui.
- `2026-02-16 11:02` - Seluruh test dan build pass, dokumen ditutup status done.
