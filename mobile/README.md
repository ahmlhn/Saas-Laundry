# SaaS Laundry Mobile

Kickoff aplikasi mobile (Expo + React Native + TypeScript) untuk backend Laravel di repo ini.

## 1) Persiapan

```bash
cd mobile
cp .env.example .env
npm install
```

## 2) Atur API URL

Edit `.env`:

```env
EXPO_PUBLIC_API_URL=https://saas.daratlaut.com
EXPO_PUBLIC_DEVICE_NAME=mobile-app
```

Catatan endpoint:
- Production (online): `https://saas.daratlaut.com`
- Android emulator lokal: biasanya pakai `http://10.0.2.2:8000`
- iOS simulator lokal: biasanya `http://127.0.0.1:8000`
- Device fisik lokal: pakai IP LAN mesin backend, contoh `http://192.168.1.10:8000`

## 3) Jalankan

```bash
npm run start
```

Opsional:

```bash
npm run android
npm run ios
npm run web
```

Catatan orientasi:
- App Expo dikonfigurasi `orientation: default` sehingga mendukung mode portrait dan landscape.

## 4) Scope kickoff ini

- Login via `/api/auth/login` (Sanctum token)
- Persist token via `expo-secure-store`
- Persist outlet aktif via `expo-secure-store`
- Restore sesi via `/api/me`
- Flow navigation:
  - `Login -> Outlet Select -> Bottom Tabs`
  - Tabs role-based:
    - Owner/Admin/Cashier: `Beranda`, `Pesanan`, `+`, `Laporan`, `Akun`
    - Worker/Courier: `Beranda`, `Pesanan`, `Akun`
- Fetch order read-only via `/api/orders` dengan context outlet aktif
- Order detail + quick update status laundry/kurir
- Modul pelanggan dari tab Akun (`Pelanggan Saya`) untuk list + upsert + arsip/restore (role-based)
- Modul layanan/produk dari tab Akun (`Kelola Layanan/Produk`) untuk list + search + arsip/restore (owner/admin)
- Modul pegawai dari tab Akun (`Kelola Pegawai`) untuk list + search + arsip/restore (owner-only untuk arsip)
- Modul outlet dari tab Akun (`Kelola Outlet`) untuk list + search + pilih outlet aktif + arsip/restore (owner-only untuk arsip)
- Modul zona antar dari tab Akun (`Zona Antar`) untuk list + create per outlet (owner/admin)
- Quick Action tab (`+`) mendukung create order multi-item + ringkasan estimasi (subtotal/ongkir/diskon), stepper qty/kg, dan urut ulang item sebelum submit via `POST /api/orders` (owner/admin/cashier)
- Global mobile UI pass:
  - Komponen dasar (`AppScreen`, `AppPanel`, `AppButton`, `StatusPill`) diseragamkan untuk konsistensi lintas halaman.
  - Bottom tab memakai ikon aktual dan adaptif pada landscape/tablet.
- Modul `Kelola Keuangan` dari tab Akun:
  - Snapshot billing quota via `/api/billing/quota` (owner/admin)
  - Snapshot kas operasional dari data `/api/orders` outlet aktif
  - Jurnal non-order (pendapatan/pengeluaran/koreksi) via `GET/POST /api/billing/entries`
- Modul `Printer & Nota` dari tab Akun:
  - Upload logo nota ke server via `POST /api/printer-note/logo`
  - Pengaturan profil nota, format nomor, dan toggle tampilan
  - Persist lokal perangkat via `expo-secure-store`
- Modul `Bantuan & Informasi` dari tab Akun:
  - Shortcut deep-link ke resource support/training/FAQ/changelog
  - Aksi reset/hapus cache lokal aplikasi
- Modul `Kirim WA`:
  - Tampil untuk role owner/admin
  - Gate plan: hanya plan `Premium`/`Pro`
  - Ringkasan provider + status pesan via `/api/wa/providers` dan `/api/wa/messages`
- Biometric re-login:
  - Aktivasi dari tab Akun
  - Login screen mendukung `Masuk dengan Biometrik` saat sesi token tersimpan
- Performance pass:
  - Cache in-memory untuk list order/pelanggan
  - Pagination incremental hingga 100 data
  - Skeleton loading untuk list utama
- Logout via `/api/auth/logout`

## 5) Validasi

```bash
npm run typecheck
```

## 6) Catatan Pengembangan: Google Login (Sementara Off)

- Status saat ini: login Google dimatikan via `EXPO_PUBLIC_GOOGLE_LOGIN_ENABLED=false`.
- Dampak UI: tombol `Masuk dengan Google` tidak ditampilkan di halaman login.
- Saat siap diaktifkan kembali:
  - Ubah `mobile/.env` menjadi `EXPO_PUBLIC_GOOGLE_LOGIN_ENABLED=true`.
  - Isi client ID Google sesuai platform (`EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` atau `EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID`).
  - Pastikan backend mengisi `GOOGLE_CLIENT_IDS` (daftar client ID yang diizinkan).
  - Restart Expo agar env baru terbaca.

## 7) Catatan UI/UX Responsif

- UI mobile wajib adaptif untuk layar kecil-besar (HP compact, HP large, foldable, tablet) tanpa memotong konten utama.
- Prioritaskan layout berbasis `flex` + `%` + `maxWidth`, hindari ukuran fixed yang kaku untuk card/form/action penting.
- Gunakan `SafeAreaView` dan padding dinamis agar konten tidak tabrakan dengan notch, status bar, home indicator, dan gesture area.
- Saat keyboard muncul:
  - field aktif harus tetap terlihat (auto scroll/focus handling),
  - saat keyboard ditutup, posisi scroll dipulihkan agar navigasi terasa natural.
- Untuk layar tablet, maksimalkan keterbacaan:
  - batasi lebar konten utama (`maxWidth`) agar tidak terlalu melebar,
  - jaga hierarki visual (headline, section title, action button) tetap jelas.
- Semua screen baru wajib diuji minimal pada:
  - HP kecil (sekitar 360x640),
  - HP besar (sekitar 412x915),
  - tablet portrait (sekitar 768x1024).

## 8) Catatan Pengembangan: Layanan Paket Pelanggan

- Status saat ini:
  - Card `Data Paket` di langkah 1 (`Tambah Pesanan`) hanya tampil jika payload customer memang membawa data paket.
  - Jika data paket tidak ada, card tidak dirender agar UI tetap bersih.
- Kontrak data yang direkomendasikan dari API customer:
  - `package_summary.active_count` (jumlah paket aktif pelanggan)
  - `package_summary.remaining_quota_label` (teks sisa kuota, contoh: `3 kg`, `2 pcs`, `-`)
- Backlog pengembangan lanjutan:
  - Tambah endpoint/detail paket pelanggan aktif (nama paket, masa berlaku, sisa kuota per paket).
  - Integrasi validasi pemakaian paket saat create order (apply ke item yang eligible).
  - Tampilkan riwayat pemakaian paket per pelanggan di screen detail pelanggan/order.
