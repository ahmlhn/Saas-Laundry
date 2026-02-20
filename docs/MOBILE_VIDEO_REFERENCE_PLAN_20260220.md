# Mobile Plan From Video Reference (2026-02-20)

## 1) Tujuan
- Menyelaraskan UX aplikasi mobile SaaS Laundry dengan pola operasional pada video referensi.
- Menjaga implementasi tetap realistis terhadap API backend yang sudah tersedia.
- Menyusun urutan delivery fitur agar cepat dipakai harian (owner/admin/kasir/worker/kurir).

## 2) Ringkasan Temuan Dari Video
- Gaya visual: putih bersih, aksen biru-teal gradien, icon bulat berwarna, card radius besar.
- Struktur utama: bottom tab `Beranda`, `Pesanan`, tombol `+`, `Laporan`, `Akun`.
- Alur awal: login (email/password) + opsi biometric + opsi login lain.
- Beranda: widget ringkasan transaksi + shortcut status order.
- Pesanan: tab status (`Validasi`, `Antrian`, `Proses`, `Siap Ambil`, `Siap Antar`) dengan empty state ilustratif.
- Akun/Manajemen: list modul operasional (pelanggan, outlet, layanan, pegawai, keuangan, bantuan, dll).
- Ada layar setting spesifik: `Pelanggan`, `Printer & Nota`, `Kelola Keuangan`, `Bantuan & Informasi`.

Referensi frame yang dianalisis:
- `tmp/video-frames/sample/20260220-151907/manifest.json`
- Sample timestamp: `0.0s`, `19.7s`, `39.5s`, `59.2s`, `79.0s`, `98.8s`, `118.6s`, `138.4s`, `158.3s`, `178.0s`, `197.8s`, `217.6s`.

## 3) Gap Terhadap App Mobile Saat Ini
- Sudah ada:
  - Login + session restore.
  - Pilih outlet.
  - Dashboard ringkas.
  - List order + detail order + update status laundry/kurir.
- Belum ada:
  - Bottom tab 5 menu seperti referensi.
  - Halaman laporan.
  - Halaman akun berisi menu manajemen lengkap.
  - Modul pelanggan dari mobile.
  - Modul keuangan dari mobile.
  - Modul printer/nota dari mobile.
  - Bantuan & informasi dari mobile.
  - Biometric login.

## 4) IA (Information Architecture) Baru
- Auth
  - Login
  - Biometric re-login (opsional)
- Main Tab
  - Beranda
  - Pesanan
  - Quick Action (`+`)
  - Laporan
  - Akun
- Stack detail
  - Order Detail
  - Pelanggan (list/detail/create/update)
  - Kelola Keuangan
  - Printer & Nota
  - Bantuan & Informasi

## 5) Rencana Fitur Per Fase

### Fase 1 (MVP Operasional Harian)
- Refactor navigation ke 5 bottom tab.
- Beranda:
  - Header tenant/outlet aktif.
  - Kartu ringkasan order (masuk, selesai, terlambat, belum lunas).
  - Shortcut status order.
- Pesanan:
  - Filter status seperti referensi.
  - Search invoice/customer.
  - Empty state ilustratif.
- Akun:
  - Menu list operasional (read-only dulu) sebagai entry point.
- Target outcome:
  - User dapat kerja harian dari 1 flow tanpa bolak-balik screen awal.

### Fase 2 (Master Data Mobile)
- Pelanggan:
  - List + search + create + edit + archive/restore.
- Layanan/Produk:
  - List + archive/restore (owner/admin).
- Pegawai:
  - List + archive/restore (owner/admin).
- Outlet:
  - List outlet yang boleh diakses user.
- Target outcome:
  - Data master inti bisa dikelola dari mobile.

### Fase 3 (Finance + Nota + Utility)
- Kelola Keuangan:
  - Entry pendapatan/pengeluaran.
  - Kategori dan cashbox dasar.
- Printer & Nota:
  - Profil nota.
  - Nomor nota default/custom.
