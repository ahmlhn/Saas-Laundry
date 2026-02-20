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
  - Tabs: `Beranda`, `Pesanan`, `+`, `Laporan`, `Akun`
- Fetch order read-only via `/api/orders` dengan context outlet aktif
- Order detail + quick update status laundry/kurir
- Modul pelanggan dari tab Akun (`Pelanggan Saya`) untuk list + upsert + arsip/restore (role-based)
- Logout via `/api/auth/logout`

## 5) Validasi

```bash
npm run typecheck
```
