@echo off
setlocal EnableDelayedExpansion

:: Directory of this script
set "BASEDIR=%~dp0"

title Parliament Talk Time Management System - Production Launcher

echo.
echo ========================================
echo   PARLIAMENT TALK TIME MANAGEMENT SYSTEM
echo           (Production Preview)
echo ========================================
echo.
echo   Starting backend + optimized frontend...
echo.

:: Kill existing processes on ports 3000 / 5000 (if any)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000.*LISTENING" 2^>nul') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5000.*LISTENING" 2^>nul') do taskkill /F /PID %%a >nul 2>&1

:: Backend
echo   [1/2] Starting backend (port 5000)...
start "Parliament-Backend" /MIN cmd /k "cd /d "%BASEDIR%web_app" && title Backend-Prod-5000 && python app.py"

:: Build + preview frontend
echo   [2/2] Building optimized frontend bundle...
pushd "%BASEDIR%react-app"
call npm run build
echo   Launching production preview on port 3000 (LAN accessible)...
start "Parliament-Preview" /MIN cmd /k "cd /d "%BASEDIR%react-app" && title Frontend-Prod-3000 && npm run preview -- --host 0.0.0.0 --port 3000"
popd

:: Wait a moment for servers to start
timeout /t 3 /nobreak >nul

:: Open Chrome with localhost:3000
echo   Opening Chrome...
start "" "chrome" "http://localhost:3000"

echo.
echo ========================================
echo   READY!
echo   Main controller: http://localhost:3000
echo   Remote viewers: http://<controller-ip>:3000/broadcast?remote=1
echo ========================================
echo.
pause