- Bantuan & Informasi:
  - FAQ, kontak, kebijakan, tentang aplikasi.
- Target outcome:
  - Operasional non-order juga bisa dikerjakan dari mobile.

### Fase 4 (Polish + Advanced)
- Biometric login.
- Role-based menu visibility (owner/admin/cashier/worker/courier).
- WA feature gate di menu akun (sesuai plan tenant).
- Performance pass (cache list, pagination, skeleton loading).
- Target outcome:
  - UX matang, cepat, dan sesuai batasan role/plan.

### Fase 5 (Master Data Services)
- Kelola Layanan/Produk:
  - List layanan dengan harga dasar dan harga efektif per outlet.
  - Search cepat berdasarkan nama/unit layanan.
  - Arsip/restore layanan (owner/admin).
- Target outcome:
  - Katalog layanan dapat dipantau dan dirapikan langsung dari mobile.

### Fase 6 (Master Data Staff)
- Kelola Pegawai:
  - List akun pegawai + role + outlet assignment.
  - Search cepat berdasarkan nama/email/HP.
  - Arsip/restore akun pegawai (owner-only, mengikuti policy backend saat ini).
- Target outcome:
  - Monitoring dan housekeeping akun tim bisa dilakukan dari mobile.

### Fase 7 (Master Data Outlet)
- Kelola Outlet:
  - List outlet sesuai scope akses role.
  - Search outlet berdasarkan nama/kode.
  - Pilih outlet aktif dari tab Akun.
  - Arsip/restore outlet (owner-only, mengikuti policy backend saat ini).
- Target outcome:
  - Kontrol outlet aktif dan housekeeping outlet tersedia langsung dari mobile.

### Fase 8 (Operasional Pengantaran)
- Zona Antar:
  - List zona antar per outlet.
  - Create zona antar (nama, radius jarak, biaya, ETA, catatan).
  - Filter zona aktif/nonaktif.
- Target outcome:
  - Pengaturan ongkir antar dasar bisa dilakukan langsung dari mobile.

### Fase 9 (Quick Action Order Entry)
- Quick Action:
  - Form `Buat Order Baru` minimal langsung dari tab `+`.
  - Pilih layanan aktif outlet dan input metrik (qty/kg) sesuai unit.
  - Simpan order ke `POST /api/orders` dan shortcut ke detail order.
- Target outcome:
  - Kasir/owner/admin bisa entry order cepat tanpa keluar dari quick action tab.

### Fase 10 (Quick Action Multi-Item)
- Quick Action:
  - Form order mendukung banyak item layanan dalam satu transaksi.
  - Tambah/hapus item dinamis sebelum submit.
  - Validasi metrik per item mengikuti unit layanan (`kg`/`pcs`).
- Target outcome:
  - Entry order mobile lebih fleksibel untuk transaksi campuran layanan.

### Fase 11 (Quick Action Pricing Summary)
- Quick Action:
  - Ringkasan subtotal per item sebelum submit.
  - Estimasi total dengan komponen ongkir dan diskon.
  - Feedback harga satuan layanan langsung di setiap item.
- Target outcome:
  - User bisa verifikasi nilai transaksi sebelum order disimpan.

### Fase 12 (Quick Action Item Editing)
- Quick Action:
  - Tambah stepper `-/+` untuk metrik item (`qty`/`kg`) sebelum submit.
  - Tambah kontrol urutan item (`Naik`/`Turun`) agar item bisa diprioritaskan.
  - Pastikan validasi + ringkasan estimasi tetap mengikuti urutan item terbaru.
- Target outcome:
  - Koreksi draft item jadi lebih cepat tanpa edit manual berulang.

## 5.1) Status Implementasi (Update 2026-02-21 - Fase 4)
- Fase 1: selesai.
  - Bottom tab 5 menu aktif.
  - Beranda + Pesanan + Akun hub sudah inline dengan referensi.
