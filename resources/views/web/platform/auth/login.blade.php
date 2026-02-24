<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>Platform Login</title>
    @vite(['resources/css/app.css', 'resources/js/app.js'])
</head>
<body class="panel-root">
    <main class="auth-shell">
        <section class="auth-card">
            <p class="panel-kicker">Platform Console</p>
            <h1>Login Superadmin</h1>
            <p>Masuk dengan akun global (`tenant_id = null`) untuk mengelola langganan tenant.</p>

            @if($errors->any())
                <div class="notice notice-error">{{ $errors->first() }}</div>
            @endif

            <form method="POST" action="{{ route('platform.login.store') }}" class="auth-form">
                @csrf
                <div>
                    <label for="email">Email</label>
                    <input id="email" name="email" type="email" required value="{{ old('email') }}">
                </div>
                <div>
                    <label for="password">Password</label>
                    <input id="password" name="password" type="password" required>
                </div>
                <div>
                    <label class="inline-check">
                        <input type="checkbox" name="remember" value="1">
                        <span>Ingat saya</span>
                    </label>
                </div>
                <button class="btn btn-primary" type="submit">Masuk Platform</button>
            </form>
        </section>
    </main>
</body>
</html>
