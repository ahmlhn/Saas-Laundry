# UAT Web Transaction Execution Report

## Header
- Date: `2026-02-17`
- Environment: `local`
- Tester: `codex (automation-assisted)`
- Build/Commit: `workspace-local`

## 1) Ringkasan
- Total scenario: `10`
- Passed: `10`
- Failed: `0`
- Blocked: `0`
- Overall: `PASS`

## 2) Hasil Skenario

| ID | Result (Pass/Fail/Blocked) | Evidence | Notes |
|---|---|---|---|
| WEB-UAT-01 | Pass | `php artisan test --testsuite=Feature --filter=WebPanelTest` | Halaman pesanan/rute web panel tervalidasi lewat suite web panel |
| WEB-UAT-02 | Pass | `php artisan test --testsuite=Feature --filter=WebPanelTest` | Skenario create multi-item lulus (`admin can create web order with multiple items`) |
| WEB-UAT-03 | Pass | `php artisan test --testsuite=Feature --filter=WebPanelTest` | Add payment manual lulus |
| WEB-UAT-04 | Pass | `php artisan test --testsuite=Feature --filter=WebPanelTest` | Quick action bayar lunas lulus |
| WEB-UAT-05 | Pass | `php artisan test --testsuite=Feature --filter=WebTransactionFlowTest` | Laundry status bertahap sampai ready tervalidasi |
| WEB-UAT-06 | Pass | `php artisan test --testsuite=Feature --filter=WebPanelTest` | Invalid transition laundry ditolak dengan reason error |
| WEB-UAT-07 | Pass | `php artisan test --testsuite=Feature --filter=WebTransactionFlowTest` | Assignment dan transisi kurir sampai delivered lulus |
| WEB-UAT-08 | Pass | `php artisan test --testsuite=Feature --filter=WebPanelTest` | Guard delivery_pending saat laundry belum ready ditolak |
| WEB-UAT-09 | Pass | `php artisan test --testsuite=Feature --filter=WebPanelTest` | Receipt print-friendly dapat diakses |
| WEB-UAT-10 | Pass | `php artisan test --testsuite=Feature --filter=WebTransactionFlowTest` | Scope guard tenant/outlet memblokir cross-tenant access |

## 3) Temuan

| Issue ID | Severity | Summary | Repro Steps | Expected | Actual | Owner | ETA | Status |
|---|---|---|---|---|---|---|---|---|
| - | - | Tidak ada temuan high/medium pada eksekusi ini | - | - | - | - | - | - |

## 4) Keputusan Rilis
- Decision: `GO with Conditions`
- Approved by:
  - Product: `Pending manual sign-off`
  - Engineering: `codex (automation gate pass)`
  - Operations: `Pending manual sign-off`
- Conditions:
  1. Lakukan UAT manual berbasis browser oleh owner/admin menggunakan `docs/UAT_WEB_TRANSACTION_PLAYBOOK.md`.
  2. Lampirkan screenshot evidence ke report final sebelum rilis production.