- Fase 2: selesai.
  - Modul pelanggan mobile (list/search/create/edit/archive/restore) sudah aktif dari tab Akun.
- Fase 3: sebagian besar selesai.
  - `Kelola Keuangan`: snapshot quota (`/billing/quota`) + snapshot transaksi (`/orders`) aktif.
  - `Printer & Nota`: konfigurasi profil nota + nomor nota + toggle tampilan aktif (persist lokal perangkat).
  - `Bantuan & Informasi`: utility hub aktif.
  - Catatan: write API finance detail (pendapatan/pengeluaran/koreksi) masih menunggu endpoint backend dedicated.
- Fase 4: selesai (iterasi UI + flow utama).
  - Biometric re-login aktif:
    - Toggle aktivasi dari tab Akun.
    - Login screen mendukung masuk ulang via biometrik jika sesi token masih tersimpan.
  - Role-based visibility diterapkan:
    - Tab `+` dan `Laporan` hanya tampil untuk owner/admin/cashier.
    - Menu akun difilter berdasarkan role owner/admin/cashier/worker/courier.
  - WA feature gate sesuai plan:
    - Menu `Kirim WA` hanya terbuka untuk role owner/admin dengan plan `Premium` atau `Pro`.
    - Screen WA menampilkan status provider dan ringkasan pesan.
  - Performance pass:
    - Cache list API (orders/customers) untuk mengurangi request berulang.
    - Pagination incremental sampai limit 100 item.
    - Skeleton loading untuk list pesanan dan pelanggan.
- Fase 5: selesai (MOB-007).
  - Menu `Kelola Layanan/Produk` di tab Akun sudah membuka screen aktif.
  - Data layanan memuat harga dasar + harga efektif outlet aktif.
  - Search lokal layanan aktif.
  - Arsip/restore layanan tersedia untuk role owner/admin.
- Fase 6: selesai (MOB-008).
  - Menu `Kelola Pegawai` di tab Akun sudah membuka screen aktif.
  - Data pegawai memuat role, outlet assignment, dan status akun.
  - Search pegawai tersedia (nama/email/HP).
  - Arsip/restore pegawai tersedia untuk role owner (sesuai guard backend).
- Fase 7: selesai (MOB-009).
  - Menu `Kelola Outlet` di tab Akun sudah membuka screen aktif.
  - Data outlet memuat kode, timezone, alamat, dan status outlet.
  - User owner/admin bisa memilih outlet aktif dari modul Akun.
  - Arsip/restore outlet tersedia untuk role owner (sesuai guard backend).
- Fase 8: selesai (MOB-010).
  - Menu `Zona Antar` di tab Akun sudah membuka screen aktif.
  - User owner/admin dapat melihat daftar zona antar per outlet.
  - Tambah zona antar dari mobile sudah aktif (nama, biaya, jarak, ETA, catatan).
  - Akses cepat `Zona Antar` juga tersedia dari screen `Kelola Outlet`.
- Fase 9: selesai (MOB-011).
  - Tombol `Buat Order Baru` di tab `+` sudah aktif (tidak lagi placeholder).
  - Form order minimal mendukung input pelanggan + layanan + metrik qty/kg.
  - Submit order tersambung ke endpoint `POST /api/orders`.
  - Setelah submit, user bisa buka detail order terbaru atau daftar pesanan.
- Fase 10: selesai (MOB-012).
  - Quick Action mendukung create order multi-item dalam satu submit.
  - User bisa menambah dan menghapus item layanan sebelum simpan.
  - Payload create order menggunakan array `items` ke `POST /api/orders`.
- Fase 11: selesai (MOB-013).
  - Quick Action menampilkan harga satuan dan subtotal di setiap item.
  - Ringkasan estimasi total ditambahkan (subtotal, ongkir, diskon, grand total).
  - Ongkir dan diskon bisa diinput sebelum submit order.
