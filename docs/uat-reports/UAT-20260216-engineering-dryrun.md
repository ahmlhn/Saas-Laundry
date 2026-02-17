# UAT Findings - Engineering Dry-Run

## Header
- Project: `SaaS Laundry`
- UAT Date: `2026-02-16`
- Environment: `local`
- Tester(s): `codex (engineering dry-run)`
- Build/Commit Ref: `working tree local`

## 1) Ringkasan Eksekusi
- Total skenario: `10`
- Passed: `10`
- Failed: `0`
- Blocked: `0`
- Overall status: `PASS`

## 2) Hasil Per Skenario

| Scenario ID | Role | Result (Pass/Fail/Blocked) | Evidence Link/Ref | Notes |
|---|---|---|---|---|
| UAT-01 | Kasir | Pass | `OrderApiTest` (`create order calculates total...`) | Create order non pickup tervalidasi |
| UAT-02 | Kasir | Pass | `OrderApiTest` (`add payment is append only...`) | Payment append-only tervalidasi |
| UAT-03 | Pekerja | Pass | `OrderApiTest` (`laundry status is forward only...`) | Transisi loncat/mundur ditolak |
| UAT-04 | Admin | Pass | `OrderApiTest` (`assign courier requires...`) | Assign courier hanya role courier |
| UAT-05 | Kurir | Pass | `UatOperationalFlowTest` | Progress pickup pipeline tervalidasi |
| UAT-06 | Kurir + Pekerja | Pass | `OrderApiTest` (`assign courier requires...`) | `delivery_pending` sebelum `ready` ditolak |
| UAT-07 | Kurir | Pass | `UatOperationalFlowTest` | Delivery sampai `delivered` tervalidasi |
| UAT-08 | Owner/Admin | Pass | `MasterDataBillingApiTest` (`billing quota endpoint...`) | Snapshot quota tervalidasi |
| UAT-09 | Admin | Pass | `WaApiTest` (`order events enqueue wa messages...`) | Event WA lifecycle tervalidasi |
| UAT-10 | Semua role | Pass | `MasterDataBillingApiTest` (`services and outlet services ... role guards`) | Guard role/outlet tervalidasi |

## 3) Daftar Temuan

| Issue ID | Severity (High/Medium/Low) | Summary | Steps to Reproduce | Expected | Actual | Owner | Target Fix Date | Status |
|---|---|---|---|---|---|---|---|---|
| - | - | Tidak ada temuan pada engineering dry-run pack | - | - | - | - | - | Closed |

## 4) Keputusan Release
- UAT decision: `GO with Conditions`
- Condition:
  - Perlu UAT manual final oleh Owner/Admin/Kasir/Kurir sebelum sign-off bisnis resmi.
- Approved by:
  - Owner: `pending`
  - Admin: `pending`
  - Engineering: `done`
- Decision date: `2026-02-16`

## 5) Evidence Commands
- `php artisan test --testsuite=Feature --filter=OrderApiTest`
- `php artisan test --testsuite=Feature --filter=UatOperationalFlowTest`
- `php artisan test --testsuite=Feature --filter=MasterDataBillingApiTest`
- `php artisan test --testsuite=Feature --filter=WaApiTest`
