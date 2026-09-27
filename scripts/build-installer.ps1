# build-installer.ps1 — Build NSIS installer for MediBill
# Prerequisites: NSIS 3.x installed (https://nsis.sourceforge.io/)
# Usage: .\scripts\build-installer.ps1

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$PackagingDir = Join-Path $ProjectRoot "packaging\windows"
$DistDir = Join-Path $ProjectRoot "dist"

Write-Host "=== MediBill NSIS Installer Builder ===" -ForegroundColor Cyan

# Verify NSIS is installed
$NsisPath = if (Test-Path "C:\Program Files (x86)\NSIS\makensis.exe") {
    "C:\Program Files (x86)\NSIS\makensis.exe"
} elseif (Test-Path "C:\Program Files\NSIS\makensis.exe") {
    "C:\Program Files\NSIS\makensis.exe"
} else {
    $null
}

if (-not $NsisPath) {
    Write-Host "ERROR: NSIS not found." -ForegroundColor Red
    Write-Host "Download from: https://nsis.sourceforge.io/Download" -ForegroundColor Yellow
    Write-Host "After installing, run this script again." -ForegroundColor Yellow
    exit 1
}

# Verify dist exists
if (-not (Test-Path $DistDir)) {
    Write-Host "ERROR: dist folder not found. Run build-dist.ps1 first." -ForegroundColor Red
    exit 1
}

Write-Host "NSIS found at: $NsisPath" -ForegroundColor Green
Write-Host "Building installer from: $PackagingDir" -ForegroundColor Gray

Push-Location $PackagingDir
try {
    & $NsisPath "installer.nsi"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: NSIS build failed with exit code $LASTEXITCODE" -ForegroundColor Red
        exit 1
    }
} finally {
    Pop-Location
}

$InstallerPath = Join-Path $ProjectRoot "MediBill-Setup.exe"
if (Test-Path $InstallerPath) {
    $Size = (Get-Item $InstallerPath).Length / 1MB
    Write-Host "`n=== Installer ready ===" -ForegroundColor Green
    Write-Host "Output: $InstallerPath" -ForegroundColor Cyan
    Write-Host "Size: $([math]::Round($Size, 1)) MB" -ForegroundColor White
} else {
    Write-Host "ERROR: Installer was not created" -ForegroundColor Red
    exit 1
}
