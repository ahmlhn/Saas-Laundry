# CHG-20260226 Mobile Order Receipt + WA Created Notification

## Ringkasan
- Fokus lanjutan setelah pembayaran manual:
  - Tambah aksi `Cetak Nota Produksi` dan `Cetak Nota Konsumen` pada detail order (mobile).
  - Tambah aksi `Kirim WA Pesanan` dari detail order sebagai fallback manual.
  - Aktifkan notifikasi WA saat order dibuat untuk semua order (pickup dan non-pickup), tetap mengikuti gating plan WA.

## Perubahan Teknis

### Backend
- `app/Http/Controllers/Api/OrderController.php`
  - Event WA `WA_PICKUP_CONFIRM` sekarang di-enqueue pada semua order creation.
  - Sebelumnya hanya berjalan saat `is_pickup_delivery = true`.

### Mobile
- `mobile/src/features/orders/orderReceipt.ts` (baru)
  - Builder teks nota:
    - `production` (internal, tanpa harga)
    - `customer` (dengan ringkasan tagihan)
  - Builder teks pesan WA order.

- `mobile/src/screens/app/OrderDetailScreen.tsx`
  - Panel baru `Nota & Notifikasi`:
    - `Cetak Nota Produksi` -> share sheet (bisa pilih print service jika tersedia di device)
    - `Cetak Nota Konsumen` -> share sheet
    - `Kirim WA Pesanan` -> buka WhatsApp dengan pesan terisi
  - Hint status WA otomatis berdasarkan eligibility plan.

- `mobile/src/screens/app/QuickActionScreen.tsx`
  - Pesan sukses buat order ditambah informasi bahwa notifikasi WA diproses otomatis (jika plan eligible).

### Test
- `tests/Feature/WaApiTest.php`
  - Tambah test:
    - `test_non_pickup_order_creation_also_enqueues_wa_confirmation_message`

## Catatan Verifikasi
- `mobile`: `npm run typecheck` -> pass.
- `php artisan test tests/Feature/WaApiTest.php` belum bisa dieksekusi di environment ini karena akses DB testing tidak tersedia dari mesin saat ini.
