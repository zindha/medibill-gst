# build-dist.ps1 — Build MediBill distribution package for Windows
# Usage: .\scripts\build-dist.ps1

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

Write-Host "=== MediBill Distribution Builder ===" -ForegroundColor Cyan

$DistDir = Join-Path $ProjectRoot "dist"
$ServerDist = Join-Path $ProjectRoot "apps\server\dist"
$WebDist = Join-Path $ProjectRoot "apps\web\dist"

# Clean previous dist
if (Test-Path $DistDir) {
    Write-Host "Cleaning previous dist..." -ForegroundColor Yellow
    Remove-Item $DistDir -Recurse -Force
}

# Step 1: Build frontend
Write-Host "`n[1/4] Building frontend..." -ForegroundColor Green
Push-Location (Join-Path $ProjectRoot "apps\web")
npx vite build
Pop-Location
if (-not (Test-Path $WebDist)) {
    Write-Host "ERROR: Vite build failed - no web dist found" -ForegroundColor Red
    exit 1
}

# Step 2: Build server
Write-Host "`n[2/4] Building server..." -ForegroundColor Green
Push-Location (Join-Path $ProjectRoot "apps\server")
npx tsc -b
Pop-Location
if (-not (Test-Path $ServerDist)) {
    Write-Host "ERROR: Server build failed - no dist found" -ForegroundColor Red
    exit 1
}

# Step 3: Copy files into dist/
Write-Host "`n[3/4] Assembling distribution..." -ForegroundColor Green
New-Item -ItemType Directory -Path $DistDir -Force | Out-Null

# Copy frontend
$TargetWeb = Join-Path $DistDir "web"
Copy-Item $WebDist $TargetWeb -Recurse -Force

# Copy server (exclude node_modules, .git etc - already done by tsc)
$TargetServer = Join-Path $DistDir "server"
Copy-Item $ServerDist $TargetServer -Recurse -Force

# Copy catalog sources used to build the isolated reference catalog at runtime.
$TargetData = Join-Path $DistDir "data"
New-Item -ItemType Directory -Path $TargetData -Force | Out-Null
Copy-Item (Join-Path $ProjectRoot "data\medicineCatalog.jsonl") $TargetData -Force
Copy-Item (Join-Path $ProjectRoot "data\curatedMedicineCatalog.jsonl") $TargetData -Force

# Copy node_modules needed at runtime
Write-Host "Copying runtime dependencies..." -ForegroundColor Gray
$RuntimeModules = @(
    "better-sqlite3",
    "drizzle-orm",
    "fastify",
    "@fastify",
    "argon2",
    "nanoid",
    "pino",
    "zod",
    "node-cron",
    "@aws-sdk",
    "@oslojs",
    "clsx",
    "date-fns",
    "recharts",
    "react",
    "react-dom",
    "react-router",
    "zod"
)
foreach ($mod in $RuntimeModules) {
    $src = Join-Path (Join-Path $ProjectRoot "apps\server\node_modules") $mod
    $dst = Join-Path $TargetServer "node_modules" $mod
    if (Test-Path $src) {
        Copy-Item $src $dst -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# Step 4: Create launcher scripts
Write-Host "`n[4/4] Creating launcher scripts..." -ForegroundColor Green

$StartBat = @'
@echo off
title MediBill Server
cd /d "%~dp0server"
set DATA_DIR=%APPDATA%\MediBill\data
if not exist "%DATA_DIR%" mkdir "%DATA_DIR%"
echo Starting MediBill Server...
echo Open http://localhost:5173 in your browser
node src\index.js
pause
'@
Set-Content -Path (Join-Path $DistDir "start.bat") -Value $StartBat -Encoding ASCII

$StopBat = @'
@echo off
echo Stopping MediBill server...
taskkill /F /IM node.exe 2>nul
echo Done.
pause
'@
Set-Content -Path (Join-Path $DistDir "stop.bat") -Value $StopBat -Encoding ASCII

# Create empty DB placeholder
"" | Out-File (Join-Path $DistDir "medibill.db") -Encoding ASCII

# Create app icon placeholder (readme note)
$IconNote = @"
# App Icon
Place your 256x256 .ico file here as `app.ico` before building the installer.
Download the NSIS tools from: https://nsis.sourceforge.io/
Build the installer with: makensis installer.nsi
"@
Set-Content -Path (Join-Path $DistDir "README-ICONS.txt") -Value $IconNote -Encoding ASCII

Write-Host "`n=== Distribution ready ===" -ForegroundColor Green
Write-Host "Output: $DistDir" -ForegroundColor Cyan
Write-Host "To run: double-click start.bat" -ForegroundColor White
Write-Host "To install: run build-installer.ps1 from the packaging\windows folder" -ForegroundColor White
