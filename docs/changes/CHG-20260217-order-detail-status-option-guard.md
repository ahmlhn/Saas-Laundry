# CHG-20260217-order-detail-status-option-guard

## Header
- Change ID: `CHG-20260217-order-detail-status-option-guard`
- Status: `done`
- Date: `2026-02-17`
- Owner: `codex`
- Related Ticket: `WEB-TX-022`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Dropdown status pada detail order masih menampilkan opsi yang secara aturan tidak valid untuk state saat ini.
- Solusi yang akan/dilakukan: Menambahkan guard UI agar opsi invalid otomatis disabled berdasarkan status current dan rule domain.
- Dampak bisnis/user: User tidak mudah salah klik status yang pasti ditolak, sehingga alur update operasional lebih cepat dan jelas.

## 2) Scope
- In scope:
  - Guard opsi status laundry pada detail order.
  - Guard opsi status kurir pada detail order.
  - Rule khusus `delivery_pending` disabled jika laundry belum `ready/completed`.
  - Feature test untuk memastikan opsi invalid disabled di UI.
- Out of scope:
  - Penggantian komponen dropdown ke wizard.
  - Perubahan domain rule transition backend.

## 3) Acceptance Criteria
1. Opsi status laundry yang tidak valid dari state saat ini tampil disabled.
2. Opsi status kurir yang tidak valid dari state saat ini tampil disabled.
3. Untuk order pickup-delivery dengan laundry belum ready, opsi `delivery_pending` tampil disabled.

## 4) Implementasi Teknis
- Pendekatan: Hitung whitelist status valid di controller `show()` dan kirim ke view untuk dipakai sebagai aturan disabled option.
- Keputusan teknis penting: Guard UI hanya pencegahan awal; validasi final tetap di server saat submit.
- Trade-off: Ada duplikasi kecil transition map di layer web controller untuk kebutuhan UX.

## 5) File yang Diubah
- `app/Http/Controllers/Web/OrderBoardController.php`
- `resources/views/web/orders/show.blade.php`
- `tests/Feature/WebPanelTest.php`
- `docs/changes/CHG-20260217-order-detail-status-option-guard.md`

## 6) Dampak API/DB/Config
- API changes: tidak ada.
- DB migration: tidak ada.
- Env/config changes: tidak ada.
- Backward compatibility: additive di layer web UI.

## 7) Testing dan Validasi
- Unit test: tidak ada.
- Integration test: update/penambahan test pada `WebPanelTest`.
- Manual verification: cek dropdown status pada detail order untuk state berbeda.
- Hasil:
  - `php artisan test --testsuite=Feature --filter=WebPanelTest` -> pass.
  - `php artisan test` -> pass (92 test).

## 8) Risiko dan Mitigasi
- Risiko utama: opsi yang disabled tidak sinkron dengan validasi backend jika rule berubah.
- Mitigasi: backend tetap source of truth; guard UI dapat disesuaikan bersamaan saat update rule domain.

## 9) Rollback Plan
- Langkah rollback jika gagal:
  - Hapus helper whitelist status di controller.
  - Kembalikan dropdown detail order ke daftar opsi statis sebelumnya.

## 10) Changelog Singkat
- `2026-02-17 15:30` - Dokumen perubahan dibuat dengan status `in_progress`.
- `2026-02-17 15:40` - Guard opsi invalid status pada detail order diimplementasi di controller + view.
- `2026-02-17 15:40` - Test web panel dan full suite lulus, status diubah ke `done`.
