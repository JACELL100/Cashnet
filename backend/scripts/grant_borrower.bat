@echo off
REM Grant BORROWER_ROLE to a wallet address
REM Usage: grant_borrower.bat <wallet_address>

if "%1"=="" (
    echo Usage: grant_borrower.bat ^<wallet_address^>
    echo Example: grant_borrower.bat 0xceB0045BFD429eC942aDEc9e84B1F0f2c52C29AD
    exit /b 1
)

cd /d "%~dp0"
cd ..

if exist "venv\Scripts\activate.bat" (
    call venv\Scripts\activate.bat
)

python scripts\grant_borrower_role.py %1

pause
