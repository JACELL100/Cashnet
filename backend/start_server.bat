@echo off
REM Startup script for backend server (Windows)
REM This avoids multiprocessing errors on Python 3.13

echo.
echo ╔═══════════════════════════════════════════════════════╗
echo ║      CashNet Backend Server - Starting...            ║
echo ╚═══════════════════════════════════════════════════════╝
echo.

cd /d "%~dp0.."

REM Activate virtual environment
if exist "venv\Scripts\activate.bat" (
    call venv\Scripts\activate.bat
    echo ✓ Virtual environment activated
) else (
    echo ⚠ Warning: Virtual environment not found
    echo   Run: python -m venv venv
    pause
    exit /b 1
)

echo.
echo Starting FastAPI server...
echo   • Host: 0.0.0.0
echo   • Port: 8000
echo   • Auto-reload: DISABLED (Windows compatibility)
echo.
echo 💡 TIP: Press Ctrl+C to stop the server
echo          Restart manually after code changes
echo.

REM Run the server
python main.py

if errorlevel 1 (
    echo.
    echo ❌ Server crashed or stopped with errors
    pause
)
