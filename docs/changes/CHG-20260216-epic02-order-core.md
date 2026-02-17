# CHG-20260216-epic02-order-core

## Header
- Change ID: `CHG-20260216-epic02-order-core`
- Status: `done`
- Date: `2026-02-16`
- Owner: `codex`
- Related Ticket: `BE-010, BE-011, BE-012, BE-013, BE-014`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Mengimplementasikan EPIC-02 (Order Core Operations) di atas fondasi EPIC-01.
- Solusi yang akan/dilakukan: Tambah skema customer/service/order/payment, endpoint order core, validator status progression, payment append-only, customer upsert by phone.
- Dampak bisnis/user: Kasir/admin bisa mulai membuat order operasional end-to-end dengan guard role/outlet.

## 2) Scope
- In scope:
  - Migration core order domain (customers, services, orders, items, payments)
  - Endpoint create/list/detail order
  - Endpoint add payment append-only
  - Endpoint update laundry/courier status dengan forward-only validation
  - Endpoint assign courier
  - Customer upsert by phone normalized di order create
  - Test feature untuk flow utama
- Out of scope:
  - Sync API
  - Invoice lease/range claim
  - WA automation event enqueue

## 3) Acceptance Criteria
1. Order create menyimpan snapshot order item + total konsisten.
2. Payment hanya append (tanpa edit/delete), due terhitung benar.
3. Status laundry/courier tidak bisa mundur; invalid transition ditolak.
4. Customer dengan phone sama di tenant sama ter-upsert (tidak duplikat).
5. Assign courier hanya untuk user role courier dalam tenant yang sama.

## 4) Implementasi Teknis
- Pendekatan: Domain service sederhana + controller API transactional.
- Keputusan teknis penting: Simpan monetary value dalam integer amount.
- Trade-off: Beberapa rule lanjutan (quota/invoice lease penuh) ditunda ke EPIC berikutnya.

## 5) File yang Diubah
- `database/migrations/2026_02_16_001700_create_order_core_tables.php`
- `app/Models/Customer.php`
- `app/Models/Service.php`
- `app/Models/OutletService.php`
- `app/Models/Order.php`
- `app/Models/OrderItem.php`
- `app/Models/Payment.php`
- `app/Domain/Orders/OrderStatusTransitionValidator.php`
- `app/Http/Controllers/Api/OrderController.php`
- `routes/api.php`
- `app/Http/Middleware/EnsureOutletAccess.php`
- `app/Http/Middleware/AttachRequestContext.php`
- `app/Models/User.php`
- `database/seeders/DemoTenantSeeder.php`
- `tests/Feature/OrderApiTest.php`

## 6) Dampak API/DB/Config
- API changes:
  - `GET /api/orders`
  - `POST /api/orders`
  - `GET /api/orders/{order}`
  - `POST /api/orders/{order}/payments`
  - `POST /api/orders/{order}/status/laundry`
  - `POST /api/orders/{order}/status/courier`
  - `POST /api/orders/{order}/assign-courier`
  - `PATCH /api/orders/{order}/schedule`
  - Semua endpoint di atas berada di bawah middleware `auth:sanctum` + `outlet.access`.
- DB migration:
  - Tambah tabel: `customers`, `services`, `outlet_services`, `orders`, `order_items`, `payments`.
  - Constraint penting:
    - `customers` unique `(tenant_id, phone_normalized)`
    - `orders` unique `(tenant_id, order_code)` dan unique `(outlet_id, invoice_no)`
    - `outlet_services` unique `(outlet_id, service_id)`
- Env/config changes:
  - Tidak ada perubahan `.env` wajib baru.
  - Validasi lokal dijalankan dengan DB MySQL (`saas_laundry_dev` dan `saas_laundry_test`).
- Backward compatibility: additive changes

## 7) Testing dan Validasi
- Unit test:
  - Tidak menambah unit test terpisah; validasi utama ditutup dengan feature tests.
- Integration test:
  - `php artisan test --testsuite=Feature --filter=OrderApiTest` -> pass (6 tests, 41 assertions).
  - Skenario yang tervalidasi: total order/snapshot, upsert customer, append-only payment, status forward-only, assign courier, schedule lock cashier.
  - `php artisan test` -> pass (12 tests, 53 assertions).
- Manual verification:
  - `php artisan route:list --path=api` menampilkan endpoint order baru.
  - `php artisan migrate:fresh --seed --force` sukses dengan schema EPIC-02.
- Hasil:
  - EPIC-02 core berhasil diimplementasikan sesuai scope.
  - Catatan: di mesin ini `pdo_sqlite` tidak tersedia, sehingga test memakai MySQL.

## 8) Risiko dan Mitigasi
- Risiko utama: Kompleksitas validasi status ganda (laundry/courier).
- Mitigasi: Gunakan transition map eksplisit + test untuk valid/invalid path.

## 9) Rollback Plan
- Revert migration/controller/model yang ditambahkan pada perubahan ini.

## 10) Changelog Singkat
- `2026-02-16 00:15` - Dokumen perubahan dibuat dengan status planned.
- `2026-02-16 06:09` - Migration + model order domain ditambahkan.
- `2026-02-16 06:09` - API order/payment/status/assign/schedule ditambahkan.
- `2026-02-16 06:09` - Feature tests OrderApiTest ditambahkan dan seluruh suite test pass.
- `2026-02-16 06:09` - Dokumen perubahan ditutup dengan status done.
