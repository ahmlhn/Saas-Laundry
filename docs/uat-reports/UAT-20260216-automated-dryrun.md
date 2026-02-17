# UAT Findings - Automated Pack

## Header
- Project: `SaaS Laundry`
- UAT Date: `2026-02-16`
- Environment: `local`
- Tester(s): `ops:uat:run (automated)`
- Build/Commit Ref: `working tree local`

## 1) Ringkasan Eksekusi
- Total skenario: `10`
- Passed: `0`
- Failed: `0`
- Blocked: `10`
- Overall status: `BLOCKED`

## 2) Hasil Per Skenario

| Scenario ID | Role | Result (Pass/Fail/Blocked) | Evidence Link/Ref | Notes |
|---|---|---|---|---|
| UAT-01 | Kasir | Blocked | Not executed (`--dry-run`) | Create order non pickup |
| UAT-02 | Kasir | Blocked | Not executed (`--dry-run`) | Payment append-only |
| UAT-03 | Pekerja | Blocked | Not executed (`--dry-run`) | Laundry forward-only transitions |
| UAT-04 | Admin | Blocked | Not executed (`--dry-run`) | Assign courier role validation |
| UAT-05 | Kurir | Blocked | Not executed (`--dry-run`) | Pickup flow progression |
| UAT-06 | Kurir + Pekerja | Blocked | Not executed (`--dry-run`) | delivery_pending blocked before ready |
| UAT-07 | Kurir | Blocked | Not executed (`--dry-run`) | Delivery flow progression |
| UAT-08 | Owner/Admin | Blocked | Not executed (`--dry-run`) | Billing quota endpoint |
| UAT-09 | Admin | Blocked | Not executed (`--dry-run`) | WA lifecycle message logs |
| UAT-10 | Semua role | Blocked | Not executed (`--dry-run`) | Role guard on master data |

## 3) Daftar Temuan

| Issue ID | Severity (High/Medium/Low) | Summary | Steps to Reproduce | Expected | Actual | Owner | Target Fix Date | Status |
|---|---|---|---|---|---|---|---|---|
| - | - | Isi jika ada temuan pada eksekusi ini | - | - | - | - | - | Open/Closed |

## 4) Keputusan Release
- UAT decision: `PENDING`
- Approved by:
  - Owner: `pending`
  - Admin: `pending`
  - Engineering: `auto`
- Decision date: `2026-02-16`

## 5) Evidence Command
- `php artisan ops:uat:run --seed-demo`
