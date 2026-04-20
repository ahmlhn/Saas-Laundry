<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>{{ $title ?? 'Platform Subscription Panel' }}</title>
    @include('partials.vite-assets')
    <script>
        (() => {
            if (localStorage.getItem('panel_theme') === 'dark') {
                document.documentElement.classList.add('dark');
            }
        })();
    </script>
</head>
<body class="panel-root" x-data="panelApp()" x-init="init()">
    <div class="panel-layout">
        <div class="panel-backdrop" x-cloak x-show="sidebarOpen" x-transition.opacity @click="sidebarOpen = false"></div>

        <aside class="panel-sidebar" :class="{ 'is-open': sidebarOpen, 'is-collapsed': sidebarCollapsed && isDesktop }">
            <div class="panel-brand">
                <span class="panel-brand-mark" aria-hidden="true">
                    <img src="{{ asset('cuci.svg') }}" alt="">
                </span>
                <div class="panel-brand-copy">
                    <p class="panel-kicker">Platform Console</p>
                    <h1>Subscription Admin</h1>
                    <p>{{ $user->name ?? 'Operator' }}</p>
                </div>
                <button type="button" class="panel-icon-btn panel-mobile-close" @click="sidebarOpen = false" aria-label="Tutup sidebar">
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                    </svg>
                </button>
            </div>

            <nav class="panel-nav">
                <p class="panel-group-title">Platform</p>
                <a href="{{ route('platform.subscriptions.index') }}" class="panel-link {{ request()->routeIs('platform.subscriptions.*') ? 'is-active' : '' }}">
                    <span class="panel-link-icon">
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M4 19C4 16.8 5.8 15 8 15H16C18.2 15 20 16.8 20 19M12 12C10.3 12 9 10.7 9 9C9 7.3 10.3 6 12 6C13.7 6 15 7.3 15 9C15 10.7 13.7 12 12 12Z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
                        </svg>
                    </span>
                    <span class="panel-link-text">Tenant Subscriptions</span>
                </a>
                <a href="{{ route('platform.mobile-release.edit') }}" class="panel-link {{ request()->routeIs('platform.mobile-release.*') ? 'is-active' : '' }}">
                    <span class="panel-link-icon">
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M9 4H15M8 7H16C17.1 7 18 7.9 18 9V18C18 19.1 17.1 20 16 20H8C6.9 20 6 19.1 6 18V9C6 7.9 6.9 7 8 7Z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
                            <path d="M11 16H13" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
                        </svg>
                    </span>
                    <span class="panel-link-text">Mobile Release</span>
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
                    <button type="button" class="panel-icon-btn panel-desktop-toggle" @click="toggleSidebarCollapse()" aria-label="Ubah sidebar">
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" :class="{ 'is-rotated': sidebarCollapsed }">
                            <path d="M9 6L15 12L9 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </button>
                    <button type="button" class="panel-icon-btn panel-mobile-open" @click="sidebarOpen = true" aria-label="Buka sidebar">
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M4 7H20M4 12H20M4 17H20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                        </svg>
                    </button>
                    <div>
                        <p class="panel-kicker">Platform Workspace</p>
                        <h2>{{ $title ?? 'Platform' }}</h2>
                    </div>
                </div>
                <div class="panel-header-right">
                    <div class="panel-header-meta">
                        <span class="panel-meta-pill">Operator {{ $user->name ?? 'Platform' }}</span>
                        <span class="panel-meta-pill">Role {{ strtoupper($user->roles->pluck('key')->join(', ')) }}</span>
                    </div>
                    <div class="panel-mobile-meta">
                        <span class="panel-meta-pill">Operator {{ $user->name ?? 'Platform' }}</span>
                        <span class="panel-meta-pill">Role {{ strtoupper($user->roles->pluck('key')->join(', ')) }}</span>
                    </div>
                    <button type="button" class="btn btn-ghost btn-icon" @click="toggleTheme()">
                        <span x-text="isDark ? 'Terang' : 'Gelap'"></span>
                    </button>
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
