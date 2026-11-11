@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is not installed or is missing from PATH. Install Node.js 22 and reopen the terminal.
  pause
  exit /b 1
)
if not exist ".env" (
  echo Missing .env file. Configure it using RUN-LOCAL.md before starting.
  pause
  exit /b 1
)
if not exist "node_modules\concurrently" (
  echo Dependencies are missing. Run npm.cmd ci in this folder first.
  pause
  exit /b 1
)
echo Keep this window open while using ORQIX.
echo Website: http://127.0.0.1:5173
echo Press Ctrl+C to stop.
call npm.cmd run dev
if errorlevel 1 (
  echo Startup failed. Please copy the error above before closing this window.
  pause
  exit /b 1
)
