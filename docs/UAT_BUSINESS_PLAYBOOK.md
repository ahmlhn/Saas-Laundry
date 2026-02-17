# UAT Business Playbook

Dokumen ini dipakai untuk UAT operasional lintas role sebelum go-live.

## 1) Tujuan
- Memvalidasi alur bisnis utama dari sudut pandang user operasional.
- Memastikan RBAC dan scope outlet berjalan sesuai matriks.
- Memastikan notifikasi WA, status order, dan pembayaran konsisten.

## 2) Prasyarat
- Jalankan:
  - `php artisan migrate --seed --force`
  - `php artisan ops:readiness:check --strict`
  - (opsional otomatis) `php artisan ops:uat:run --seed-demo`
- Tenant demo:
  - `Demo Laundry`
- Outlet demo:
  - `BL` (`Outlet Utama`)

## 3) Akun UAT
- Password semua akun: `password`
- `owner@demo.local`
- `admin@demo.local`
- `cashier@demo.local`
- `worker@demo.local`
- `courier@demo.local`

## 4) Skenario UAT (Core)

| ID | Role Utama | Skenario | Hasil yang Diharapkan |
|---|---|---|---|
| UAT-01 | Kasir | Login dan create order non pickup | Order berhasil dibuat, `laundry_status=received`, total dan due benar |
| UAT-02 | Kasir | Tambah payment 2 kali | Payment append-only, `paid_amount` dan `due_amount` update benar |
| UAT-03 | Pekerja | Ubah status `received -> washing -> drying -> ironing -> ready` | Semua transisi valid diterima, transisi loncat/mundur ditolak |
| UAT-04 | Admin | Assign courier untuk order pickup-delivery | Hanya user role courier yang bisa di-assign |
| UAT-05 | Kurir | Ubah status `pickup_pending -> pickup_on_the_way -> picked_up -> at_outlet` | Semua transisi valid diterima |
| UAT-06 | Kurir + Pekerja | Kurir set `delivery_pending` sebelum laundry `ready` | Ditolak dengan `INVALID_TRANSITION` |
| UAT-07 | Kurir | Lanjut `delivery_pending -> delivery_on_the_way -> delivered` setelah ready | Semua transisi valid diterima |
| UAT-08 | Owner/Admin | Cek billing quota endpoint | Data period, used, remaining tampil benar |
| UAT-09 | Admin | Cek WA log setelah event order pickup | Event WA utama muncul: pickup confirm/otw, laundry ready, delivery otw, done |
| UAT-10 | Semua role | Coba akses fitur di luar role | Ditolak dengan `ROLE_ACCESS_DENIED` atau `OUTLET_ACCESS_DENIED` |

## 5) Skenario WA (Jika Plan Premium/Pro)
- Jika tenant belum Premium/Pro, upgrade plan dulu sebelum menjalankan skenario WA.
- Skenario minimum:
  - set provider config aktif (`mock`)
  - buat order pickup-delivery
  - jalankan transisi status hingga delivered
  - cek `wa_messages` untuk template:
    - `WA_PICKUP_CONFIRM`
    - `WA_PICKUP_OTW`
    - `WA_LAUNDRY_READY`
    - `WA_DELIVERY_OTW`
    - `WA_ORDER_DONE`

## 6) Bukti yang Dikumpulkan
- Screenshot/recording tiap skenario pass/fail.
- Request/response payload untuk kasus gagal.
- Query log untuk audit events jika ada anomaly.
- Isi hasil ke `docs/UAT_FINDINGS_TEMPLATE.md`.
- Simpan report final per eksekusi di `docs/uat-reports/` dengan nama:
  - `UAT-YYYYMMDD-<env-or-batch>.md`

## 7) Kriteria Lulus UAT
- Seluruh skenario critical (UAT-01 s.d UAT-07) lulus.
- Tidak ada temuan severity `High`.
- Temuan `Medium/Low` memiliki owner dan target fix date.
- Sign-off Owner dan Admin tersedia.
