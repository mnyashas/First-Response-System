Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  FIRST RESPONSE SYSTEM - STARTING" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

Write-Host "Stopping any old node processes..." -ForegroundColor Yellow
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

Write-Host "Starting Backend (http://localhost:5000)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit -Command `"cd `'C:\Users\User\Desktop\first response system\backend`'; npm start`""

Write-Host "Waiting for backend to be ready..." -ForegroundColor Cyan
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
  Write-Host "WARNING: Backend did not respond on :5000. Check the backend terminal for errors." -ForegroundColor Red
} else {
  Write-Host "Backend is ready!" -ForegroundColor Green
}

Write-Host "Starting Frontend (http://localhost:5173)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit -Command `"cd `'C:\Users\User\Desktop\first response system\frontend`'; npm run dev`""

Start-Sleep -Seconds 4

Write-Host "Opening browser at http://localhost:5173/ ..." -ForegroundColor Green
Start-Process "http://localhost:5173/"

Write-Host "" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  BOTH SERVERS STARTED" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Backend : http://localhost:5000" -ForegroundColor White
Write-Host "Frontend: http://localhost:5173/" -ForegroundColor White
Write-Host "" -ForegroundColor Cyan
Write-Host "LOGIN CREDENTIALS:" -ForegroundColor Yellow
Write-Host "Patient : Mobile 9876543210 | Aadhaar 123456789012" -ForegroundColor Yellow
Write-Host "Ambulance: Mobile 9988776655 | Aadhaar 234567890123" -ForegroundColor Yellow
Write-Host "Hospital/Police: any Name, Mobile, Institution, Address, Receptionist" -ForegroundColor Yellow
Write-Host "" -ForegroundColor Cyan
Write-Host "KEEP BOTH POWERSHELL WINDOWS OPEN. Do not close them." -ForegroundColor Red
Write-Host "========================================" -ForegroundColor Cyan
