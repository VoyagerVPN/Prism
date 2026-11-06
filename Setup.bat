@echo off
chcp 65001 >nul
if not "%~1"=="" goto install
powershell.exe -NoLogo -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0app\Connect.ps1"
if errorlevel 11 goto failed
if errorlevel 10 goto install
if errorlevel 1 goto failed
exit /b 0

:install
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Setup.ps1" %*
if errorlevel 1 goto failed
exit /b 0

:failed
pause
exit /b 1
