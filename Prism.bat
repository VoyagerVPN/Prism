@echo off
chcp 65001 >nul
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0app\Start.ps1"
if errorlevel 1 (
    pause
    exit /b 1
)
echo.
echo ComfyUI logs. Ctrl+C closes the log viewer; backend keeps running.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0app\Show-Logs.ps1"
