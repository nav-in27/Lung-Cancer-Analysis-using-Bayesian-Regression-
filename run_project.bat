@echo off
color 0B
echo =========================================================
echo  Bayesian Lung Cancer Application Launcher
echo =========================================================
echo.

echo [1/2] Spinning up Mathematical R Backend (Port 8000)...
start "Bayesian API - Plumber" cmd /c "title Bayesian API && Rscript run_api.R || echo ERROR: Is R installed? && pause"

echo -> Waiting 3 seconds for probability libraries to load...
timeout /t 3 /nobreak > nul
echo.

echo [2/2] Launching React Development Server...
cd react_frontend
start "React UI Dashboard" cmd /k "title React UI Dashboard && npm run dev"

echo.
echo =========================================================
echo  Application is LIVE!
echo  Check your newly opened terminal windows for logs.
echo  The UI should open automatically at localhost:5173
echo =========================================================
echo.
pause
