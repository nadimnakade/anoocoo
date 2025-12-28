Write-Host "🚀 Launching Anoocoo System..." -ForegroundColor Green

# 1. Start Backend
Write-Host "Starting Backend API..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "cd backend\Anooco.API; dotnet run" -WindowStyle Minimized
Write-Host "✅ Backend launching in new window..." -ForegroundColor Green

# 2. Start Frontend
Write-Host "Starting Frontend..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "cd frontend\anooco; ionic serve"
Write-Host "✅ Frontend launching..." -ForegroundColor Green

Write-Host "
⚠️ IMPORTANT CHECKS:
1. Ensure PostgreSQL is running.
2. Update 'appsettings.json' with your DB password.
3. Update 'index.html' with your Google Maps API Key.
" -ForegroundColor Yellow
