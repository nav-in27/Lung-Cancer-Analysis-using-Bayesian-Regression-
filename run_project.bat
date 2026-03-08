@echo off
color 0B
echo =========================================================
echo  Bayesian Lung Cancer Application Launcher
echo =========================================================
echo.

echo Launching unified project runner...
python run_project.py

if errorlevel 1 (
  echo.
  echo Launcher exited with an error. Review logs above.
)

echo.
pause
