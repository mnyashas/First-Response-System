Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  FIRST RESPONSE SYSTEM - STARTING" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$root = "C:\Users\User\Desktop\first response system"

Write-Host "Stopping any old node processes..." -ForegroundColor Yellow
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

Write-Host "Starting server on http://localhost:3000 ..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit -Command `"cd `'$root\backend`'; npm start`""

Start-Sleep -Seconds 3

Write-Host "Opening browser..." -ForegroundColor Green
Start-Process "http://localhost:3000/"

Write-Host "" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  SYSTEM IS RUNNING" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "URL: http://localhost:3000/" -ForegroundColor White
Write-Host "" -ForegroundColor Cyan
Write-Host "LOGIN:" -ForegroundColor Yellow
Write-Host "Patient   : Mobile 9876543210 | Aadhaar 123456789012" -ForegroundColor Yellow
Write-Host "Ambulance : Mobile 9988776655 | Aadhaar 234567890123" -ForegroundColor Yellow
Write-Host "Hospital  : any Name/Mobile | Institution/Address/Receptionist" -ForegroundColor Yellow
Write-Host "Police    : any Name/Mobile | Institution/Address/Receptionist" -ForegroundColor Yellow
Write-Host "" -ForegroundColor Cyan
Write-Host "KEEP THE POWERSHELL WINDOW OPEN." -ForegroundColor Red
Write-Host "========================================" -ForegroundColor Cyan
