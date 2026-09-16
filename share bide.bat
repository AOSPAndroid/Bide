@echo off
setlocal
cd /d "%~dp0"
call "%~dp0scripts\bide.cmd" share %*
set "BIDE_RESULT=%ERRORLEVEL%"
if not "%BIDE_RESULT%"=="0" if /I not "%~1"=="--no-pause" if /I not "%~2"=="--no-pause" pause
exit /b %BIDE_RESULT%
