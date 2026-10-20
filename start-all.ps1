Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  FIRST RESPONSE SYSTEM - STARTING" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$root = "C:\Users\User\Desktop\first response system"
$backendDir = "$root\backend"
$frontendDir = "$root\frontend"

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
  Write-Host "ERROR: Backend did not start on :5000. Check the backend PowerShell window for errors." -ForegroundColor Red
  Write-Host "You can still try opening the frontend, but API calls will fail." -ForegroundColor Yellow
} else {
  Write-Host "Backend is READY on http://localhost:5000" -ForegroundColor Green
}

Write-Host "Step 4: Starting Frontend on http://localhost:3000 ..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit -Command `"cd `'$frontendDir`'; npm run dev`""

Write-Host "Step 5: Waiting a few seconds for frontend..." -ForegroundColor Cyan
Start-Sleep -Seconds 5

Write-Host "Step 6: Opening browser at http://localhost:3000/ ..." -ForegroundColor Green
Start-Process "http://localhost:3000/"

Write-Host "" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  SYSTEM IS RUNNING" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Backend : http://localhost:5000" -ForegroundColor White
Write-Host "Frontend: http://localhost:3000/" -ForegroundColor White
Write-Host "" -ForegroundColor Cyan
Write-Host "LOGIN CREDENTIALS:" -ForegroundColor Yellow
Write-Host "Patient   : Mobile 9876543210 | Aadhaar 123456789012" -ForegroundColor Yellow
Write-Host "Ambulance : Mobile 9988776655 | Aadhaar 234567890123" -ForegroundColor Yellow
Write-Host "Hospital  : any Name | any Mobile | Institution | Address | Receptionist" -ForegroundColor Yellow
Write-Host "Police    : any Name | any Mobile | Institution | Address | Receptionist" -ForegroundColor Yellow
Write-Host "" -ForegroundColor Cyan
Write-Host "KEEP BOTH POWERSHELL WINDOWS OPEN. Do not close them." -ForegroundColor Red
Write-Host "========================================" -ForegroundColor Cyan
