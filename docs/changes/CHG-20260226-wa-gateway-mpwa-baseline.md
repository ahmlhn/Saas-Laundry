# CHG-20260226 WA Gateway MPWA Baseline

## Ringkasan
- WhatsApp gateway diarahkan ke `mpwa`.
- Sistem tetap mempertahankan provider `mock` untuk kebutuhan test/internal.

## Perubahan
- Tambah driver baru:
  - `app/Domain/Messaging/Providers/MpwaProvider.php`
  - Mendukung kredensial: `api_key/token`, `sender`, `base_url`, `send_path`, `timeout_seconds`.
  - `healthCheck` validasi kredensial minimum.
  - `sendText` kirim request ke endpoint MPWA (default path `/send-message`).

- Registry provider:
  - `app/Domain/Messaging/WaProviderRegistry.php`
  - Tambah mapping key `mpwa` -> `MpwaProvider`.

- Baseline database provider:
  - `database/migrations/2026_02_26_010300_add_mpwa_provider_baseline.php`
  - Insert provider `mpwa` jika belum ada.

- Konfigurasi env:
  - `config/services.php`
  - `.env.example`
  - Tambah variabel `MPWA_*`:
    - `MPWA_BASE_URL`
    - `MPWA_API_KEY`
    - `MPWA_SENDER`
    - `MPWA_SEND_PATH`
    - `MPWA_TIMEOUT_SECONDS`

- Web panel konfigurasi WA:
  - `app/Http/Controllers/Web/WaSettingsController.php`
  - `resources/views/web/wa/index.blade.php`
  - Form provider config sekarang mendukung field MPWA (`api_key`, `sender`, `base_url`, `send_path`).

- Staging readiness:
  - `app/Console/Commands/StagingReadinessCheckCommand.php`
  - Tambah baseline check untuk provider `mpwa`.

- Test:
  - `tests/Feature/WaApiTest.php`
  - Tambah test konfigurasi provider `mpwa`.

## Update Lanjutan (Sender Per Tenant)
- API provider list sekarang juga mengembalikan `sender` aktif per provider.
- API/Web upsert provider config untuk `mpwa` sekarang hanya menyimpan `sender` per tenant.
- `api_key`, `base_url`, `send_path`, dan `timeout` MPWA wajib dikelola dari `.env` (`MPWA_*`) sebagai konfigurasi global server.
- Jika tenant baru menyimpan `sender` tapi env MPWA belum lengkap, config tetap tersimpan sebagai `nonaktif` dengan pesan health yang jelas, tidak gagal 500.
- Mobile halaman `Kirim WA`:
  - Tambah panel `Sender Tenant (MPWA)`.
  - Bisa simpan sender per tenant langsung dari aplikasi.

## Catatan
- Driver `mpwa` disiapkan kompatibel dengan payload form-data endpoint default `/send-message`.
- Jika endpoint MPWA berbeda, ubah lewat env (`MPWA_BASE_URL`, `MPWA_SEND_PATH`).
