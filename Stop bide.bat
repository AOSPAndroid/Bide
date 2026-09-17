@echo off
setlocal
cd /d "%~dp0"
call "%~dp0scripts\bide.cmd" stop %*
set "BIDE_RESULT=%ERRORLEVEL%"
if /I not "%~1"=="--no-pause" pause
exit /b %BIDE_RESULT%
