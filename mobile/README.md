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
- Quick Action tab (`+`) mendukung create order multi-item via `POST /api/orders` (owner/admin/cashier)
- Modul `Kelola Keuangan` dari tab Akun:
  - Snapshot billing quota via `/api/billing/quota` (owner/admin)
  - Snapshot kas operasional dari data `/api/orders` outlet aktif
  - Daftar aksi finance sesuai referensi UI (siap disambung endpoint detail)
- Modul `Printer & Nota` dari tab Akun:
  - Pengaturan profil nota, format nomor, dan toggle tampilan
  - Persist lokal perangkat via `expo-secure-store`
- Modul `Bantuan & Informasi` dari tab Akun sebagai utility hub (entry point konten support)
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
