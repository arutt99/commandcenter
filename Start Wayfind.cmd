@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22.12 or newer, then open this file again.
  pause
  exit /b 1
)
if not exist node_modules call npm ci
if errorlevel 1 goto failed
node scripts/check-build.mjs
if errorlevel 1 call npm run build
if errorlevel 1 goto failed
call npm start
if errorlevel 1 goto failed
exit /b 0
:failed
echo Wayfind could not start. Keep this message for your setup helper.
pause
exit /b 1
