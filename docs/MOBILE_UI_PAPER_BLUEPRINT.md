# Mobile UI Paper Blueprint

Blueprint ini disusun dari struktur mobile app yang sudah ada di repo, supaya desain di aplikasi Paper tetap selaras dengan flow produk aktual.

## 1. Scope

Phase awal desain mobile difokuskan ke flow operasional inti:

1. Login
2. Pilih outlet aktif
3. Beranda
4. Daftar pesanan
5. Tambah pesanan
6. Detail pesanan
7. Pembayaran / cetak nota
8. Akun

Referensi implementasi:

- `mobile/src/navigation/AppNavigator.tsx`
- `mobile/src/navigation/types.ts`
- `mobile/src/theme/useAppTheme.ts`
- `mobile/src/screens/auth/LoginScreen.tsx`
- `mobile/src/screens/app/OutletSelectScreen.tsx`
- `mobile/src/screens/app/HomeDashboardScreen.tsx`
- `mobile/src/screens/app/OrdersTodayScreen.tsx`
- `mobile/src/screens/app/QuickActionScreen.tsx`
- `mobile/src/screens/app/OrderDetailScreen.tsx`
- `mobile/src/screens/app/OrderPaymentScreen.tsx`
- `mobile/src/screens/app/AccountHubScreen.tsx`

## 2. Product Direction

Karakter visual yang dipakai:

- Bersih, modern, operasional
- Rasa "mesin kerja" laundry, bukan fintech generik
- Dominan aqua-blue, putih, dan slate kebiruan
- Card tebal, radius besar, dan hierarki angka yang kuat
- Banyak status chip dan action panel

Mood board singkat:

- "dashboard operasional"
- "clean industrial"
- "fast cashier workflow"

## 3. Artboard Paper

Gunakan frame utama:

1. `Android / Base`: 360 x 800
2. `Android / Large`: 412 x 915
3. `Tablet / Portrait Review`: 768 x 1024

Urutan halaman di Paper:

1. `Foundations`
2. `Components`
3. `Auth`
4. `Outlet`
5. `Operations`
6. `Payments`
7. `Account`

## 4. Design Tokens

### 4.1 Typography

Font utama:

- `Manrope Regular`
- `Manrope Medium`
- `Manrope Semibold`
- `Manrope Bold`
- `Manrope ExtraBold`

Hierarchy yang disarankan:

- Display hero: 28-34
- Screen title: 22-24
- Section title: 16-18
- Card metric: 24-30
- Body: 13-14
- Caption/meta: 10-12

### 4.2 Color

Token utama dari tema aplikasi:

- Background: `#f2f8ff`
- Background strong: `#e9f2ff`
- Surface: `#ffffff`
- Surface soft: `#f7fbff`
- Border: `#d8e6f3`
- Border strong: `#bfd8ec`
- Text primary: `#0a2b49`
- Text secondary: `#385f80`
- Text muted: `#6f8ba4`
- Primary: `#1cd3e2`
- Primary strong: `#0ea4ce`
- Primary soft: `#d9f8ff`
- Info: `#2a7ce2`
- Success: `#1f9e63`
- Warning: `#dd8c10`
- Danger: `#ce3d52`

Accent usage:

- Info blue untuk navigasi aktif, CTA sekunder, statistik
- Aqua untuk area hero, glow, dan brand feeling
- Success/warning/danger hanya untuk status operasional

### 4.3 Radius

- Small: 10
- Medium: 14
- Large: 18
- Extra large: 24
- Pill: 999

### 4.4 Spacing

- XS: 6
- SM: 10
- MD: 14
- LG: 18
- XL: 24
- XXL: 30

## 5. Core Components

Buat komponen reusable di halaman `Components`:

1. `Top Hero Card`
   Warna gradien biru-aqua, dekorasi lingkaran/glow, headline, subheadline, meta chip.

2. `App Panel`
   Card putih, border tipis biru abu, radius 18-24, shadow lembut.

3. `Status Pill`
   Variasi `neutral`, `info`, `success`, `warning`, `danger`.

4. `Primary Button`
   Fill `#0ea4ce`, teks putih, radius 14.

5. `Secondary Button`
   Surface putih / biru muda, border tegas, teks biru tua.

6. `Input Field`
   Background `#f5fbff`, border `#bfd8ec`, label kecil di atas.

7. `Metric Card`
   Ikon kiri atas, angka besar, label kecil, tone warna sesuai status.

8. `Order Row Card`
   Nomor invoice, nama pelanggan, service summary, total, due amount, status chip, timestamp.

