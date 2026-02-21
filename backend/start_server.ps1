# Startup script for backend server (PowerShell)
# This avoids multiprocessing errors on Python 3.13

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║      CashNet Backend Server - Starting...            ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Change to backend directory
Set-Location -Path (Split-Path -Parent $PSCommandPath)

# Activate virtual environment
if (Test-Path "venv\Scripts\Activate.ps1") {
    & "venv\Scripts\Activate.ps1"
    Write-Host "✓ Virtual environment activated" -ForegroundColor Green
} else {
    Write-Host "⚠ Warning: Virtual environment not found" -ForegroundColor Yellow
    Write-Host "  Run: python -m venv venv" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "Starting FastAPI server..." -ForegroundColor Cyan
Write-Host "  • Host: 0.0.0.0" -ForegroundColor Gray
Write-Host "  • Port: 8000" -ForegroundColor Gray
Write-Host "  • Auto-reload: DISABLED (Windows compatibility)" -ForegroundColor Gray
Write-Host ""
Write-Host "💡 TIP: Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host "        Restart manually after code changes" -ForegroundColor Yellow
Write-Host ""

# Run the server
python main.py

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "❌ Server crashed or stopped with errors" -ForegroundColor Red
    Read-Host "Press Enter to exit"
}
