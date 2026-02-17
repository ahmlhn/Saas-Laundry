# UAT Web Transaction Playbook

Dokumen ini khusus untuk menjalankan UAT alur transaksi web (kasir/admin) secara repeatable.

## 1) Tujuan
- Memastikan web panel sudah siap dipakai untuk transaksi harian.
- Memvalidasi flow inti: create order -> payment -> status -> assignment -> receipt.
- Memastikan guard UX (scope + invalid transition) terlihat jelas ke user.

## 2) Prasyarat
- Jalankan setup:
  - `php artisan migrate:fresh --seed`
  - `php artisan serve --host=127.0.0.1 --port=8000`
- Akun demo (password: `password`):
  - `owner@demo.local`
  - `admin@demo.local`
- Browser akses:
  - `http://127.0.0.1:8000/t/{tenant_id}/login`

## 3) Skenario UAT Web Transaction

| ID | Role | Langkah Uji | Hasil Diharapkan |
|---|---|---|---|
| WEB-UAT-01 | Admin | Login dan buka halaman `Pesanan` | Halaman order board tampil tanpa error |
| WEB-UAT-02 | Admin | Buat transaksi baru dengan multi item | Order tercipta, total/due sesuai kalkulasi server |
| WEB-UAT-03 | Admin | Tambah pembayaran manual | Histori payment bertambah, paid/due ter-update |
| WEB-UAT-04 | Admin | Gunakan quick action `Bayar Lunas` | Due amount menjadi 0 |
| WEB-UAT-05 | Admin | Ubah status laundry bertahap sampai `ready` | Semua transisi valid diterima |
| WEB-UAT-06 | Admin | Coba transisi laundry loncat/mundur | Ditolak dan muncul pesan reason yang jelas |
| WEB-UAT-07 | Admin | Assign kurir dan update status kurir sampai `delivered` | Assignment sukses, status kurir maju sesuai pipeline |
| WEB-UAT-08 | Admin | Coba `delivery_pending` saat laundry belum ready | Ditolak dengan pesan reason guard |
| WEB-UAT-09 | Admin | Buka `Cetak Ringkas` dari detail order | Halaman receipt tampil dan bisa print preview |
| WEB-UAT-10 | Admin | Coba akses order tenant lain via URL | Akses ditolak (`404/403` sesuai guard) |

## 4) Evidence yang Harus Disimpan
- Screenshot tiap skenario pass/fail.
- URL + timestamp saat eksekusi.
- Jika gagal:
  - langkah reproduksi,
  - payload form (jika relevan),
  - pesan error yang muncul.

## 5) Template Hasil Eksekusi
Simpan hasil final ke:
- `docs/uat-reports/UAT-YYYYMMDD-web-transaction-exec.md`

Minimum isi:
- Ringkasan pass/fail per skenario `WEB-UAT-01` s.d `WEB-UAT-10`
- Daftar bug (jika ada) dengan severity
- Keputusan `GO / NO-GO`

## 6) Kriteria Lulus
- Seluruh skenario critical (`WEB-UAT-02` s.d `WEB-UAT-09`) pass.
- Tidak ada bug severity `High`.
- Bukti eksekusi tersedia lengkap.
