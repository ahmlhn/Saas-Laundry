# CHG-20260226 Mobile Bluetooth Thermal Pairing

## Ringkasan
- Tambah fitur pairing printer thermal Bluetooth di halaman `Printer & Nota` (mobile).
- Fokus tahap ini: scan perangkat, sandingkan printer default per outlet, simpan lokal, dan test print cepat.

## Perubahan
- Dependency mobile:
  - `@haroldtran/react-native-thermal-printer` ditambahkan ke `mobile/package.json`.

- Modul baru:
  - `mobile/src/features/settings/thermalBluetoothPrinter.ts`
    - Deteksi runtime native module BLE printer.
    - Request izin Bluetooth Android (`BLUETOOTH_SCAN`/`BLUETOOTH_CONNECT`).
    - Scan daftar printer BLE.
    - Pair/connect ke printer berdasarkan MAC address.
    - Test print sederhana.
  - `mobile/src/features/settings/printerBluetoothStorage.ts`
    - Simpan printer tersanding lokal (scoped per outlet).
  - `mobile/src/types/printerBluetooth.ts`
    - Tipe data perangkat printer Bluetooth.
  - `mobile/src/types/react-native-thermal-printer.d.ts`
    - Deklarasi tipe minimal untuk package thermal printer.

- UI/UX:
  - `mobile/src/screens/app/PrinterNoteScreen.tsx`
    - Section baru `Printer Thermal Bluetooth`.
    - Tombol `Scan Printer`.
    - List perangkat hasil scan + aksi `Sandingkan`.
    - Card printer tersanding + `Tes Cetak` + `Lepas Pairing`.
    - Pesan fallback jika runtime bukan build native (mis. Expo Go).

## Catatan Operasional
- Fitur ini memerlukan build native (APK/Dev Client). Pada Expo Go, modul native BLE printer tidak tersedia.
- Pairing disimpan di perangkat (local secure storage) untuk saat ini; belum sinkron ke backend.
