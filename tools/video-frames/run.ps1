param(
    [Alias("Input")]
    [Parameter(Mandatory = $true)]
    [string]$InputPath,

    [string]$Output = "tmp/video-frames",

    [double]$Interval = 2,

    [ValidateSet("png", "jpg", "jpeg")]
    [string]$Format = "png",

    [double]$Start = 0,

    [double]$End = [double]::NaN,

    [int]$MaxFrames = 0,

    [switch]$EveryFrame
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$pythonFromVenv = Join-Path $repoRoot ".venv-tools\Scripts\python.exe"
$pythonCmd = if (Test-Path $pythonFromVenv) { $pythonFromVenv } else { "python" }
$scriptPath = Join-Path $PSScriptRoot "extract_frames.py"

$argsList = @(
    $scriptPath,
    "--input", $InputPath,
    "--output", $Output,
    "--interval", $Interval.ToString([System.Globalization.CultureInfo]::InvariantCulture),
    "--format", $Format,
    "--start", $Start.ToString([System.Globalization.CultureInfo]::InvariantCulture)
)

if (-not [double]::IsNaN($End)) {
    $argsList += @("--end", $End.ToString([System.Globalization.CultureInfo]::InvariantCulture))
}

if ($MaxFrames -gt 0) {
    $argsList += @("--max-frames", $MaxFrames.ToString())
}

if ($EveryFrame) {
    $argsList += "--every-frame"
}

Push-Location $repoRoot
try {
    & $pythonCmd @argsList
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