- Fase 12: selesai (MOB-014).
  - Quick Action menambahkan stepper `-/+` untuk `qty`/`kg` pada setiap item.
  - Urutan item bisa diubah lewat kontrol `Naik`/`Turun` sebelum submit.
  - Validasi submit + panel ringkasan estimasi mengikuti urutan dan nilai draft terbaru.

## 6) Mapping Fitur Ke API Existing
- Auth:
  - `POST /api/auth/login`
  - `GET /api/me`
  - `POST /api/auth/logout`
- Order:
  - `GET /api/orders`
  - `GET /api/orders/{id}`
  - `POST /api/orders/{id}/status/laundry`
  - `POST /api/orders/{id}/status/courier`
- Pelanggan:
  - `GET /api/customers`
  - `POST /api/customers`
  - `PATCH /api/customers/{id}`
  - `DELETE /api/customers/{id}`
  - `POST /api/customers/{id}/restore`
- Master data:
  - `GET /api/services`
  - `DELETE /api/services/{id}`
  - `POST /api/services/{id}/restore`
  - `GET /api/users`
  - `DELETE /api/users/{id}`
  - `POST /api/users/{id}/restore`
  - `GET /api/outlets`
  - `DELETE /api/outlets/{id}`
  - `POST /api/outlets/{id}/restore`
  - `GET /api/shipping-zones`
  - `POST /api/shipping-zones`
- Billing/WA:
  - `GET /api/billing/quota`
  - `GET /api/wa/providers`
  - `GET /api/wa/messages`

Catatan:
- Beberapa layar referensi (printer/nota, sebagian finance utility) mungkin butuh endpoint tambahan backend bila ingin full parity.

## 7) Rencana Tampilan (UI Direction)
- Design tokens:
  - Primary: biru gradien.
  - Accent: cyan/teal.
  - Surface: putih dan abu sangat terang.
  - Status: success/warning/danger dengan kontras tinggi.
- Komponen inti:
  - App header dengan greeting + outlet.
  - Stat card horizontal.
  - Shortcut icon grid 2x3.
  - Segmented status tab.
  - List tile dengan badge status.
  - Bottom nav tinggi dengan tombol tengah `+`.
- Prinsip UX:
  - Maksimal 2 tap ke aksi utama.
  - State lengkap: loading, empty, error, success.
  - Role-limited actions harus disabled/hidden dengan pesan jelas.

### 7.1) Catatan Responsif Layar
- Target device:
  - HP kecil, HP besar, dan tablet portrait/landscape.
- Aturan layout:
  - Hindari hard-coded width/height untuk komponen utama.
  - Utamakan `flex`, `gap`, `%`, dan `maxWidth` untuk konten inti.
  - Pastikan card/form tetap readable saat lebar layar bertambah (khusus tablet).
- Aturan interaksi:
  - Input aktif wajib tetap terlihat saat keyboard muncul.
  - Saat keyboard hide, posisi scroll dikembalikan ke konteks sebelumnya.
  - Tombol utama tetap mudah dijangkau jempol pada HP (posisi bawah tidak tertutup keyboard/gesture bar).
- Quality gate UI:
  - Verifikasi manual minimal pada 3 kelas viewport: compact phone, large phone, tablet.
  - Tidak boleh ada komponen overlap/terpotong/overflow horizontal.

## 8) Prioritas Implementasi Minggu Ini
1. Refactor navigation ke bottom tab 5 menu.
2. Samakan struktur `Beranda` + `Pesanan` dengan referensi.
3. Tambah halaman `Akun` sebagai hub menu manajemen.
4. Tambah `Pelanggan` (list + create minimal) sebagai modul pertama dari menu akun.

## 9) Definition of Done Per Modul
- Typecheck lulus (`npm run typecheck`).
- Error handling network konsisten.
- Role guard di UI sesuai data `/api/me`.
- Uji manual:
  - Login -> pilih outlet -> lihat dashboard -> buka pesanan -> buka detail -> update status.
  - Menu akun bisa membuka halaman turunan tanpa crash.
