# CHG-20260225-payment-gateway-deferred-manual-first

## Ringkasan
- Keputusan per 25 Februari 2026: pengembangan **payment gateway/QRIS** untuk alur pembayaran order ditunda sementara.
- Fokus implementasi aktif dialihkan ke **pembayaran manual** agar rollout operasional kasir lebih stabil dan cepat dipakai.

## Dampak Produk
- UI pembayaran di mobile saat ini memakai metode manual:
  - Tunai
  - Transfer
  - Lainnya
- Opsi QRIS pada flow pembayaran order disembunyikan dari alur aktif.
- Menu Payment Gateway tidak ditampilkan pada menu Akun (sementara).

## Catatan Backlog Payment Gateway (Ditunda)
- Aktifkan kembali menu konfigurasi Payment Gateway per outlet.
- Aktifkan kembali flow QRIS pada:
  - Step pembayaran "Buat Pesanan Baru" (Quick Action).
  - Halaman detail order (aksi pembayaran).
- Validasi end-to-end:
  - Create intent QRIS.
  - Webhook settlement.
  - Sinkron status pembayaran order otomatis.
- UAT khusus kasir untuk skenario:
  - QRIS sukses.
  - QRIS expired.
  - QRIS duplicate webhook.
  - Amount mismatch.

## Trigger Lanjutkan Backlog
- Tim bisnis menyatakan siap go-live QRIS.
- Kredensial gateway produksi sudah final.
- SOP operasional kasir untuk QRIS sudah disetujui.

