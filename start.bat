@echo off
:: ═══════════════════════════════════════════════════════
::  Hevi Explorer — Windows Launcher
::  Double-click this file OR run in Command Prompt
:: ═══════════════════════════════════════════════════════
title Hevi Explorer Setup

echo.
echo  Starting Hevi Explorer setup...
echo.

:: Try PowerShell first (preferred — smarter setup)
where powershell >nul 2>&1
if %errorlevel% == 0 (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
    goto :end
)

:: Fallback: basic batch setup if PowerShell is somehow missing
echo  PowerShell not found — using basic setup...
echo.

:: Check Node
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  [!!] Node.js not found.
    echo  [>>] Please install from: https://nodejs.org
    echo  [>>] Then re-run this file.
    pause
    exit /b 1
)
echo  [OK] Node.js found

:: npm install
if not exist "node_modules\" (
    echo  [>>] Installing packages...
    npm install
    if %errorlevel% neq 0 (
        echo  [!!] npm install failed. Retrying...
        npm install --legacy-peer-deps
    )
)
echo  [OK] Packages ready

:: Start
echo.
echo  [OK] Starting Hevi Explorer...
echo.
node server.js

:end
