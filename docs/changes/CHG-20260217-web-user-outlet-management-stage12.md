# CHG-20260217-web-user-outlet-management-stage12

## Header
- Change ID: `CHG-20260217-web-user-outlet-management-stage12`
- Status: `done`
- Date: `2026-02-17`
- Owner: `codex`
- Related Ticket: `WEB-004`

## 1) Ringkasan Perubahan
- Masalah/tujuan: WEB-004 butuh user management yang benar-benar operasional di web panel (invite user + assign outlet).
- Solusi yang dilakukan: Menambah route web, logic controller invite/update assignment, audit event baru, dan UI users untuk form invite + assignment per-user.
- Dampak bisnis/user: Owner/admin bisa mengelola user operasional lebih cepat tanpa lewat API/manual DB.

## 2) Scope
- In scope:
  - Invite user baru dari web panel.
  - Update assignment role/status/outlets untuk user aktif.
  - Guard owner/admin sesuai scope outlet.
  - Audit event untuk invite dan assignment update.
  - Feature test untuk skenario sukses + guard.
- Out of scope:
  - Flow reset password/email invitation delivery.
  - Multi-role per user dari web panel.

## 3) Acceptance Criteria
1. Owner/admin dapat invite user baru dengan role yang diizinkan.
2. Assignment outlet hanya bisa ke outlet yang ada dalam scope actor.
3. Guard role berjalan: admin tidak dapat mengelola owner/admin.

## 4) Implementasi Teknis
- Pendekatan: Extend `ManagementController` existing agar tetap SSR dan konsisten dengan panel saat ini.
- Keputusan teknis penting: Role assignment di web panel disederhanakan menjadi single role aktif per user (`sync`), untuk menghindari konfigurasi ambigu.
- Trade-off: Flow invite belum kirim email undangan; menggunakan password input langsung di panel.

## 5) File yang Diubah
- `routes/web.php`
- `app/Domain/Audit/AuditEventKeys.php`
- `app/Http/Controllers/Web/ManagementController.php`
- `resources/views/web/management/users.blade.php`
- `tests/Feature/WebPanelTest.php`
- `docs/changes/CHG-20260217-web-user-outlet-management-stage12.md`

## 6) Dampak API/DB/Config
- API changes: tidak ada endpoint API baru (web route only).
- DB migration: tidak ada.
- Env/config changes: tidak ada.
- Backward compatibility: additive pada web panel users.

## 7) Testing dan Validasi
- Unit test: tidak ada.
- Integration test:
  - `php artisan test --testsuite=Feature --filter=WebPanelTest` -> `26 passed (181 assertions)`.
  - `php artisan test` -> `72 passed (498 assertions)`.
- Manual verification:
  - `npm run build` -> sukses (`vite build` selesai tanpa error).
- Hasil: lulus.

## 8) Risiko dan Mitigasi
- Risiko utama: admin mencoba assignment outlet di luar scope.
- Mitigasi: validasi hard fail (`user_management`) via sanitasi outlet assignment.

## 9) Rollback Plan
- Revert perubahan route/controller/view/test/dokumen stage-12.

## 10) Changelog Singkat
- `2026-02-17 00:31` - Dokumen perubahan dibuat dan status `in_progress`.
- `2026-02-17 00:34` - Route + controller + users view + audit key + test WEB-004 ditambahkan.
- `2026-02-17 00:46` - Seluruh test suite + build lulus, dokumen ditutup status `done`.
