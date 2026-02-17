@extends('web.layouts.app', ['title' => 'Pengguna'])

@php
    $roleSummary = $rows
        ->flatMap(fn ($row) => $row->roles->pluck('key'))
        ->countBy();
@endphp

@section('content')
<div class="page-shell">
<section class="page-hero">
    <div class="page-hero-main">
        <p class="panel-kicker">Akses & Otorisasi</p>
        <h3>Manajemen Pengguna</h3>
        <p>Kelola lifecycle akun, peran operasional, dan cakupan outlet agar kontrol akses tetap aman tanpa menghambat ritme kerja harian tim.</p>
    </div>
    <div class="page-hero-meta">
        <article class="hero-kpi">
            <p class="hero-kpi-label">Pengguna Aktif</p>
            <p class="hero-kpi-value">{{ number_format($rows->count()) }}</p>
            <p class="hero-kpi-note">Akun aktif tenant</p>
        </article>
        <article class="hero-kpi">
            <p class="hero-kpi-label">Pemilik + Admin</p>
            <p class="hero-kpi-value">{{ number_format(($roleSummary['admin'] ?? 0) + ($roleSummary['owner'] ?? 0)) }}</p>
            <p class="hero-kpi-note">Role pengelola panel</p>
        </article>
        <article class="hero-kpi">
            <p class="hero-kpi-label">Peran Operasional</p>
            <p class="hero-kpi-value">{{ number_format(($roleSummary['cashier'] ?? 0) + ($roleSummary['worker'] ?? 0) + ($roleSummary['courier'] ?? 0)) }}</p>
            <p class="hero-kpi-note">Kasir, worker, courier</p>
        </article>
    </div>
</section>

<section class="metric-grid">
    <article class="metric-card is-primary">
        <p class="metric-label">Pengguna Aktif</p>
        <h3 class="metric-value">{{ number_format($rows->count()) }}</h3>
        <p class="muted-line">Akun aktif dalam tenant</p>
    </article>
    <article class="metric-card is-warning">
        <p class="metric-label">Pengguna Diarsipkan</p>
        <h3 class="metric-value">{{ number_format($archivedRows->count()) }}</h3>
        <p class="muted-line">{{ $ownerMode ? 'Pemilik dapat memulihkan pengguna.' : 'Hanya terlihat untuk pemilik.' }}</p>
    </article>
    <article class="metric-card is-info">
        <p class="metric-label">Admin + Pemilik</p>
        <h3 class="metric-value">{{ number_format(($roleSummary['admin'] ?? 0) + ($roleSummary['owner'] ?? 0)) }}</h3>
        <p class="muted-line">Role pengelola panel</p>
    </article>
    <article class="metric-card is-success">
        <p class="metric-label">Peran Operasional</p>
        <h3 class="metric-value">{{ number_format(($roleSummary['cashier'] ?? 0) + ($roleSummary['worker'] ?? 0) + ($roleSummary['courier'] ?? 0)) }}</h3>
        <p class="muted-line">Kasir, worker, courier</p>
    </article>
</section>

<section class="panel-section">
    <div class="section-head">
        <h3>Undang Pengguna</h3>
        <p class="muted-line">Buat pengguna baru, pilih peran, dan tetapkan outlet sekaligus.</p>
    </div>

    <form method="POST" action="{{ route('tenant.users.store', ['tenant' => $tenant->id]) }}" class="filters-grid">
        @csrf
        <div>
            <label for="invite_name">Nama</label>
            <input id="invite_name" type="text" name="name" value="{{ old('name') }}" maxlength="120" required>
        </div>
        <div>
            <label for="invite_email">Email</label>
            <input id="invite_email" type="email" name="email" value="{{ old('email') }}" maxlength="255" required>
        </div>
        <div>
            <label for="invite_phone">Nomor Telepon</label>
            <input id="invite_phone" type="text" name="phone" value="{{ old('phone') }}" maxlength="40" placeholder="opsional">
        </div>
        <div>
            <label for="invite_password">Kata Sandi</label>
            <input id="invite_password" type="password" name="password" minlength="8" required>
        </div>
        <div>
            <label for="invite_status">Status</label>
            <select id="invite_status" name="status" required>
                <option value="active" @selected(old('status', 'active') === 'active')>Aktif</option>
                <option value="inactive" @selected(old('status') === 'inactive')>Nonaktif</option>
            </select>
        </div>
        <div>
            <label for="invite_role">Peran</label>
            <select id="invite_role" name="role_key" required>
                <option value="">Pilih peran</option>
                @foreach($roleOptions as $role)
                    <option value="{{ $role->key }}" @selected(old('role_key') === $role->key)>
                        {{ $role->name }} ({{ $role->key }})
                    </option>
                @endforeach
            </select>
        </div>
        <div style="grid-column: 1 / -1;">
            <label for="invite_outlets">Tetapkan Outlet</label>
            <select id="invite_outlets" name="outlet_ids[]" multiple size="{{ max(3, min(8, $assignableOutlets->count())) }}" required>
                @foreach($assignableOutlets as $outlet)
                    <option value="{{ $outlet->id }}" @selected(in_array($outlet->id, old('outlet_ids', []), true))>
                        {{ $outlet->name }} ({{ $outlet->code }})
                    </option>
                @endforeach
            </select>
            <p class="muted-line">Gunakan Ctrl/Cmd + klik untuk memilih beberapa outlet.</p>
        </div>
        <div class="filter-actions">
            <button class="btn btn-primary" type="submit">Undang Pengguna</button>
        </div>
    </form>
</section>

