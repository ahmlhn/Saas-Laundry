# Web Transaction Release Checklist

Checklist ini dipakai untuk gate rilis fitur transaksi web.

## 1) Quality Gate Otomatis
- [x] `php artisan test --testsuite=Feature --filter=WebPanelTest` pass
- [x] `php artisan test --testsuite=Feature --filter=WebTransactionFlowTest` pass
- [x] `php artisan test` pass penuh
- [x] `npm run build` pass

## 2) Functional Gate
- [x] Create order web (multi-item) tervalidasi
- [x] Add payment manual + quick action tervalidasi
- [x] Status laundry detail order tervalidasi
- [x] Status courier detail order tervalidasi
- [x] Assignment courier detail order tervalidasi
- [x] Print receipt web tervalidasi
- [x] Guard scope tenant/outlet tervalidasi
- [x] Guard invalid transition + reason message tervalidasi

## 3) UAT Gate
- [x] UAT dijalankan memakai `docs/UAT_WEB_TRANSACTION_PLAYBOOK.md`
- [x] Evidence report tersimpan di `docs/uat-reports/`
- [x] Tidak ada temuan severity `High`
- [ ] Sign-off Owner/Admin didokumentasikan

## 4) Operational Gate
- [x] `php artisan ops:readiness:check --strict` pass
- [ ] Queue worker aktif (`queue:work` / supervisor)
- [ ] `php artisan ops:observe:health --strict` pass
- [ ] Dry run reminder WA aging (`php artisan ops:wa:send-aging-reminders --dry-run`) tervalidasi
- [x] SOP operasional diperbarui jika ada perubahan flow

## 5) Release Decision
- Release decision: `GO with Conditions`
- Tanggal keputusan: `2026-02-17`
- PIC Product: `Pending Owner/Admin sign-off`
- PIC Engineering: `codex`
- Catatan:
  1. Menunggu sign-off manual Owner/Admin.
  2. Pastikan worker queue aktif di environment target sebelum go-live.

## 6) Bukti Sign-off Manual
- Owner:
  - Nama:
  - Tanggal/Jam:
  - Catatan:
- Admin:
  - Nama:
  - Tanggal/Jam:
  - Catatan:

## 7) Bukti Worker/Supervisor
- Queue backend (`QUEUE_CONNECTION`):
- Command worker/supervisor:
- PID / service name:
- Terakhir restart (`php artisan queue:restart`):
- Verifikasi backlog (`php artisan ops:observe:health`):
