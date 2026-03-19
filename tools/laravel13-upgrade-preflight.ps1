param(
    [string]$TargetFrameworkVersion = "13.1.1"
)

$ErrorActionPreference = "Stop"

function Write-Section([string]$Title) {
    Write-Host ""
    Write-Host "== $Title ==" -ForegroundColor Cyan
}

function Write-Status([string]$State, [string]$Message) {
    $color = switch ($State) {
        "PASS" { "Green" }
        "WARN" { "Yellow" }
        "FAIL" { "Red" }
        default { "Gray" }
    }

    Write-Host ("[{0}] {1}" -f $State, $Message) -ForegroundColor $color
}

function Get-ComposerVersion([string]$Package) {
    $output = & composer show $Package 2>$null

    if ($LASTEXITCODE -ne 0) {
        return $null
    }

    $line = $output | Select-String '^versions\s*:' | Select-Object -First 1

    if (-not $line) {
        return $null
    }

    return (($line.Line -replace '^versions\s*:\s*\*\s*', '') -replace '^versions\s*:\s*', '').Trim()
}

function Search-Pattern(
    [string]$Pattern,
    [string[]]$Paths,
    [string]$FoundMessage,
    [string]$ClearMessage
) {
    $output = & rg -n --glob '!vendor/**' --glob '!node_modules/**' $Pattern @Paths 2>$null

    if ($LASTEXITCODE -eq 0) {
        Write-Status "WARN" $FoundMessage
        $output | Select-Object -First 10 | ForEach-Object {
            Write-Host "  $_"
        }

        if (($output | Measure-Object).Count -gt 10) {
            Write-Host "  ..."
        }

        return
    }

    if ($LASTEXITCODE -eq 1) {
        Write-Status "PASS" $ClearMessage
        return
    }

    Write-Status "WARN" ("Pattern scan gagal untuk: {0}" -f $FoundMessage)
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Push-Location $repoRoot

try {
    Write-Section "Laravel 13 Preflight"
    Write-Host ("Repo              : {0}" -f $repoRoot)
    Write-Host ("Target framework  : {0}" -f $TargetFrameworkVersion)

    $composerJson = Get-Content (Join-Path $repoRoot "composer.json") -Raw | ConvertFrom-Json

    $phpVersion = (& php -r "echo PHP_VERSION;").Trim()
    $phpVersionCore = ($phpVersion -split '-')[0]

    if ([version]$phpVersionCore -ge [version]"8.3.0") {
        Write-Status "PASS" ("PHP {0} memenuhi minimum Laravel 13 (8.3+)." -f $phpVersion)
    } else {
        Write-Status "FAIL" ("PHP {0} belum memenuhi minimum Laravel 13 (8.3+)." -f $phpVersion)
    }

    Write-Section "Git Worktree"
    $gitStatus = & git status --short 2>$null

    if ($LASTEXITCODE -eq 0 -and -not $gitStatus) {
        Write-Status "PASS" "Worktree bersih."
    } elseif ($LASTEXITCODE -eq 0) {
        Write-Status "WARN" "Worktree tidak bersih. Pisahkan perubahan non-upgrade sebelum merge atau deploy."
        $gitStatus | Select-Object -First 20 | ForEach-Object {
            Write-Host "  $_"
        }
    } else {
        Write-Status "WARN" "Gagal membaca git status."
    }

    Write-Section "Composer Constraints"
    Write-Host ("- php: {0}" -f $composerJson.require.php)
    Write-Host ("- laravel/framework: {0}" -f $composerJson.require.'laravel/framework')
    Write-Host ("- laravel/sanctum: {0}" -f $composerJson.require.'laravel/sanctum')
    Write-Host ("- laravel/tinker: {0}" -f $composerJson.require.'laravel/tinker')
    Write-Host ("- phpunit/phpunit: {0}" -f $composerJson.'require-dev'.'phpunit/phpunit')

    Write-Section "Key Package Versions"
    $packages = @(
        @{ Name = "laravel/framework"; Target = "^13.0" },
        @{ Name = "laravel/sanctum"; Target = "^4.3.1" },
        @{ Name = "laravel/tinker"; Target = "^3.0" },
        @{ Name = "nunomaduro/collision"; Target = "^8.9.1" },
        @{ Name = "phpunit/phpunit"; Target = "^12.0" }
    )

    foreach ($package in $packages) {
        $currentVersion = Get-ComposerVersion $package.Name

        if ($null -eq $currentVersion) {
            Write-Status "WARN" ("Tidak bisa membaca versi paket {0}." -f $package.Name)
            continue
        }

        Write-Host ("- {0}: {1} -> target {2}" -f $package.Name, $currentVersion, $package.Target)
    }

    Write-Section "Composer Blockers"
    $whyNotOutput = & composer why-not laravel/framework $TargetFrameworkVersion 2>&1

    if ($LASTEXITCODE -eq 0) {
        Write-Status "PASS" ("Composer tidak melaporkan blocker langsung untuk laravel/framework {0}." -f $TargetFrameworkVersion)
    } else {
        Write-Status "WARN" ("Composer masih melaporkan blocker untuk laravel/framework {0}." -f $TargetFrameworkVersion)
        $whyNotOutput | ForEach-Object {
            Write-Host "  $_"
        }
    }

    Write-Section "Repo Pattern Scan"
    Search-Pattern `
        -Pattern 'Route::domain|->domain\(' `
        -Paths @('routes', 'app', 'bootstrap') `
        -FoundMessage 'Ada penggunaan route domain; review precedence change Laravel 13.' `
        -ClearMessage 'Tidak ada penggunaan route domain.'

    Search-Pattern `
        -Pattern 'VerifyCsrfToken|ValidateCsrfToken' `
        -Paths @('app', 'bootstrap', 'config', 'routes', 'tests') `
        -FoundMessage 'Ada referensi alias CSRF deprecated yang perlu diganti ke PreventRequestForgery.' `
        -ClearMessage 'Tidak ada referensi alias CSRF deprecated.'

    Search-Pattern `
        -Pattern 'JobAttempted|QueueBusy|exceptionOccurred|connectionName' `
        -Paths @('app') `
        -FoundMessage 'Ada listener/event queue yang perlu direview terhadap breaking changes Laravel 13.' `
        -ClearMessage 'Tidak ada listener/event queue yang terkena breaking changes Laravel 13.'

    Search-Pattern `
        -Pattern 'JsonResource|ResourceCollection|AnonymousResourceCollection' `
        -Paths @('app') `
        -FoundMessage 'Ada API resource custom; review peluang migrasi atau compatibility.' `
        -ClearMessage 'Tidak ada API resource custom yang perlu direview.'

    Search-Pattern `
        -Pattern 'new static\(\)|new self\(\)' `
        -Paths @('app\\Models', 'app') `
        -FoundMessage 'Ada instansiasi model/self yang perlu dicek terhadap perubahan boot lifecycle.' `
        -ClearMessage 'Tidak ditemukan pola instansiasi model/self yang mencurigakan pada audit cepat.'

    Search-Pattern `
        -Pattern 'onQueue\(' `
        -Paths @('app') `
        -FoundMessage 'Ada queue assignment manual; kandidat refactor ke Queue::route(...).' `
        -ClearMessage 'Tidak ada queue assignment manual yang perlu dirapikan.'

    $frameworkVersion = Get-ComposerVersion "laravel/framework"
    $frameworkMajor = 0

    if ($frameworkVersion -match 'v?(\d+)') {
        $frameworkMajor = [int]$Matches[1]
    }

    Write-Section "Next Actions"
    Write-Host "1. Jalankan checklist lengkap di docs/LARAVEL_13_UPGRADE_CHECKLIST.md."

    if ($frameworkMajor -ge 13) {
        Write-Host "2. Pastikan staging/production sudah memakai PHP 8.3+ sebelum deploy."
        Write-Host "3. Jalankan smoke test tenant web, platform web, API/mobile sync, dan queue messaging."
        Write-Host "4. Pisahkan perubahan non-upgrade sebelum merge atau deploy."
    } else {
        Write-Host "2. Naikkan dulu repo ke latest Laravel 12 patch dan pastikan test hijau."
        Write-Host "3. Baru ubah constraint Composer utama untuk Laravel 13."
        Write-Host "4. Setelah dependency resolve, jalankan php artisan test + ops:readiness:check + smoke test web/mobile."
    }
}
finally {
    Pop-Location
}
