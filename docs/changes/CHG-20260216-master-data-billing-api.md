# CHG-20260216-master-data-billing-api

## Header
- Change ID: `CHG-20260216-master-data-billing-api`
- Status: `done`
- Date: `2026-02-16`
- Owner: `codex`
- Related Ticket: `BE-040, BE-041, BE-042, BE-043, BE-044, BE-045`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Menutup gap endpoint MVP pada area master data dan billing quota.
- Solusi yang akan/dilakukan: Tambah endpoint outlets allowed, customers CRUD dasar, services list, outlet services list/update, shipping zones list/create, dan billing quota endpoint.
- Dampak bisnis/user: Kasir/admin/owner mendapat API master data yang lengkap untuk operasional web/mobile MVP.

## 2) Scope
- In scope:
  - `GET /api/outlets/allowed`
  - `GET /api/customers`
  - `POST /api/customers`
  - `PATCH /api/customers/{id}`
  - `GET /api/services`
  - `GET /api/outlet-services`
  - `PATCH /api/outlet-services/{id}`
  - `GET /api/shipping-zones`
  - `POST /api/shipping-zones`
  - `GET /api/billing/quota`
  - Migration/model shipping zones
  - Feature tests endpoint baru
- Out of scope:
  - CRUD penuh services/outlets/users
  - Shipping zones advanced policy engine

## 3) Acceptance Criteria
1. Endpoint master data sesuai matrix tersedia dan scoped by tenant/outlet.
2. Role guard sesuai MVP matrix aktif.
3. Billing quota endpoint menampilkan period, usage, remaining, eligibility.
4. Shipping zone dapat dibuat dan dilist per outlet.

## 4) Implementasi Teknis
- Pendekatan: controller API terpisah per domain + reuse `QuotaService`.
- Keputusan teknis penting: shipping zone additive table `shipping_zones` dengan amount integer.
- Trade-off: update shipping zone belum disediakan (hanya list/create sesuai matrix).

## 5) File yang Diubah
- `database/migrations/2026_02_16_120500_create_shipping_zones_table.php`
- `app/Models/ShippingZone.php`
- `app/Models/Outlet.php`
- `app/Models/Service.php`
- `app/Http/Controllers/Api/Concerns/EnsuresApiAccess.php`
- `app/Http/Controllers/Api/OutletContextController.php`
- `app/Http/Controllers/Api/CustomerController.php`
- `app/Http/Controllers/Api/ServiceCatalogController.php`
- `app/Http/Controllers/Api/OutletServiceController.php`
- `app/Http/Controllers/Api/ShippingZoneController.php`
- `app/Http/Controllers/Api/BillingController.php`
- `routes/api.php`
- `tests/Feature/MasterDataBillingApiTest.php`

## 6) Dampak API/DB/Config
- API changes:
  - `GET /api/outlets/allowed`
  - `GET /api/customers`
  - `POST /api/customers`
  - `PATCH /api/customers/{customer}`
  - `GET /api/services`
  - `GET /api/outlet-services`
  - `PATCH /api/outlet-services/{outletService}`
  - `GET /api/shipping-zones`
  - `POST /api/shipping-zones`
  - `GET /api/billing/quota`
- DB migration: tabel `shipping_zones`.
- Env/config changes:
  - Tidak ada env wajib baru.
  - Untuk environment ini, test dijalankan dengan override MySQL karena `pdo_sqlite` tidak tersedia.
- Backward compatibility: additive.

## 7) Testing dan Validasi
- Unit test:
  - Tidak ada unit test baru khusus domain ini.
- Integration test:
  - `php artisan test --testsuite=Feature --filter=MasterDataBillingApiTest` -> pass (5 tests, 32 assertions) dengan env DB MySQL override.
  - `php artisan test` -> pass (40 tests, 199 assertions) dengan env DB MySQL override.
- Manual verification:
  - `php artisan migrate --force` -> migration `2026_02_16_120500_create_shipping_zones_table` sukses.
  - `php artisan route:list --path=api` -> seluruh endpoint master data + billing terdaftar.
- Hasil:
  - Scope perubahan selesai dan tervalidasi.
  - Role guard + outlet scope endpoint bekerja sesuai acceptance criteria.

## 8) Risiko dan Mitigasi
- Risiko utama: leakage outlet scope pada user non-owner.
- Mitigasi: validasi outlet access eksplisit per endpoint.

## 9) Rollback Plan
- Revert migration/controller/model/route/test perubahan ini.

## 10) Changelog Singkat
- `2026-02-16 11:58` - Dokumen perubahan dibuat dengan status planned.
- `2026-02-16 12:20` - Endpoint master data dan billing quota diimplementasikan.
- `2026-02-16 12:35` - Migration shipping zones + test feature `MasterDataBillingApiTest` tervalidasi.
- `2026-02-16 12:55` - Full test suite pass di MySQL test database dan dokumen ditutup status done.
