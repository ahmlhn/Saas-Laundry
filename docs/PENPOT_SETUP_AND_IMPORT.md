# Penpot Setup And Blueprint Import

Dokumen ini dipakai untuk memindahkan blueprint UI mobile ke Penpot dari repo ini.

## Arah Setup

- Penpot sudah terpasang di mesin Anda.
- Dari sisi repo ini, langkah yang saya siapkan adalah:
  - paket screen `SVG` untuk diimport ke Penpot
  - panduan urutan import
  - style foundations untuk rebuild komponen native Penpot
  - runbook server MCP lokal di `docs/PENPOT_MCP_RUNBOOK.md`

## File Yang Akan Dipakai

Generator blueprint:

- `tools/penpot-export/generate-blueprint-pack.mjs`

Output:

- `docs/penpot-blueprint/`

Isi output:

- `00-foundations.svg`
- `01-login.svg`
- `02-outlet-select.svg`
- `03-home-default.svg`
- `04-home-alt-command-center.svg`
- `05-home-alt-urgent-first.svg`
- `06-home-alt-role-adaptive.svg`
- `07-orders.svg`
- `08-order-create-step-1-customer.svg`
- `09-order-create-step-2-services.svg`
- `10-order-create-step-3-review.svg`
- `11-order-detail.svg`
- `12-payment.svg`
- `13-account.svg`
- `manifest.json`

## Cara Generate

```powershell
node tools/penpot-export/generate-blueprint-pack.mjs
```

## Cara Import Ke Penpot

1. Buka file/project Penpot Anda
2. Buat page sesuai grup screen:
   - `Foundations`
   - `Auth`
   - `Home`
   - `Orders`
   - `Create Order`
   - `Operations`
   - `Account`
3. Ambil file SVG dari `docs/penpot-blueprint/`
4. Import/drag ke canvas Penpot
5. Gunakan `00-foundations.svg` sebagai referensi warna, type, dan komponen
6. Rebuild elemen penting menjadi komponen native Penpot

## Catatan Penting

- Paket ini adalah `visual handoff pack`, bukan file `.penpot` native.
- Tujuannya memindahkan blueprint dan arah visual secepat mungkin.
- Setelah screen SVG masuk ke Penpot, komponen utama sebaiknya dibuat ulang secara native agar lebih enak diedit.

## Urutan Paling Efisien

1. `00-foundations.svg`
2. `01-login.svg`
3. `02-outlet-select.svg`
4. salah satu home:
   - `03-home-default.svg`
   - `04-home-alt-command-center.svg`
   - `05-home-alt-urgent-first.svg`
   - `06-home-alt-role-adaptive.svg`
5. `07-orders.svg`
6. `08-order-create-step-1-customer.svg`
7. `09-order-create-step-2-services.svg`
8. `10-order-create-step-3-review.svg`
9. `11-order-detail.svg`
10. `12-payment.svg`
11. `13-account.svg`
