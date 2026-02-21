@echo off
echo ========================================
echo Rust-eze Simulation Lab - Backend Setup
echo ========================================
echo.

echo [1/3] Activating root virtual environment...
cd ..
call ..\venv\Scripts\activate.bat 2>nul
if errorlevel 1 (
    call ..\.venv\Scripts\activate.bat 2>nul
)
echo ✓ Virtual environment activated
echo.

echo [2/3] Installing dependencies...
pip install -r requirements.txt -q
if errorlevel 1 (
    echo ERROR: Failed to install dependencies
    pause
    exit /b 1
)
echo ✓ Dependencies installed
echo.

echo [3/3] Starting FastAPI server...
echo.
echo ========================================
echo Server starting at http://localhost:8000
echo API Docs: http://localhost:8000/docs
echo ========================================
echo.

python -m uvicorn main:app --host 0.0.0.0 --port 8000

pause
