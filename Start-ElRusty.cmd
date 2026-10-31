@echo off
setlocal
cd /d "%~dp0"
set "ELRUSTY_NODE=node"
where node >nul 2>nul
if errorlevel 1 (
  set "ELRUSTY_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
)
if not exist "node_modules\vite\bin\vite.js" (
  echo Installera projektets beroenden med pnpm install innan du startar.
  pause
  exit /b 1
)
echo.
echo   ElRusty - http://127.0.0.1:5173
echo   Stang detta fonster eller tryck Ctrl+C for att stoppa servern.
echo.
start "" "http://127.0.0.1:5173"
"%ELRUSTY_NODE%" "node_modules\vite\bin\vite.js" --host 127.0.0.1 --port 5173 --strictPort
if errorlevel 1 pause
