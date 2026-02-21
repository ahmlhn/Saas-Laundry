# CHG-20260220-mobile-phase3-finance-write-api-closure

## Header
- Change ID: `CHG-20260220-mobile-phase3-finance-write-api-closure`
- Status: `done`
- Date: `2026-02-20`
- Owner: `codex`
- Related Ticket: `MOB-005`

## 1) Ringkasan Perubahan
- Masalah/tujuan: Catatan fase 3 mobile masih menyisakan gap write API keuangan detail (pendapatan/pengeluaran/koreksi) sehingga screen `Kelola Keuangan` belum bisa dipakai untuk input jurnal non-order.
- Solusi yang dilakukan: Menambahkan backend endpoint dedicated `GET/POST /api/billing/entries`, migration + model jurnal keuangan, lalu menghubungkan screen mobile `Kelola Keuangan` ke endpoint tersebut.
- Dampak bisnis/user: Owner/Admin sekarang bisa mencatat transaksi keuangan non-order langsung dari mobile dan melihat ringkasan net jurnal per outlet.

## 2) Scope
- In scope:
  - Tabel baru `finance_entries`.
  - Model `FinanceEntry`.
  - API list/create billing entries pada `BillingController`.
  - Audit event untuk create finance entry.
  - Integrasi mobile screen `FinanceToolsScreen` (list + summary + form create).
  - Endpoint upload logo nota (`POST /api/printer-note/logo`) dan integrasi upload dari `PrinterNoteScreen`.
  - Aktivasi aksi utilitas `Bantuan & Informasi` untuk deep-link resource dan reset cache lokal.
- Out of scope:
  - CRUD edit/hapus finance entries.
  - Attachment bukti transaksi (foto/file).

## 3) Acceptance Criteria
1. Owner/Admin dapat menambah jurnal `income/expense/adjustment` dari mobile.
2. Mobile menampilkan ringkasan jurnal non-order (income, expense, adjustment, net).
3. Endpoint finance entry memiliki guard role/outlet yang konsisten dengan akses tenant.

## 4) Implementasi Teknis
- Pendekatan:
  - Menyimpan jurnal non-order sebagai entitas terpisah dari `orders/payments` agar tidak mengganggu flow transaksi inti.
  - Menyediakan summary dari query yang sama dengan filter list untuk memastikan angka list dan dashboard konsisten.
- Keputusan teknis penting:
  - `amount` disimpan signed integer:
    - `income`/`expense` wajib positif.
    - `adjustment` boleh positif/negatif (tidak boleh nol).
  - Source channel mengikuti header `X-Source-Channel` dengan fallback `web`.
- Dependency:
  - Menambahkan `expo-image-picker` untuk pemilihan file logo dari galeri perangkat.
- Trade-off:
  - Iterasi ini fokus create/list; edit/delete entry belum disediakan agar scope tetap aman.

## 5) File yang Diubah
- `database/migrations/2026_02_20_231000_create_finance_entries_table.php`
- `app/Models/FinanceEntry.php`
- `app/Http/Controllers/Api/BillingController.php`
- `app/Http/Controllers/Api/PrinterNoteController.php`
- `app/Domain/Audit/AuditEventKeys.php`
- `routes/api.php`
- `tests/Feature/MasterDataBillingApiTest.php`
- `mobile/src/types/billing.ts`
- `mobile/src/types/printerNote.ts`
- `mobile/src/features/billing/billingApi.ts`
- `mobile/src/features/settings/printerNoteApi.ts`
- `mobile/src/features/settings/printerNoteStorage.ts`
- `mobile/src/screens/app/FinanceToolsScreen.tsx`
- `mobile/src/lib/queryCache.ts`
- `mobile/src/screens/app/HelpInfoScreen.tsx`
- `mobile/src/screens/app/PrinterNoteScreen.tsx`
- `mobile/package.json`
- `mobile/package-lock.json`
- `mobile/README.md`
- `docs/MOBILE_VIDEO_REFERENCE_PLAN_20260220.md`
- `docs/changes/CHG-20260220-mobile-phase3-finance-write-api-closure.md`

## 6) Dampak API/DB/Config
- API changes:
  - `GET /api/billing/entries`
  - `POST /api/billing/entries`
  - `POST /api/printer-note/logo`
- DB migration:
  - Tabel baru `finance_entries`.
- Env/config changes: tidak ada.
- Backward compatibility:
  - Endpoint existing tetap kompatibel; fitur baru bersifat additive.

## 7) Testing dan Validasi
- Integration test:
  - `php artisan test --filter=MasterDataBillingApiTest` untuk validasi endpoint baru.
- Mobile validation:
  - `cd mobile && npm run typecheck`.
- Manual verification:
  - Login owner/admin -> Akun -> Kelola Keuangan -> tambah pendapatan/pengeluaran/koreksi -> ringkasan dan riwayat entry ter-update.

## 8) Risiko dan Mitigasi
- Risiko utama: User memasukkan nominal dengan tanda yang salah untuk tipe koreksi.
- Mitigasi: Validasi input di backend + sanitasi input numerik di mobile + label tipe entry yang jelas.

## 9) Rollback Plan
- Revert migration/model/controller/route finance entries.
- Kembalikan `FinanceToolsScreen` ke mode read-only snapshot.
- Jalankan migration rollback untuk tabel `finance_entries`.

## 10) Changelog Singkat
- `2026-02-20 23:12` - Tambah schema/model/API billing entries + audit event.
- `2026-02-20 23:21` - Integrasi mobile `Kelola Keuangan` ke endpoint baru + update dokumentasi fase.
- `2026-02-20 23:34` - Aktifkan upload logo nota backend+mobile dan aksi deep-link bantuan.
