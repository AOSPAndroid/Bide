@echo off
setlocal
cd /d "%~dp0"
call "%~dp0scripts\bide.cmd" launch %*
set "BIDE_RESULT=%ERRORLEVEL%"
if not "%BIDE_RESULT%"=="0" if /I not "%~1"=="--no-browser" pause
exit /b %BIDE_RESULT%