<section class="panel-section">
    <div class="section-head">
        <h3>Pengguna Aktif</h3>
        <p class="muted-line">{{ number_format($rows->count()) }} pengguna</p>
    </div>

    <div class="table-wrap">
        <table>
            <thead>
            <tr>
                <th>Nama</th>
                <th>Email</th>
                <th>Status</th>
                <th>Peran</th>
                <th>Outlet</th>
                <th>Kelola Penugasan</th>
                <th>Aksi</th>
            </tr>
            </thead>
            <tbody>
            @forelse($rows as $row)
                @php
                    $selectedRoleKey = $row->roles->pluck('key')->first();
                    $selectedOutletIds = $row->outlets->pluck('id')->map(fn ($id) => (string) $id)->all();
                    $canManage = in_array((string) $row->id, $manageableUserIds, true);
                @endphp
                <tr>
                    <td><p class="row-title">{{ $row->name }}</p></td>
                    <td>{{ $row->email }}</td>
                    <td>
                        <span class="status-badge {{ $row->status === 'active' ? 'status-success' : 'status-warning' }}">{{ $row->status === 'active' ? 'aktif' : 'nonaktif' }}</span>
                    </td>
                    <td>
                        <div class="chip-list">
                            @foreach($row->roles as $role)
                                <span class="chip">{{ $role->key }}</span>
                            @endforeach
                        </div>
                    </td>
                    <td>
                        <div class="chip-list">
                            @foreach($row->outlets as $outlet)
                                <span class="chip">{{ $outlet->code }}</span>
                            @endforeach
                        </div>
                    </td>
                    <td>
                        @if($canManage)
                            <form method="POST" action="{{ route('tenant.users.assignment', ['tenant' => $tenant->id, 'managedUser' => $row->id]) }}" class="filters-grid" style="grid-template-columns: repeat(3, minmax(0, 1fr));">
                                @csrf
                                <div>
                                    <label>Peran</label>
                                    <select name="role_key" required>
                                        @foreach($roleOptions as $role)
                                            <option value="{{ $role->key }}" @selected($selectedRoleKey === $role->key)>
                                                {{ $role->name }} ({{ $role->key }})
                                            </option>
                                        @endforeach
                                    </select>
                                </div>
                                <div>
                                    <label>Status</label>
                                    <select name="status" required>
                                        <option value="active" @selected($row->status === 'active')>Aktif</option>
                                        <option value="inactive" @selected($row->status === 'inactive')>Nonaktif</option>
                                    </select>
                                </div>
                                <div>
                                    <label>Outlet</label>
                                    <select name="outlet_ids[]" multiple size="{{ max(2, min(6, $assignableOutlets->count())) }}" required>
                                        @foreach($assignableOutlets as $outlet)
                                            <option value="{{ $outlet->id }}" @selected(in_array((string) $outlet->id, $selectedOutletIds, true))>
                                                {{ $outlet->name }} ({{ $outlet->code }})
                                            </option>
                                        @endforeach
                                    </select>
                                </div>
                                <div class="filter-actions">
                                    <button type="submit" class="btn btn-muted btn-sm">Perbarui</button>
                                </div>
                            </form>
                        @elseif($row->id === $user->id)
                            <span class="muted-line">Pengguna saat ini</span>
                        @elseif($row->roles->contains(fn ($role) => $role->key === 'owner'))
                            <span class="muted-line">Pemilik terkunci</span>
                        @elseif(! $ownerMode && $row->roles->contains(fn ($role) => $role->key === 'admin'))
                            <span class="muted-line">Admin terkunci</span>
                        @else
                            <span class="muted-line">Hanya baca</span>
                        @endif
                    </td>
                    <td>
                        @if($ownerMode && $row->id !== $user->id)
                            <form method="POST" action="{{ route('tenant.users.archive', ['tenant' => $tenant->id, 'managedUser' => $row->id]) }}" class="inline-form">
                                @csrf
                                <button type="submit" class="btn btn-danger btn-sm">Arsipkan</button>
                            </form>
                        @elseif($ownerMode)
                            <span class="muted-line">Pengguna saat ini</span>
                        @else
                            <span class="muted-line">Hanya baca</span>
                        @endif
                    </td>
                </tr>
            @empty
                <tr>
                    <td colspan="7">Belum ada pengguna aktif.</td>
                </tr>
            @endforelse
            </tbody>
        </table>
    </div>
</section>

@if($ownerMode)
<section class="panel-section">
    <div class="section-head">
        <h3>Pengguna Diarsipkan</h3>
        <p class="muted-line">{{ number_format($archivedRows->count()) }} pengguna</p>
    </div>

    <div class="table-wrap">
        <table>
            <thead>
            <tr>
                <th>Nama</th>
                <th>Email</th>
                <th>Peran</th>
                <th>Diarsipkan Pada</th>
                <th>Aksi</th>
            </tr>
            </thead>
            <tbody>
            @forelse($archivedRows as $row)
                <tr>
                    <td><p class="row-title">{{ $row->name }}</p></td>
                    <td>{{ $row->email }}</td>
                    <td>
                        <div class="chip-list">
                            @foreach($row->roles as $role)
                                <span class="chip">{{ $role->key }}</span>
                            @endforeach
                        </div>
                    </td>
                    <td>{{ optional($row->deleted_at)->format('d M Y H:i') }}</td>
                    <td>
                        <form method="POST" action="{{ route('tenant.users.restore', ['tenant' => $tenant->id, 'managedUser' => $row->id]) }}" class="inline-form">
                            @csrf
                            <button type="submit" class="btn btn-muted btn-sm">Pulihkan</button>
                        </form>
                    </td>
                </tr>
            @empty
                <tr>
                    <td colspan="5">Belum ada pengguna terarsip.</td>
                </tr>
            @endforelse
            </tbody>
        </table>
    </div>
</section>
@endif
</div>
@endsection
