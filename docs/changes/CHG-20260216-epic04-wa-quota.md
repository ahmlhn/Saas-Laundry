# CHG-20260216-epic04-wa-quota

## Header
- Change ID: `CHG-20260216-epic04-wa-quota`
- Status: `done`
- Date: `2026-02-16`
- Owner: `codex`
- Related Ticket: `BE-030, BE-031, BE-032, BE-033, BE-034`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Menyelesaikan EPIC-04 untuk WA messaging engine dan plan/quota enforcement.
- Solusi yang akan/dilakukan: Menambahkan quota enforcement terpusat, plan-gate Premium/Pro untuk WA, provider abstraction + mock provider, template resolver/renderer DSL, message dispatch + retry job, endpoint WA API, serta integrasi event WA pada flow order API dan sync mutation.
- Dampak bisnis/user: Order create sekarang aman oleh limit quota bulanan (`QUOTA_EXCEEDED`), fitur WA aktif hanya untuk tenant Premium/Pro, dan notifikasi WA lifecycle order berjalan otomatis dengan log/idempotency.

## 2) Scope
- In scope:
  - Migration tabel WA (`wa_providers`, `wa_provider_configs`, `wa_templates`, `wa_messages`)
  - Service quota + enforcement pada create order
  - Service plan gate WA Premium/Pro
  - WA provider abstraction + mock provider
  - Template resolver + line-conditional DSL renderer
  - Queue job send/retry/backoff + message logging
  - API WA provider config/template/messages
  - Integrasi trigger WA di order API dan sync mutation
  - Unit + feature test EPIC-04
- Out of scope:
  - Integrasi provider WA production (real third-party)
  - Omnichannel selain WhatsApp

## 3) Acceptance Criteria
1. Create order ditolak `QUOTA_EXCEEDED` saat limit order periode habis.
2. Endpoint WA settings hanya bisa diakses tenant Premium/Pro.
3. Template renderer mendukung DSL condition utama (`exists`, `notExists`, `eq/ne`, `gt/gte/lt/lte`, `and/or/not`, `isValidUrl`, `isTrue`).
4. WA message tercatat dengan idempotency key dan memiliki status send/retry/fail.
5. Trigger WA event lifecycle order berjalan pada flow API dan sync.

## 4) Implementasi Teknis
- Pendekatan:
  - Service billing: `QuotaService`, `PlanFeatureGateService`.
  - Service messaging: resolver template + renderer + dispatcher + provider registry.
  - Async delivery: `SendWaMessageJob` dengan retry/backoff.
- Keputusan teknis penting:
  - Quota consume dilakukan atomik pada transaction order create.
  - Plan gate WA dipusatkan di `PlanFeatureGateService`.
  - Idempotency key WA: `{tenant_id}:{outlet_id}:{invoice_or_code}:{template_id}`.
  - Driver WA default menggunakan `mock` provider untuk dev/testing.
- Trade-off:
  - Belum ada fallback multi-provider otomatis.
  - Retry transient menggunakan redispatch job bertahap (max 5 attempt).

## 5) File yang Diubah
- `database/migrations/2026_02_16_073600_create_whatsapp_tables.php`
- `app/Models/WaProvider.php`
- `app/Models/WaProviderConfig.php`
- `app/Models/WaTemplate.php`
- `app/Models/WaMessage.php`
- `app/Domain/Billing/QuotaExceededException.php`
- `app/Domain/Billing/PlanFeatureDisabledException.php`
- `app/Domain/Billing/QuotaService.php`
- `app/Domain/Billing/PlanFeatureGateService.php`
- `app/Domain/Messaging/Contracts/WaProviderDriver.php`
- `app/Domain/Messaging/Providers/MockWaProvider.php`
- `app/Domain/Messaging/WaProviderException.php`
- `app/Domain/Messaging/WaProviderRegistry.php`
- `app/Domain/Messaging/WaTemplateCatalog.php`
- `app/Domain/Messaging/WaTemplateResolver.php`
- `app/Domain/Messaging/WaTemplateRenderer.php`
- `app/Domain/Messaging/WaDispatchService.php`
- `app/Jobs/SendWaMessageJob.php`
- `app/Http/Controllers/Api/WaController.php`
- `app/Http/Controllers/Api/OrderController.php`
- `app/Http/Controllers/Api/SyncController.php`
- `routes/api.php`
- `tests/Unit/WaTemplateRendererTest.php`
- `tests/Feature/WaApiTest.php`
- `tests/Feature/OrderApiTest.php`
- `tests/Feature/SyncApiTest.php`

## 6) Dampak API/DB/Config
- API changes:
  - `GET /api/wa/providers`
  - `POST /api/wa/provider-config`
  - `GET /api/wa/templates`
  - `PUT /api/wa/templates/{templateId}`
  - `GET /api/wa/messages`
  - `POST /api/orders` kini enforce quota (`QUOTA_EXCEEDED`)
  - `POST /api/sync/push` mutation `ORDER_CREATE` kini enforce quota (`QUOTA_EXCEEDED`)
- DB migration:
  - Tabel baru: `wa_providers`, `wa_provider_configs`, `wa_templates`, `wa_messages`
  - Constraint penting:
    - `wa_provider_configs` unique `(tenant_id, provider_id)`
    - `wa_messages` unique `(tenant_id, idempotency_key)`
- Env/config changes:
  - Tidak ada env wajib baru.
  - Validasi di mesin ini menggunakan MySQL karena `pdo_sqlite` tidak tersedia.
- Backward compatibility: additive + behavior update pada create order untuk quota enforcement.

## 7) Testing dan Validasi
- Unit test:
  - `php artisan test --filter=WaTemplateRendererTest` -> pass (2 tests).
- Integration test:
  - `php artisan test --testsuite=Feature --filter=WaApiTest` -> pass (4 tests).
  - `php artisan test` -> pass (24 tests, 114 assertions).
- Manual verification:
  - `php artisan migrate:fresh --seed --force` -> sukses (termasuk migration WA).
  - `php artisan route:list --path=api/wa` -> 5 route WA terdaftar.
- Hasil:
  - EPIC-04 backend selesai sesuai scope.

## 8) Risiko dan Mitigasi
- Risiko utama:
  - Template custom invalid dapat membuat dispatch gagal.
  - Konfigurasi provider tidak aktif dapat membuat message gagal kirim.
- Mitigasi:
  - Validasi definition minimum pada API template.
  - Log status error per message (`last_error_code`, `last_error_message`) untuk observability.

## 9) Rollback Plan
- Revert commit EPIC-04.
- Rollback migration WA tables.
- Hapus route/controller/service/job WA dan quota gate baru jika diperlukan.

## 10) Changelog Singkat
- `2026-02-16 07:35` - Dokumen perubahan dibuat (planned).
- `2026-02-16 08:10` - Implementasi domain quota/plan gate + messaging engine selesai.
- `2026-02-16 08:30` - Integrasi order/sync + endpoint WA aktif.
- `2026-02-16 08:45` - Seluruh test pass, dokumen ditutup status done.
