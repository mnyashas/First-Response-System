# First Response System - Start Everything
# Run this file to start the server + public tunnel

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  FIRST RESPONSE SYSTEM - STARTING" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Kill old processes
Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*node*' } | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Load SMS config from sms.env if present
$envFile = Join-Path $PSScriptRoot 'sms.env'
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([A-Z_]+)\s*=\s*(.+)\s*$' -and $Matches[2] -and $Matches[2] -notlike '#*') {
            [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], 'Process')
            Write-Host "  Loaded env: $($Matches[1])" -ForegroundColor DarkGray
        }
    }
}

# Start backend server
Write-Host "[1/3] Starting server on port 3000..." -ForegroundColor Yellow
$backendPath = Join-Path $PSScriptRoot 'backend'
Start-Process -FilePath 'node' -ArgumentList 'server.js' -WorkingDirectory $backendPath -WindowStyle Hidden
Start-Sleep -Seconds 3

# Verify server
try {
    $r = Invoke-WebRequest -Uri 'http://localhost:3000/' -TimeoutSec 5
    Write-Host "  Server OK ($($r.Content.Length) bytes)" -ForegroundColor Green
} catch {
    Write-Host "  Server FAILED: $_" -ForegroundColor Red
    exit 1
}

# Start cloudflared tunnel
Write-Host "[2/3] Starting public tunnel..." -ForegroundColor Yellow
$cfPath = Join-Path $PSScriptRoot 'cloudflared.exe'
if (-not (Test-Path $cfPath)) { $cfPath = 'C:\cf.exe' }
$urlFile = Join-Path $env:TEMP 'frs_tunnel_url.txt'
Remove-Item $urlFile -Force -ErrorAction SilentlyContinue

$bat = @"
@echo off
"$cfPath" tunnel --url http://localhost:3000 --no-autoupdate > "$urlFile" 2>&1
"@
$batPath = Join-Path $env:TEMP 'frs_tunnel.bat'
Set-Content -Path $batPath -Value $bat
Start-Process -FilePath $batPath -WindowStyle Hidden

Write-Host "  Waiting for tunnel..." -ForegroundColor Yellow
Start-Sleep -Seconds 18

$tunnelUrl = ''
if (Test-Path $urlFile) {
    $m = Get-Content $urlFile -ErrorAction SilentlyContinue | Select-String 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -First 1
    if ($m) { $tunnelUrl = [regex]::Match($m.ToString(), 'https://[a-z0-9-]+\.trycloudflare\.com').Value }
}

# Check SMS provider
Write-Host "[3/3] Checking SMS..." -ForegroundColor Yellow
try {
    $smsSt = Invoke-RestMethod -Uri 'http://localhost:3000/api/sms-status' -TimeoutSec 5
    if ($smsSt.provider -ne 'demo') {
        Write-Host "  SMS: $($smsSt.provider.ToUpper()) active - automatic SMS works!" -ForegroundColor Green
    } else {
        Write-Host "  SMS: Demo mode (no API key). Edit sms.env to enable real SMS." -ForegroundColor DarkYellow
        Write-Host "  FREE key: https://www.fast2sms.com -> put in sms.env -> restart" -ForegroundColor DarkYellow
    }
} catch { Write-Host "  SMS status check failed" -ForegroundColor DarkGray }

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  SYSTEM READY" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  LOCAL:   http://localhost:3000" -ForegroundColor White
if ($tunnelUrl) {
    Write-Host "  PUBLIC:  $tunnelUrl" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Open PUBLIC url on ANY device (phone, tablet, laptop)" -ForegroundColor Yellow
    Write-Host "  Works from anywhere with internet!" -ForegroundColor Yellow
} else {
    Write-Host "  LAN:     http://192.168.7.93:3000" -ForegroundColor White
    Write-Host "  (phone must be on same Wi-Fi)" -ForegroundColor Yellow
}
Write-Host ""
Write-Host "  Close this window to keep running." -ForegroundColor Gray
Write-Host "  To STOP: close node & cloudflared processes" -ForegroundColor Gray
Write-Host ""

# Keep window open
Read-Host "Press Enter to exit (server keeps running in background)"
