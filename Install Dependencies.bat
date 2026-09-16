@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows.ps1" -Action Install
set "BIDE_RESULT=%ERRORLEVEL%"
if /I not "%~1"=="--no-pause" pause
exit /b %BIDE_RESULT%
