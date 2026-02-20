# CHG-20260220-mobile-phase12-quick-action-item-editing-stepper-reorder

## Header
- Change ID: `CHG-20260220-mobile-phase12-quick-action-item-editing-stepper-reorder`
- Status: `done`
- Date: `2026-02-20`
- Owner: `codex`
- Related Ticket: `MOB-014`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Edit item Quick Action masih lambat karena user harus mengetik metrik manual dan tidak bisa ubah urutan item.
- Solusi yang dilakukan: Menambahkan stepper metrik per item (`-/+`) dan kontrol urutan item (`Naik`/`Turun`) pada draft multi-item.
- Dampak bisnis/user: Input order campuran lebih cepat dan koreksi draft bisa dilakukan tanpa hapus/tambah ulang item.

## 2) Scope
- In scope:
  - Tambah stepper metrik untuk item `qty`/`kg` di Quick Action.
  - Tambah kontrol urutan item (`Naik`/`Turun`) sebelum submit.
  - Menjaga validasi submit + ringkasan estimasi tetap sinkron dengan urutan item terbaru.
  - Hardening parser metrik agar input desimal dengan koma tetap terbaca.
- Out of scope:
  - Drag-and-drop reordering.
  - Autosave draft order ke local storage.
  - Multi-currency format metrik/harga.

## 3) Acceptance Criteria
1. Setiap item layanan memiliki kontrol stepper `-/+` yang menyesuaikan unit (`kg` step `0.1`, lainnya step `1`).
2. User bisa memindahkan item ke atas/bawah dengan kontrol `Naik`/`Turun`.
3. Validasi submit per item tetap benar setelah item diedit/reorder.
4. Panel ringkasan estimasi menampilkan urutan item terbaru.
5. Typecheck mobile lulus.

## 4) Implementasi Teknis
- Endpoint yang digunakan:
  - `POST /api/orders`
  - `GET /api/services`
- Detail implementasi:
  - Menambah helper metrik di `QuickActionScreen`:
    - parser input metrik (mendukung `,` dan `.`),
    - resolver unit `kg` vs non-`kg`,
    - normalisasi nilai stepper.
  - Menambah aksi `handleMoveItem` untuk reorder array `draftItems`.
  - Menambah aksi `handleStepMetric` untuk increment/decrement metrik item aktif.
  - Mapping payload item saat submit tetap ke `qty`/`weight_kg` sesuai unit.

## 5) File yang Diubah
- `mobile/src/screens/app/QuickActionScreen.tsx`
- `mobile/README.md`
- `docs/MOBILE_VIDEO_REFERENCE_PLAN_20260220.md`
- `docs/changes/CHG-20260220-mobile-phase12-quick-action-item-editing-stepper-reorder.md`

## 6) Dampak API/DB/Config
- API changes: tidak ada endpoint backend baru.
- DB migration: tidak ada.
- Env/config changes: tidak ada.

## 7) Testing dan Validasi
- Typecheck:
  - `cd mobile && npm run typecheck`
- Manual verification:
  - Login owner/admin/cashier -> tab `+`.
  - Tambah 2+ item, ubah metrik via stepper, lalu ubah urutan item.
  - Verifikasi panel ringkasan mengikuti urutan item terbaru.
  - Submit order dan pastikan request tetap berhasil.

## 8) Risiko dan Mitigasi
- Risiko utama: stepper bisa membingungkan jika nilai awal kosong.
- Mitigasi: nilai stepper kosong diperlakukan sebagai `0`, lalu increment/decrement konsisten per unit.

## 9) Rollback Plan
- Hapus kontrol stepper dan kontrol `Naik`/`Turun` dari Quick Action.
- Kembalikan parser metrik ke perilaku sebelumnya.
- Revert changelog fase 12.

## 10) Changelog Singkat
- `2026-02-20` - Stepper metrik `qty/kg` ditambahkan per item Quick Action.
- `2026-02-20` - Kontrol reorder item `Naik`/`Turun` ditambahkan.
- `2026-02-20` - Validasi + ringkasan tetap sinkron setelah edit/reorder item.
