# CHG-20260224-bri-qris-auto-billing

## Header
- Change ID: `CHG-20260224-bri-qris-auto-billing`
- Status: `done`
- Date: `2026-02-24`
- Owner: `codex`
- Related Ticket: `SUBS-PLAN-002`

## 1) Ringkasan Perubahan
- Masalah/tujuan: flow pembayaran langganan masih manual (`bank_transfer` + upload proof + approval platform), belum auto-verify.
- Solusi yang dilakukan: menambahkan integrasi gateway `bri_qris` untuk dynamic intent per invoice, webhook auto-verify idempotent, status enforcement `H_PLUS_1`, dan dashboard event gateway untuk platform (API + web + mobile).
- Dampak bisnis/user: owner tenant bisa bayar QRIS tanpa approval manual, platform mendapat event log pembayaran yang dapat diaudit, suspend/reactivate berjalan otomatis.

## 2) Scope
- In scope:
- Backend subscription payment gateway (`intent`, `event`, webhook, reconcile, suspend policy).
- API tenant (`qris-intent`, `payment-status`) + compatibility endpoint lama.
- API platform (`payment events`) + tenant detail enrichment.
- Web tenant + web platform adjustment untuk mode pembayaran gateway.
- Mobile tenant + mobile platform update untuk QRIS status dan event gateway.
- Out of scope:
- Multi-provider failover.
- Otomasi settlement di luar BRI QRIS.

## 3) Acceptance Criteria
1. Tenant owner dapat generate QRIS intent untuk invoice `bri_qris`.
2. Webhook valid menandai invoice `paid` dan tenant aktif otomatis; duplicate webhook idempotent.
3. Policy delinquency `H_PLUS_1` mengubah tenant unpaid menjadi `suspended/read_only`.
4. Tenant/platform bisa melihat status gateway dan event log pembayaran.

## 4) Implementasi Teknis
- Pendekatan:
- Tambah model data payment gateway terpisah: `subscription_payment_intents` dan `subscription_payment_events`.
- Tambah service domain untuk lifecycle QRIS intent, verifikasi signature webhook, validasi amount exact, reaktivasi tenant, dan reconcile.
- Pertahankan flow legacy `bank_transfer` (proof upload + manual verify) untuk invoice lama.
- Keputusan teknis penting:
- Endpoint webhook publik: `POST /api/payments/bri/qris/webhook`.
- Signature webhook memakai `X-BRI-Signature` (HMAC SHA-256, secret dari env).
- Auto-verify hanya untuk `payment_method=bri_qris`.
- Manual verify platform ditolak untuk invoice gateway (`AUTO_VERIFIED_GATEWAY`).
- Upload proof ditolak untuk invoice gateway (`LEGACY_PROOF_ONLY`).
- Trade-off:
- Integrasi HTTP BRI dibuat resilient dengan mode simulated saat kredensial env belum diisi.
- Suspend otomatis mengandalkan state domain yang sama dengan suspend manual (tanpa reason flag terpisah).

## 5) File yang Diubah
- `config/subscription.php`
- `.env.example`
- `database/migrations/2026_02_24_220100_add_bri_gateway_subscription_payment_tables.php`
- `app/Domain/Subscription/BriQrisGatewayClient.php`
- `app/Domain/Subscription/SubscriptionPaymentGatewayService.php`
- `app/Models/SubscriptionInvoice.php`
- `app/Models/SubscriptionPaymentIntent.php`
- `app/Models/SubscriptionPaymentEvent.php`
- `app/Models/Tenant.php`
- `app/Http/Controllers/Api/SubscriptionController.php`
- `app/Http/Controllers/Api/PlatformSubscriptionController.php`
- `app/Http/Controllers/Api/BriPaymentWebhookController.php`
- `app/Http/Controllers/Web/SubscriptionController.php`
- `app/Http/Controllers/Web/Platform/SubscriptionController.php`
- `app/Console/Commands/GenerateSubscriptionRenewalInvoicesCommand.php`
- `app/Console/Commands/EnforceSubscriptionStatusCommand.php`
- `app/Console/Commands/ReconcileSubscriptionPaymentsCommand.php`
- `routes/api.php`
- `routes/console.php`
- `routes/web.php`
- `resources/views/web/subscription/index.blade.php`
- `resources/views/web/platform/subscriptions/show.blade.php`
- `mobile/src/types/subscription.ts`
- `mobile/src/features/subscription/subscriptionApi.ts`
- `mobile/src/features/subscription/platformSubscriptionApi.ts`
- `mobile/src/screens/app/SubscriptionCenterScreen.tsx`
- `mobile/src/screens/app/PlatformSubscriptionHubScreen.tsx`
- `tests/Feature/SubscriptionApiTest.php`