9. `Floating Plus Tab`
   Tombol lingkaran besar di tengah bottom tab dengan halo.

10. `Section Header`
    Judul, subjudul, optional action text.

## 6. Navigation Map

Flow utama mobile:

1. `Login`
2. `Outlet Select`
3. `Main Tabs`

Main tabs untuk owner/admin/cashier:

- `Beranda`
- `Pesanan`
- `+`
- `Laporan`
- `Akun`

Main tabs untuk worker/courier:

- `Beranda`
- `Pesanan`
- `Akun`

Screen stack penting:

- `Pesanan -> Detail Pesanan`
- `+ -> Tambah Pesanan multi-step`
- `Detail Pesanan -> Pembayaran`
- `Akun -> pelanggan/layanan/pegawai/outlet/zona antar/keuangan/printer/WA`

## 7. Screen Priority For Paper

Kalau desain dikerjakan bertahap, urutan paling efisien:

1. Login
2. Outlet Select
3. Beranda
4. Pesanan
5. Tambah Pesanan
6. Detail Pesanan
7. Pembayaran
8. Akun

## 8. Screen Blueprint

### 8.1 Login

Tujuan:

- cepat masuk
- terlihat profesional
- langsung menunjukkan status koneksi aplikasi

Struktur:

1. Hero brand di atas
2. Card form login
3. Status API online/offline
4. Tombol `Masuk`
5. Link `Lupa password`
6. Link `Daftar`
7. Tombol biometric jika sesi tersimpan

Susunan visual:

- Background soft blue dengan glow halus
- Brand mark di atas card
- Headline: `Masuk ke Laundry Poin`
- Subheadline: ringkas, satu baris
- Form card putih dengan dua input utama
- CTA utama full width

State yang perlu digambar:

1. Default
2. Field focus
3. Error login
4. API offline
5. Biometric available

Catatan Paper:

- Buat 1 varian portrait utama
- Buat 1 frame kecil untuk state error

### 8.2 Outlet Select

Tujuan:

- memilih konteks outlet kerja sebelum transaksi

Struktur:

1. Hero card tinggi
2. Panel profil user
3. Progress kuota order bulan ini
4. List outlet
5. Tombol logout

Elemen kunci:

- Nama user
- Role user
- Plan badge
- Jumlah outlet
- Status `Order aktif` atau `Order dibatasi`
- Outlet card dengan badge `Aktif` atau `Pilih`

State:

1. Ada banyak outlet
2. Outlet aktif
3. Empty state tanpa outlet

### 8.3 Beranda

Tujuan:

- memberi gambaran operasional hari ini
- jadi pintu masuk tercepat ke bucket order

Struktur:

1. Hero summary
2. Info outlet aktif
3. 4 metric card
4. Shortcut bucket pesanan
5. Ringkasan omzet dan piutang
6. Last updated

Empat metric utama:

- Total order
- Perlu aksi
- Belum lunas
- Sisa kuota

Shortcut bucket:

- Antrian
- Proses
- Siap Ambil
- Siap Antar
- Selesai
- Semua

State:

1. Data normal
2. Loading skeleton
3. Error fetch
4. Empty order hari ini

Catatan visual:

- Hero harus terasa kuat, numerik, dan actionable
- Card metric tidak terlalu tinggi, prioritaskan density

### 8.4 Pesanan

Tujuan:

- memantau list order harian
- memfilter cepat berdasarkan bucket status

Struktur:

1. Header judul dan tanggal aktif
2. Search bar
3. Filter chip bucket
4. List order
5. Sticky summary count

Komponen order row:

- Invoice number
- Nama pelanggan
- Layanan ringkas
- Total tagihan
- Sisa bayar
- Status laundry
- Status kurir bila ada
- Waktu order

State:

1. Default list
2. Search aktif
3. Empty search result
4. Loading
5. Error

Catatan visual:

- Filter chip harus bisa discan cepat
- Informasi due amount perlu cukup menonjol

### 8.5 Tambah Pesanan

Ini screen paling penting. Gunakan model stepper 3 langkah.

Langkah:

1. `Pelanggan`
2. `Layanan`
3. `Review`

#### Step 1: Pelanggan

Struktur:

- Stepper header
- Search pelanggan
- Quick create pelanggan
- Card pelanggan terpilih
- Opsi jemput / antar
- Jadwal pickup
- Alamat pickup / delivery

State:

- pelanggan lama terpilih
- pelanggan baru belum tersimpan
- data paket pelanggan tersedia

#### Step 2: Layanan

Struktur:

- Search layanan
- Group layanan
- Card layanan
- Stepper qty/kg
- Opsi parfum bila ada
- Draft item list di bawah

