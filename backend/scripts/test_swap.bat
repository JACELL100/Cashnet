@echo off
echo ================================================
echo REAL BLOCKCHAIN SWAP TEST
echo Using Palladium & Badassium on Sepolia
echo ================================================
echo.

cd ..
call venv\Scripts\activate.bat

echo Testing real on-chain swap...
python test_real_swap.py

echo.
echo ================================================
pause
