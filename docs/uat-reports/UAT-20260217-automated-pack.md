# UAT Findings - Automated Pack

## Header
- Project: `SaaS Laundry`
- UAT Date: `2026-02-17`
- Environment: `local`
- Tester(s): `ops:uat:run (automated)`
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
| UAT-01 | Kasir | Pass | `test_create_order_calculates_total_and_normalizes_customer_phone` (ok) | Create order non pickup |
| UAT-02 | Kasir | Pass | `test_add_payment_is_append_only_and_updates_due_amount` (ok) | Payment append-only |
| UAT-03 | Pekerja | Pass | `test_laundry_status_is_forward_only_and_rejects_invalid_jump` (ok) | Laundry forward-only transitions |
| UAT-04 | Admin | Pass | `test_assign_courier_requires_courier_role_and_status_rules` (ok) | Assign courier role validation |
| UAT-05 | Kurir | Pass | `test_operational_pickup_delivery_flow_runs_end_to_end` (ok) | Pickup flow progression |
| UAT-06 | Kurir + Pekerja | Pass | `test_assign_courier_requires_courier_role_and_status_rules` (ok) | delivery_pending blocked before ready |
| UAT-07 | Kurir | Pass | `test_operational_pickup_delivery_flow_runs_end_to_end` (ok) | Delivery flow progression |
| UAT-08 | Owner/Admin | Pass | `test_billing_quota_endpoint_returns_snapshot_and_restricts_role` (ok) | Billing quota endpoint |
| UAT-09 | Admin | Pass | `test_order_events_enqueue_wa_messages_for_premium_plan` (ok) | WA lifecycle message logs |
| UAT-10 | Semua role | Pass | `test_services_and_outlet_services_endpoints_work_with_role_guards` (ok) | Role guard on master data |

## 3) Daftar Temuan

| Issue ID | Severity (High/Medium/Low) | Summary | Steps to Reproduce | Expected | Actual | Owner | Target Fix Date | Status |
|---|---|---|---|---|---|---|---|---|
| - | - | Isi jika ada temuan pada eksekusi ini | - | - | - | - | - | Open/Closed |

## 4) Keputusan Release
- UAT decision: `GO with Conditions`
- Approved by:
  - Owner: `pending`
  - Admin: `pending`
  - Engineering: `auto`
- Decision date: `2026-02-17`

## 5) Evidence Command
- `php artisan ops:uat:run --seed-demo`
