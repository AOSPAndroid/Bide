@echo off
setlocal
cd /d "%~dp0"
set "BIDE_OPTIONS="
if /I "%~1"=="--no-browser" set "BIDE_OPTIONS=-NoBrowser"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows.ps1" -Action Launch %BIDE_OPTIONS%
set "BIDE_RESULT=%ERRORLEVEL%"
if not "%BIDE_RESULT%"=="0" if /I not "%~1"=="--no-browser" pause
exit /b %BIDE_RESULT%
