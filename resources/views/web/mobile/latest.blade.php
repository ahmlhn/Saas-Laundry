<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ $title ?? 'Update Aplikasi Android' }}</title>
    <style>
        :root {
            color-scheme: light;
            --bg: #eef6fb;
            --card: #ffffff;
            --text: #14364b;
            --muted: #5d7484;
            --line: #d6e4ee;
            --primary: #0f7ea8;
            --primary-strong: #0c6d91;
            --accent: #dff3fb;
        }

        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            min-height: 100vh;
            font-family: "Segoe UI", Arial, sans-serif;
            background:
                radial-gradient(circle at top right, rgba(15, 126, 168, 0.16), transparent 22rem),
                linear-gradient(180deg, #f7fcff 0%, var(--bg) 100%);
            color: var(--text);
        }

        .shell {
            width: min(760px, calc(100% - 32px));
            margin: 0 auto;
            padding: 40px 0;
        }

        .card {
            background: var(--card);
            border: 1px solid var(--line);
            border-radius: 24px;
            box-shadow: 0 20px 55px rgba(20, 54, 75, 0.09);
            padding: 28px;
        }

        .eyebrow {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 7px 12px;
            border-radius: 999px;
            background: var(--accent);
            color: var(--primary-strong);
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.04em;
            text-transform: uppercase;
        }

        h1 {
            margin: 18px 0 10px;
            font-size: clamp(28px, 4vw, 40px);
            line-height: 1.1;
        }

        p {
            margin: 0;
            color: var(--muted);
            line-height: 1.6;
        }

        .meta-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
            gap: 12px;
            margin-top: 24px;
        }

        .meta-card {
            padding: 14px 16px;
            border-radius: 18px;
            border: 1px solid var(--line);
            background: #fbfdff;
        }

        .meta-label {
            display: block;
            margin-bottom: 6px;
            color: var(--muted);
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }

        .meta-value {
            color: var(--text);
            font-size: 18px;
            font-weight: 700;
        }

        .action-row {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
            margin-top: 26px;
        }

        .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 48px;
            padding: 0 18px;
            border-radius: 14px;
            border: 1px solid var(--line);
            text-decoration: none;
            font-weight: 700;
        }

        .btn-primary {
            border-color: var(--primary);
            background: var(--primary);
            color: #ffffff;
        }

        .btn-primary:hover {
            background: var(--primary-strong);
            border-color: var(--primary-strong);
        }

        .btn-secondary {
            background: #ffffff;
            color: var(--text);
        }

        .section {
            margin-top: 28px;
            padding-top: 24px;
            border-top: 1px solid var(--line);
        }

        .section h2 {
            margin: 0 0 12px;
            font-size: 17px;
        }

        .notes {
            margin: 0;
            padding-left: 18px;
            color: var(--muted);
        }

        .notes li + li {
            margin-top: 8px;
        }

        .empty {
            padding: 16px 18px;
            border-radius: 16px;
            background: #fff8eb;
            border: 1px solid #f2dfae;
            color: #6f5620;
        }

        @media (max-width: 640px) {
            .shell {
                width: min(100%, calc(100% - 20px));
                padding: 20px 0;
            }

            .card {
                padding: 22px 18px;
                border-radius: 20px;
            }
        }
    </style>
</head>
<body>
    <main class="shell">
        <section class="card">
            <span class="eyebrow">Server Update Android</span>
            <h1>Unduh versi terbaru aplikasi {{ config('app.name', 'Cuci') }}</h1>
            <p>Halaman ini dipakai untuk distribusi APK Android langsung dari server. Pastikan Anda mengunduh file hanya dari domain resmi ini.</p>

            <div class="meta-grid">
                <article class="meta-card">
                    <span class="meta-label">Versi</span>
                    <strong class="meta-value">{{ $release['version'] }}</strong>
                </article>
                <article class="meta-card">
                    <span class="meta-label">Build</span>
                    <strong class="meta-value">{{ $release['build'] }}</strong>
                </article>
                <article class="meta-card">
                    <span class="meta-label">Minimal Didukung</span>
                    <strong class="meta-value">{{ $release['minimum_supported_version'] ?? '-' }}</strong>
                </article>
                <article class="meta-card">
                    <span class="meta-label">Tanggal Rilis</span>
                    <strong class="meta-value">{{ $release['published_at'] ?? '-' }}</strong>
                </article>
            </div>

            <div class="action-row">
                @if($release['download_url'])
                    <a class="btn btn-primary" href="{{ $release['download_url'] }}" rel="noopener">Unduh APK Android</a>
                @else
                    <span class="empty">APK belum dikonfigurasi di server. Isi `MOBILE_ANDROID_DOWNLOAD_URL` terlebih dahulu.</span>
                @endif

                <a class="btn btn-secondary" href="{{ url('/') }}">Buka Website</a>
            </div>

            <div class="section">
                <h2>Catatan Rilis</h2>
                @if($release['notes'] !== [])
                    <ul class="notes">
                        @foreach($release['notes'] as $note)
                            <li>{{ $note }}</li>
                        @endforeach
                    </ul>
                @else
                    <p>Belum ada catatan rilis yang dipublikasikan.</p>
                @endif
            </div>
        </section>
    </main>
</body>
</html>
