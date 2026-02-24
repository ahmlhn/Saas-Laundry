<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>{{ $title ?? 'Platform Subscription Panel' }}</title>
    @vite(['resources/css/app.css', 'resources/js/app.js'])
</head>
<body class="panel-root">
    <div class="panel-layout">
        <aside class="panel-sidebar">
            <div class="panel-brand">
                <span class="panel-brand-mark">PF</span>
                <div class="panel-brand-copy">
                    <p class="panel-kicker">Platform Console</p>
                    <h1>Subscription Admin</h1>
                    <p>{{ $user->name ?? 'Operator' }}</p>
                </div>
            </div>

            <nav class="panel-nav">
                <p class="panel-group-title">Platform</p>
                <a href="{{ route('platform.subscriptions.index') }}" class="panel-link {{ request()->routeIs('platform.subscriptions.*') ? 'is-active' : '' }}">
                    <span class="panel-link-text">Tenant Subscriptions</span>
                </a>
            </nav>

            <div class="panel-sidebar-foot">
                <p class="panel-kicker">Role</p>
                <p class="panel-plan">{{ strtoupper($user->roles->pluck('key')->join(', ')) }}</p>
            </div>
        </aside>

        <main class="panel-main">
            <header class="panel-header">
                <div class="panel-header-left">
                    <div>
                        <p class="panel-kicker">Platform Workspace</p>
                        <h2>{{ $title ?? 'Platform' }}</h2>
                    </div>
                </div>
                <div class="panel-header-right">
                    <form method="POST" action="{{ route('platform.logout') }}">
                        @csrf
                        <button class="btn btn-muted" type="submit">Keluar</button>
                    </form>
                </div>
            </header>
            <div class="panel-content">
                @if(session('status'))
                    <div class="notice notice-success">{{ session('status') }}</div>
                @endif

                @if($errors->any())
                    <div class="notice notice-error">{{ $errors->first() }}</div>
                @endif

                @yield('content')
            </div>
        </main>
    </div>
</body>
</html>
