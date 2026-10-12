@echo off
title PMR - Price & Availability Tracker
echo ============================================================
echo   Starting PMR Price & Availability Tracker...
echo ============================================================
echo.
start "" http://localhost:3000

:: Check if standard node is available
where node >nul 2>nul
if %errorlevel% equ 0 (
    node server.js
) else (
    :: Fallback to Antigravity's built-in Node.js
    "%APPDATA%\Antigravity\bin\agy-node.cmd" server.js
)
pause
