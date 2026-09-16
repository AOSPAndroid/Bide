@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows.ps1" -Action Share -Port "%~1"
set "BIDE_RESULT=%ERRORLEVEL%"
if not "%BIDE_RESULT%"=="0" pause
exit /b %BIDE_RESULT%