## 6) Dampak API/DB/Config
- API changes:
- New: `POST /api/subscriptions/invoices/{id}/qris-intent`
- New: `GET /api/subscriptions/invoices/{id}/payment-status`
- New: `POST /api/payments/bri/qris/webhook`
- New: `GET /api/platform/subscriptions/payments/events`
- Existing update: `GET /api/subscriptions/invoices/{id}` menambah metadata gateway.
- Existing update: `GET /api/platform/subscriptions/tenants/{tenant}` menambah `latest_gateway_transaction`.
- Existing update: `POST /api/subscriptions/invoices/{id}/proof` legacy only untuk `bank_transfer`.
- DB migration:
- Add table `subscription_payment_intents`.
- Add table `subscription_payment_events` dengan unique idempotency `gateway_event_id`.
- Add metadata kolom gateway pada `subscription_invoices`.
- Env/config changes:
- `BRI_API_BASE_URL`, `BRI_CLIENT_ID`, `BRI_CLIENT_SECRET`, `BRI_MERCHANT_ID`, `BRI_WEBHOOK_SECRET`
- `BILLING_GATEWAY_PROVIDER`, `SUBSCRIPTION_SUSPEND_POLICY`
- Backward compatibility:
- Invoice legacy `bank_transfer` tetap didukung.
- Endpoint existing tidak dihapus.

## 7) Testing dan Validasi
- Unit/feature test:
- Added scenario di `tests/Feature/SubscriptionApiTest.php`:
- QRIS intent creation sukses.
- Valid webhook -> paid + activate.
- Duplicate webhook idempotent.
- Invalid signature rejected.
- Amount mismatch tidak mengaktifkan tenant.
- Enforce `H_PLUS_1` suspend + webhook paid reactivates.
- Platform payment events endpoint bisa dibaca.
- Reconcile payments command sinkronkan invoice dari event.
- Legacy proof upload tetap jalan + ditolak untuk `bri_qris`.
- Manual verification:
- Web tenant menampilkan info QRIS + refresh intent.
- Web platform menampilkan gateway payment event log.
- Mobile tenant/platform menampilkan status dan event gateway.

## 8) Risiko dan Mitigasi
- Risiko: mismatch payload BRI real dengan shape generic parser.
- Mitigasi: parser menerima beberapa alias field + reconcile command + event log detail.
- Risiko: suspend otomatis bisa berbenturan dengan suspend manual.
- Mitigasi: monitoring event + state; domain reason code bisa dipisah di fase lanjutan.
- Risiko: webhook hilang/intermiten.
- Mitigasi: command `ops:subscription:reconcile-payments` dijadwalkan periodik.

## 9) Rollback Plan
- Disable gateway dengan set `BILLING_GATEWAY_PROVIDER=bank_transfer`.
- Hentikan webhook routing di edge (ops) dan nonaktifkan schedule reconcile payment jika perlu.
- Jika rollback schema diperlukan: rollback migration `2026_02_24_220100_add_bri_gateway_subscription_payment_tables`.

## 10) Changelog Singkat
- `2026-02-24 22:05` - Menambahkan model/table payment intents + payment events dan metadata gateway invoice.
- `2026-02-24 22:26` - Menambahkan endpoint QRIS intent, payment status, webhook auto-verify, platform payment events.
- `2026-02-24 22:41` - Menyambungkan enforcement H+1, reconcile payment command, web/mobile dashboard update, dan test skenario gateway.
