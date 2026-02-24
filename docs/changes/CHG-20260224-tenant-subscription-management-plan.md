# CHG-20260224-tenant-subscription-management-plan

## Header
- Change ID: `CHG-20260224-tenant-subscription-management-plan`
- Status: `planned`
- Date: `2026-02-24`
- Owner: `codex`
- Related Ticket: `SUBS-PLAN-001`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Sistem saat ini sudah punya plan/quota dasar tetapi belum punya lifecycle langganan tenant lengkap (upgrade/downgrade/renewal/payment verification/suspend-activate).
- Solusi yang akan dilakukan: Menambah domain subscription cycle 30 hari, invoice renewal manual payment proof, approval superadmin, enforcement read-only saat unpaid/suspended, dan antarmuka web+mobile.
- Dampak bisnis/user: Owner tenant bisa self-service langganan; platform punya kontrol verifikasi dan audit yang rapi; enforcement kuota lebih akurat per cycle.

## 2) Scope
- In scope:
- Backend: subscription cycle, invoice, proof, verification, plan change request, quota cycle usage, scheduler jobs, migration legacy.
- Web tenant: halaman langganan owner.
- Web platform: panel superadmin untuk verifikasi dan kontrol status tenant.
- Mobile: menu/subscription center untuk owner tenant.
- Out of scope:
- Payment gateway/webhook otomatis.
- Entitlement di luar `order quota + WA`.
- Omnichannel billing lain.

## 3) Acceptance Criteria
1. Dokumen plan tersedia di `docs/changes` dengan status `planned` dan format mengikuti template repo.
2. Seluruh keputusan produk/teknis yang sudah disepakati tercatat eksplisit tanpa keputusan implementasi yang tersisa.
3. Rencana mencakup backend, web tenant, web platform, mobile, migrasi legacy, test scenario, risiko, dan rollback dokumentasi.

## 4) Implementasi Teknis
- Pendekatan: Menyusun rencana implementasi decision-complete sebagai change doc sebelum coding runtime dimulai.
- Keputusan teknis penting:
- API tenant planned:
- `GET /api/subscriptions/current`
- `GET /api/subscriptions/plans`
- `POST /api/subscriptions/change-request`
- `DELETE /api/subscriptions/change-request/{id}`
- `GET /api/subscriptions/invoices`
- `GET /api/subscriptions/invoices/{id}`
- `POST /api/subscriptions/invoices/{id}/proof`
- API platform planned:
- `GET /api/platform/subscriptions/tenants`
- `GET /api/platform/subscriptions/tenants/{tenant}`
- `POST /api/platform/subscriptions/invoices/{id}/verify`
- `POST /api/platform/subscriptions/tenants/{tenant}/suspend`
- `POST /api/platform/subscriptions/tenants/{tenant}/activate`
- Kompatibilitas:
- `GET /api/billing/quota` tetap dipertahankan, ditambah field cycle/subscription state.
- Type/interface planned:
- `AuthUser.tenant_id` menjadi nullable.
- Tambah `workspace` context (`tenant|platform`) di session payload.
- Tambah type `SubscriptionCurrent`, `SubscriptionInvoice`, `PlanChangeRequest`.
- Rencana data model:
- Tabel baru planned:
- `subscription_cycles`
- `subscription_change_requests`
- `subscription_invoices`
- `subscription_payment_proofs`
- `quota_usage_cycles`
- Tabel existing planned update:
- `plans` tambah harga/aktif/order.
- `tenants` tambah pointer cycle aktif + subscription state + write access mode.
- `roles` tambah `platform_owner`, `platform_billing`.
- Legacy `tenant_subscriptions` + `quota_usage` dipertahankan sementara untuk kompatibilitas report.
- Trade-off:
- Kompleksitas transisi meningkat karena perlu migrasi dari model period `YYYY-MM` ke rolling cycle.
- Panel platform menambah surface area auth/RBAC dan butuh guard terpisah dari tenant guard.

## 5) File yang Akan/Diubah
- `docs/changes/CHG-20260224-tenant-subscription-management-plan.md`

## 6) Dampak API/DB/Config
- API changes: additive (endpoint baru + field kompatibilitas).
- DB migration: ada, termasuk migrasi legacy ke cycle model.
- Env/config changes: storage private untuk bukti bayar, limit upload file, scheduler command baru.
- Backward compatibility: endpoint existing tetap tersedia; mobile/web lama tetap bisa baca quota inti.

## 7) Testing dan Validasi
- Test scenario implementasi yang harus dipenuhi:
- Owner bisa submit plan change next-cycle, role lain ditolak.
- Upload proof valid/invalid file.
- Platform approve/reject proof mengubah invoice + status tenant.
- Tenant suspended masuk read-only operasional.
- Order create gagal saat tenant non-aktif.
- Renewal invoice otomatis dibuat H-7.
- Migrasi legacy idempotent dan tidak duplikasi cycle aktif.
- `GET /api/billing/quota` tetap kompatibel untuk client lama.
- Validasi dokumen:
- Struktur mengikuti `docs/CHANGE_DOC_TEMPLATE.md`.
- Semua keputusan produk yang sudah dipilih tercatat eksplisit.
- Tidak ada keputusan implementasi penting yang tersisa.
- Unit test: tidak relevan pada tahap ini (dokumentasi-only).
- Integration test: tidak relevan pada tahap ini (dokumentasi-only).
- Manual verification: review kelengkapan isi terhadap keputusan yang dikunci.
- Hasil: menunggu implementasi runtime pada change lanjutan.

## 8) Risiko dan Mitigasi
- Risiko: transisi dari model period `YYYY-MM` ke rolling cycle mengganggu kuota.
- Mitigasi: command migrasi idempotent + dry-run + reconcile job.
- Risiko: account platform (`tenant_id = null`) bentrok guard existing.
- Mitigasi: workspace guard dan middleware platform terpisah.
- Risiko: rollout web/mobile tidak sinkron.
- Mitigasi: fase release bertahap (backend dulu, lalu web, lalu mobile).

## 9) Rollback Plan
- Jika rencana dibatalkan, cukup hapus dokumen change ini.
- Tidak ada rollback runtime karena tahap ini dokumentasi-only.

## 10) Changelog Singkat
- `2026-02-24 15:10` - Dokumen rencana dibuat status `planned`.
- `2026-02-24 15:18` - Keputusan produk/teknis dikunci (rolling 30 hari, manual verification, read-only delinquency, web+mobile scope).

## 11) Asumsi dan Default yang Dikunci
- Model langganan: rolling 30 hari.
- Perubahan paket: berlaku next cycle only.
- Delinquency: block write operasional (read-only).
- Auto-renew: default ON.
- Renewal invoice: H-7.
- Harga paket: dari katalog plan, tax-inclusive.
- Metode bayar manual: transfer bank.
- Bukti bayar: upload file + verifikasi superadmin.
- Aktor tenant untuk aksi langganan: owner saja.
- Aktor platform: user global tanpa tenant (`tenant_id = null`).
- Entitlement fase ini: order quota + WA saja.
