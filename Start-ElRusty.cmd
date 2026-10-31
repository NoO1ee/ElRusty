@echo off
setlocal
cd /d "%~dp0"
set "ELRUSTY_NODE=node"
where node >nul 2>nul
if errorlevel 1 set "ELRUSTY_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "node_modules\vite\bin\vite.js" (
  echo Installera beroenden med pnpm install.
  pause
  exit /b 1
)
"%ELRUSTY_NODE%" node_modules\typescript\bin\tsc -b
if errorlevel 1 goto :failed
"%ELRUSTY_NODE%" node_modules\vite\bin\vite.js build
if errorlevel 1 goto :failed
echo ElRusty Live - http://127.0.0.1:5173
echo Stang detta fonster for att stoppa tjansten.
start "" "http://127.0.0.1:5173"
"%ELRUSTY_NODE%" --experimental-transform-types server/index.ts
if errorlevel 1 goto :failed
exit /b 0
:failed
echo ElRusty kunde inte startas. Se felet ovan.
pause
exit /b 1
