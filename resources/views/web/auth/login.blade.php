<!DOCTYPE html>
<html lang="id" class="h-full">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Masuk {{ $tenant->name }}</title>
    @vite(['resources/css/app.css', 'resources/js/app.js'])
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
            <p class="panel-kicker">Panel Operasional Laundry</p>
            <h1>{{ $tenant->name }}</h1>
            <p>Masuk untuk mengelola alur pesanan, data master, dan komunikasi pelanggan dalam satu panel operasional modern.</p>

            <ul class="auth-points">
                <li>Dasbor ringkas untuk pesanan, kuota, pendapatan, dan performa WhatsApp.</li>
                <li>Kontrol akses berbasis tenant path untuk pemilik dan admin.</li>
                <li>Siklus data master aman dengan aksi arsip dan pulihkan.</li>
            </ul>
        </aside>

        <section class="auth-card">
            <p class="panel-kicker">Masuk Pemilik/Admin</p>
            <h2>Selamat Datang Kembali</h2>
            <p>Gunakan akun web panel untuk melanjutkan pengelolaan operasional tenant.</p>

            @if($errors->any())
                <div class="notice notice-error">{{ $errors->first() }}</div>
            @endif

            <form method="POST" action="{{ route('tenant.login.store', ['tenant' => $tenant->id]) }}" class="stack-form">
                @csrf

                <label for="email">Email</label>
                <input id="email" type="email" name="email" value="{{ old('email') }}" required autocomplete="username" placeholder="owner@tenant.local">

                <label for="password">Kata Sandi</label>
                <input id="password" type="password" name="password" required autocomplete="current-password" placeholder="********">

                <label class="checkbox-inline">
                    <input type="checkbox" name="remember" value="1"> Ingat saya
                </label>

                <button type="submit" class="btn btn-primary">Masuk Panel</button>
            </form>
        </section>
    </main>
</body>
</html>
