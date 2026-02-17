<!DOCTYPE html>
<html lang="id" class="h-full">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>{{ $title ?? 'Laundry Panel' }}</title>
    @vite(['resources/css/app.css', 'resources/js/app.js'])
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
                <span class="panel-brand-mark">SL</span>
                <div class="panel-brand-copy">
                    <p class="panel-kicker">Sistem Operasional</p>
                    <h1>SaaS Laundry</h1>
                    <p>{{ $tenant->name }}</p>
                </div>
                <button type="button" class="panel-icon-btn panel-mobile-close" @click="sidebarOpen = false" aria-label="Tutup sidebar">
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                    </svg>
                </button>
            </div>

            <nav class="panel-nav">
                <p class="panel-group-title">Ringkasan</p>
                <a href="{{ route('tenant.dashboard', ['tenant' => $tenant->id]) }}" class="panel-link {{ request()->routeIs('tenant.dashboard') ? 'is-active' : '' }}">
                    <span class="panel-link-icon">
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M4 12L12 4L20 12V19A1 1 0 0 1 19 20H5A1 1 0 0 1 4 19V12Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
                        </svg>
                    </span>
                    <span class="panel-link-text">Dasbor</span>
                </a>
                <a href="{{ route('tenant.billing.index', ['tenant' => $tenant->id]) }}" class="panel-link {{ request()->routeIs('tenant.billing.*') ? 'is-active' : '' }}">
                    <span class="panel-link-icon">
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M4 7H20M4 12H20M4 17H14M16 16L18 18L22 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </span>
                    <span class="panel-link-text">Billing &amp; Kuota</span>
                </a>
                <a href="{{ route('tenant.orders.index', ['tenant' => $tenant->id]) }}" class="panel-link {{ request()->routeIs('tenant.orders.*') ? 'is-active' : '' }}">
                    <span class="panel-link-icon">
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M5 7H19M5 12H19M5 17H13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                        </svg>
                    </span>
                    <span class="panel-link-text">Pesanan</span>
                </a>
                <a href="{{ route('tenant.wa.index', ['tenant' => $tenant->id]) }}" class="panel-link {{ request()->routeIs('tenant.wa.*') ? 'is-active' : '' }}">
                    <span class="panel-link-icon">
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M4 20L6 15C5 13.5 4.5 12 4.5 10.5C4.5 6.9 7.9 4 12 4C16.1 4 19.5 6.9 19.5 10.5C19.5 14.1 16.1 17 12 17C10.6 17 9.2 16.7 8 16.2L4 20Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
                        </svg>
                    </span>
                    <span class="panel-link-text">WhatsApp</span>
                </a>

                <p class="panel-group-title">Manajemen</p>
                <a href="{{ route('tenant.users.index', ['tenant' => $tenant->id]) }}" class="panel-link {{ request()->routeIs('tenant.users.*') ? 'is-active' : '' }}">
                    <span class="panel-link-icon">
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M16 19C16 16.8 14.2 15 12 15C9.8 15 8 16.8 8 19M12 12C10.3 12 9 10.7 9 9C9 7.3 10.3 6 12 6C13.7 6 15 7.3 15 9C15 10.7 13.7 12 12 12Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                        </svg>
                    </span>
                    <span class="panel-link-text">Pengguna</span>
                </a>
                <a href="{{ route('tenant.customers.index', ['tenant' => $tenant->id]) }}" class="panel-link {{ request()->routeIs('tenant.customers.*') ? 'is-active' : '' }}">
                    <span class="panel-link-icon">
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M4 18C4 15.8 5.8 14 8 14H16C18.2 14 20 15.8 20 18M12 11C9.8 11 8 9.2 8 7C8 4.8 9.8 3 12 3C14.2 3 16 4.8 16 7C16 9.2 14.2 11 12 11Z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
                        </svg>
                    </span>
                    <span class="panel-link-text">Pelanggan</span>
                </a>
                <a href="{{ route('tenant.services.index', ['tenant' => $tenant->id]) }}" class="panel-link {{ request()->routeIs('tenant.services.*') ? 'is-active' : '' }}">
                    <span class="panel-link-icon">
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M4 8H20M4 16H20M8 4V20M16 4V20" stroke="currentColor" stroke-width="1.6"/>
                        </svg>
                    </span>
                    <span class="panel-link-text">Layanan</span>
                </a>
                <a href="{{ route('tenant.outlet-services.index', ['tenant' => $tenant->id]) }}" class="panel-link {{ request()->routeIs('tenant.outlet-services.*') ? 'is-active' : '' }}">
                    <span class="panel-link-icon">
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M4 7H20M4 12H20M4 17H20M10 4V20" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
                        </svg>
                    </span>
                    <span class="panel-link-text">Layanan Outlet</span>
                </a>
                <a href="{{ route('tenant.outlets.index', ['tenant' => $tenant->id]) }}" class="panel-link {{ request()->routeIs('tenant.outlets.*') ? 'is-active' : '' }}">
                    <span class="panel-link-icon">
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M4 20V8L12 4L20 8V20M9 20V14H15V20" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
                        </svg>
                    </span>
                    <span class="panel-link-text">Outlet</span>
                </a>
                <a href="{{ route('tenant.shipping-zones.index', ['tenant' => $tenant->id]) }}" class="panel-link {{ request()->routeIs('tenant.shipping-zones.*') ? 'is-active' : '' }}">
                    <span class="panel-link-icon">
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M4 7H20M7 4V10M17 4V10M4 17H20M12 14V20" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
                        </svg>
                    </span>
                    <span class="panel-link-text">Zona Pengantaran</span>
                </a>
            </nav>

            <div class="panel-sidebar-foot">
                <p class="panel-kicker">Paket Aktif</p>
                <p class="panel-plan">{{ strtoupper((string) ($tenant->currentPlan?->key ?? 'plan')) }}</p>
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
                        <p class="panel-kicker">Panel Operasional Tenant</p>
                        <h2>{{ $title ?? 'Panel' }}</h2>
                    </div>
                </div>

                <div class="panel-header-right">
                    <div class="panel-header-meta">
                        <span class="panel-meta-pill">Tenant {{ $tenant->name }}</span>
                        <span class="panel-meta-pill">Paket {{ strtoupper((string) ($tenant->currentPlan?->key ?? 'plan')) }}</span>
                    </div>
                    <button type="button" class="btn btn-ghost btn-icon" @click="toggleTheme()">
                        <span x-text="isDark ? 'Terang' : 'Gelap'"></span>
                    </button>
                    <form method="POST" action="{{ route('tenant.logout', ['tenant' => $tenant->id]) }}">
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
