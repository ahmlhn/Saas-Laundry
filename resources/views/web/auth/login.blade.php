<!DOCTYPE html>
<html lang="id" class="h-full">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Masuk Panel Operasional</title>
    @include('partials.vite-assets')
    <script>
        (() => {
            if (localStorage.getItem('panel_theme') === 'dark') {
                document.documentElement.classList.add('dark');
            }
        })();
    </script>
</head>
<body class="auth-root">
    <main class="auth-shell">
        <aside class="auth-side">
            <div class="auth-side-copy">
                <p class="panel-kicker">Panel Operasional Cuci</p>
                <h1>Masuk ke Panel Tenant</h1>
                <p>Gunakan email owner atau admin untuk masuk. Tenant akan dipilih otomatis dari akun yang Anda gunakan.</p>
            </div>

            <div class="auth-badge-grid">
                <article class="auth-badge">
                    <p class="auth-badge-label">Akses</p>
                    <strong>Owner / Admin</strong>
                </article>
                <article class="auth-badge">
                    <p class="auth-badge-label">URL Panel</p>
                    <strong>/login</strong>
                </article>
            </div>

            <ul class="auth-points">
                <li>Dasbor ringkas untuk pesanan, kuota, pendapatan, dan performa WhatsApp.</li>
                <li>Tenant web panel di-resolve langsung dari akun yang login.</li>
                <li>Siklus data master aman dengan aksi arsip dan pulihkan.</li>
            </ul>

            <p class="auth-side-foot">
                <span class="auth-side-foot-dot" aria-hidden="true"></span>
                Aktivitas login tercatat pada audit trail tenant.
            </p>
        </aside>

        <section class="auth-card">
            <div class="auth-card-head">
                <p class="panel-kicker">Masuk Pemilik/Admin</p>
                <h2>Selamat Datang Kembali</h2>
                <p>Gunakan akun web panel untuk melanjutkan pengelolaan operasional tenant.</p>
            </div>

            @if(session('status'))
                <div class="notice notice-success">{{ session('status') }}</div>
            @endif

            @if($errors->any())
                <div class="notice notice-error">{{ $errors->first() }}</div>
            @endif

            <form method="POST" action="{{ route('tenant.login.store') }}" class="stack-form auth-form">
                @csrf

                <div class="field-stack">
                    <label for="email">Email</label>
                    <input id="email" type="email" name="email" value="{{ old('email') }}" required autocomplete="username" placeholder="owner@tenant.local">
                </div>

                <div class="field-stack">
                    <label for="password">Kata Sandi</label>
                    <div class="auth-password-wrap">
                        <input id="password" type="password" name="password" required autocomplete="current-password" placeholder="********">
                        <button type="button" class="auth-password-toggle" data-password-toggle aria-pressed="false" aria-label="Tampilkan kata sandi">
                            <span data-password-label>Lihat</span>
                        </button>
                    </div>
                </div>

                <div class="auth-form-foot">
                    <label class="checkbox-inline auth-remember">
                        <input type="checkbox" name="remember" value="1"> Ingat saya
                    </label>
                </div>

                <button type="submit" class="btn btn-primary">Masuk Panel</button>
            </form>

            <p class="auth-card-note">Hanya akun owner/admin tenant aktif yang bisa mengakses halaman ini.</p>
        </section>
    </main>

    <script>
        (() => {
            const passwordInput = document.getElementById('password');
            const toggleButton = document.querySelector('[data-password-toggle]');
            const toggleLabel = toggleButton?.querySelector('[data-password-label]');

            if (!passwordInput || !toggleButton) {
                return;
            }

            toggleButton.addEventListener('click', () => {
                const isHidden = passwordInput.type === 'password';
                passwordInput.type = isHidden ? 'text' : 'password';
                toggleButton.setAttribute('aria-pressed', isHidden ? 'true' : 'false');
                toggleButton.setAttribute('aria-label', isHidden ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi');

                if (toggleLabel) {
                    toggleLabel.textContent = isHidden ? 'Sembunyi' : 'Lihat';
                }
            });
        })();
    </script>
</body>
</html>