State:

- belum ada layanan dipilih
- multi-item aktif
- item dengan unit kg
- item dengan unit pcs

#### Step 3: Review

Struktur:

- Ringkasan item
- Panel promo
- Voucher input
- Ongkir
- Diskon manual
- Catatan order
- Ringkasan total
- Pilihan alur bayar: `Bayar nanti` / `Bayar sekarang`
- CTA submit

Catatan visual:

- Ini bukan form panjang biasa
- Pecah menjadi panel-panel pendek yang mudah discan
- Total pembayaran harus sticky atau sangat dominan di bawah

State wajib di Paper:

1. Step 1 default
2. Step 2 layanan terpilih
3. Step 3 review lengkap
4. Validation error

### 8.6 Detail Pesanan

Tujuan:

- memonitor status order
- menjalankan aksi operasional

Struktur:

1. Header order + invoice
2. Status pill utama
3. Ringkasan pelanggan
4. Daftar item layanan
5. Info pembayaran
6. Timeline / status action
7. Tombol aksi bawah

Aksi utama:

- Update status laundry
- Update status kurir
- Bayar
- Cetak nota customer
- Cetak nota produksi
- Share receipt
- Copy tracking link
- Batalkan order

State:

1. Normal
2. Due amount > 0
3. Sudah lunas
4. Order pickup/delivery
5. Modal pembatalan
6. Modal preview receipt

Catatan visual:

- Area status dan nominal harus paling dominan
- Bottom action sebaiknya sticky

### 8.7 Pembayaran / Nota

Mode:

1. `Pembayaran`
2. `Receipt`

Struktur mode pembayaran:

- Header modal
- Sisa tagihan
- Input nominal
- Metode pembayaran
- Tombol simpan

Struktur mode nota:

- Preview nota
- Pilihan customer / production
- Paper width 58mm / 80mm
- Print
- Share

State:

1. pembayaran parsial
2. pembayaran lunas
3. printer belum terhubung
4. preview nota

### 8.8 Akun

Tujuan:

- menjadi hub semua modul manajemen

Struktur:

1. Profile card
2. Info outlet aktif
3. Toggle biometric
4. Group menu operasional
5. Group menu bisnis
6. Group menu sistem
7. Tombol ganti outlet
8. Tombol logout

Kelompok menu:

- Pelanggan
- Layanan / produk
- Pegawai
- Outlet
- Zona antar
- Keuangan
- Payment gateway
- Printer & nota
- Bantuan
- WhatsApp tools

State:

1. Owner/admin penuh
2. Worker/courier sederhana
3. Plan gated item disable

## 9. Layout Rules

Aturan umum layout:

1. Screen pakai padding horizontal `18`
2. Antar panel minimal gap `10-14`
3. Hero card radius `24-30`
4. Card normal radius `18`
5. Button tinggi minimal `48`
6. Bottom tab tinggi terasa premium, bukan tab sempit

Aturan konten:

1. Maksimal 2 CTA primer per screen
2. Angka uang selalu lebih dominan dari label
3. Status gunakan pill, jangan teks polos
4. Informasi sekunder pindah ke caption muted

## 10. States To Design

Minimal state yang harus ada di Paper:

1. Loading skeleton
2. Empty state
3. Error state
4. Success toast / inline success
5. Disabled CTA
6. Form validation
7. Active chip / inactive chip
8. Modal confirmation

## 11. Paper Work Session Plan

Urutan kerja yang saya sarankan di Paper:

1. Buat halaman `Foundations`
2. Buat komponen dasar
3. Gambar `Login`
4. Gambar `Outlet Select`
5. Gambar `Beranda`
6. Gambar `Pesanan`
7. Gambar `Tambah Pesanan`
8. Gambar `Detail Pesanan`
9. Gambar `Pembayaran`
10. Gambar `Akun`

## 12. Deliverable Minimal

Untuk draft pertama, cukup hasilkan:

1. 8 screen utama
2. 1 halaman komponen
3. 1 halaman warna + typography
4. 1 flow map sederhana

Kalau ingin naik ke draft kedua, tambahkan:

1. versi tablet
2. dark mode preview
3. state loading/error/empty
4. modal dan bottom sheet

## 13. Recommendation

Mulai dari 4 layar ini dulu karena paling menentukan rasa produk:

1. Login
2. Beranda
3. Tambah Pesanan
4. Detail Pesanan

Empat layar ini sudah cukup untuk menentukan:

- tone visual
- kepadatan data
- gaya card
- gaya CTA
- gaya status
