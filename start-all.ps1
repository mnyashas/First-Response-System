Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  FIRST RESPONSE SYSTEM - STARTING" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$root = "C:\Users\User\Desktop\first response system"
$backendDir = "$root\backend"
$htmlFile = "$root\frontend\index.html"

Write-Host "Step 1: Stopping any old node processes (fixes port conflicts)..." -ForegroundColor Yellow
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

Write-Host "Step 2: Starting Backend on http://localhost:5000 ..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit -Command `"cd `'$backendDir`'; npm start`""

Write-Host "Step 3: Waiting for backend to be ready..." -ForegroundColor Cyan
$backendReady = $false
for ($i = 0; $i -lt 30; $i++) {
  try {
    $r = Invoke-RestMethod -Method Get -Uri 'http://localhost:5000/health' -TimeoutSec 2 -ErrorAction Stop
    $backendReady = $true
    break
  } catch {
    Start-Sleep -Seconds 1
  }
}

if (-not $backendReady) {
  Write-Host "ERROR: Backend did not start on :5000. Check the backend PowerShell window." -ForegroundColor Red
} else {
  Write-Host "Backend is READY on http://localhost:5000" -ForegroundColor Green
}

Write-Host "Step 4: Opening frontend at file://$htmlFile ..." -ForegroundColor Green
Start-Process $htmlFile

Write-Host "" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  SYSTEM IS RUNNING" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Backend : http://localhost:5000" -ForegroundColor White
Write-Host "Frontend: file://$htmlFile  (just open in browser)" -ForegroundColor White
Write-Host "" -ForegroundColor Cyan
Write-Host "LOGIN CREDENTIALS:" -ForegroundColor Yellow
Write-Host "Patient   : Mobile 9876543210 | Aadhaar 123456789012" -ForegroundColor Yellow
Write-Host "Ambulance : Mobile 9988776655 | Aadhaar 234567890123" -ForegroundColor Yellow
Write-Host "Hospital  : any Name | any Mobile | Institution | Address | Receptionist" -ForegroundColor Yellow
Write-Host "Police    : any Name | any Mobile | Institution | Address | Receptionist" -ForegroundColor Yellow
Write-Host "" -ForegroundColor Cyan
Write-Host "KEEP THE BACKEND POWERSHELL WINDOW OPEN." -ForegroundColor Red
Write-Host "========================================" -ForegroundColor Cyan
