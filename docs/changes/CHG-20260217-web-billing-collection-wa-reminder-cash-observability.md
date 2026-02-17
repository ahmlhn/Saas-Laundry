# CHG-20260217-web-billing-collection-wa-reminder-cash-observability

## Header
- Change ID: `CHG-20260217-web-billing-collection-wa-reminder-cash-observability`
- Status: `done`
- Date: `2026-02-17`
- Owner: `codex`
- Related Ticket: `WEB-TX-OPS-005`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Paket lanjutan operasional web (1-5) belum tuntas: workflow penagihan aging, reminder WA otomatis, rekonsiliasi kas harian, observability command, dan penguatan checklist go-live.
- Solusi yang dilakukan: Menambahkan workflow collection di Billing, command reminder WA aging, laporan kas harian + export CSV, command observability health, serta pembaruan runbook/checklist release.
- Dampak bisnis/user: Tim owner/admin bisa menindaklanjuti piutang langsung di web, melakukan reminder terjadwal, dan memonitor kesehatan operasional dari command standar.

## 2) Scope
- In scope:
  - Workflow penagihan aging berbasis status + jadwal follow-up + catatan.
  - Endpoint update collection dari panel Billing.
  - Filter collection status dan rekonsiliasi kas harian di Billing.
  - Export CSV baru dataset `cash_daily`.
  - Template default `WA_BILLING_REMINDER`.
  - Command `ops:wa:send-aging-reminders`.
  - Command `ops:observe:health`.
  - Baseline schedule command baru.
  - Update docs operasional/go-live.
- Out of scope:
  - Integrasi provider WA production pihak ketiga.
  - Integrasi akuntansi eksternal/GL otomatis.
  - Dashboard grafik observability real-time.

## 3) Acceptance Criteria
1. Admin/owner bisa update workflow collection order aging dari web Billing.
2. Filter collection status memengaruhi daftar aging detail.
3. Export `dataset=cash_daily` menghasilkan CSV rekonsiliasi kas harian.
4. Command reminder WA aging bisa dieksekusi dan membuat message template `WA_BILLING_REMINDER`.
5. Command observability mengeluarkan ringkasan check queue/WA/quota.

## 4) Implementasi Teknis
- Menambahkan migration field collection pada tabel `orders`:
  - `collection_status`
  - `collection_last_contacted_at`
  - `collection_next_follow_up_at`
  - `collection_note`
- Menambahkan route update collection:
  - `POST /t/{tenant}/billing/collections/{order}`
- Billing controller:
  - Filter baru `collection_status` dan `cash_date`.
  - Data rekonsiliasi kas harian + detail method breakdown.
  - Export dataset `cash_daily`.
  - Action update workflow collection + audit event `ORDER_COLLECTION_UPDATED`.
- WA:
  - `WA_BILLING_REMINDER` ditambahkan pada template catalog.
  - `WaDispatchService` ditambah dukungan `idempotency_suffix`.
  - Command baru `ops:wa:send-aging-reminders` untuk enqueue reminder per bucket aging.
- Observability:
  - Command baru `ops:observe:health` untuk failed jobs, backlog queue, rasio WA failed, dan saturation quota.
  - Scheduler baseline diperbarui.

## 5) File yang Diubah
- `database/migrations/2026_02_17_190000_add_collection_fields_to_orders_table.php`
- `app/Models/Order.php`
- `app/Domain/Audit/AuditEventKeys.php`
- `routes/web.php`
- `app/Http/Controllers/Web/BillingController.php`
- `resources/views/web/billing/index.blade.php`
- `resources/css/app.css`
- `app/Domain/Messaging/WaTemplateCatalog.php`
- `app/Domain/Messaging/WaDispatchService.php`
- `app/Console/Commands/SendAgingWaRemindersCommand.php`
- `app/Console/Commands/ObservabilityHealthCheckCommand.php`
- `routes/console.php`
- `app/Console/Commands/StagingReadinessCheckCommand.php`
- `tests/Feature/WebPanelTest.php`
- `tests/Feature/OpsCommandsTest.php`
- `docs/WEB_TRANSACTION_RELEASE_CHECKLIST.md`
- `docs/OPERATIONS_RUNBOOK.md`
- `docs/OBSERVABILITY_BASELINE.md`
- `docs/changes/CHG-20260217-web-billing-collection-wa-reminder-cash-observability.md`

## 6) Dampak API/DB/Config
- API changes: tidak ada endpoint API publik baru.
- Web changes: route baru update collection di panel Billing.
- DB migration: ada (`orders` collection fields + index).
- Config/env changes: tidak ada variabel env baru.
- Backward compatibility: additive.

## 7) Testing dan Validasi
- Feature test terarah:
  - `php artisan test --testsuite=Feature --filter=WebPanelTest` -> pass (`58 passed`).
  - `php artisan test --testsuite=Feature --filter=OpsCommandsTest` -> pass (`9 passed`).
- Full test:
  - `php artisan test` -> pass (`109 passed`).
- Build:
  - `npm run build` -> pass.

## 8) Risiko dan Mitigasi
- Risiko: Reminder WA berulang jika command dipanggil berulang dalam hari yang sama.
- Mitigasi: idempotency key ditambah suffix berbasis tanggal + bucket.
- Risiko: User salah tafsir rekonsiliasi kas sebagai laporan akuntansi final.
- Mitigasi: Label laporan tetap sebagai rekonsiliasi operasional harian, bukan buku besar.

## 9) Rollback Plan
- Revert migration collection fields jika diperlukan.
- Hapus route/action collection update billing.
- Hapus command `ops:wa:send-aging-reminders` dan `ops:observe:health`.
- Kembalikan template catalog dan export dataset billing ke baseline sebelumnya.

## 10) Changelog Singkat
- `2026-02-17 20:05` - Workflow collection aging + rekonsiliasi kas harian Billing diimplementasikan.
- `2026-02-17 20:22` - Command reminder WA aging + observability health ditambahkan.
- `2026-02-17 20:41` - Test terarah, full test, dan build frontend lulus; dokumentasi operasional diperbarui.
