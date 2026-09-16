@echo off
cd /d "%~dp0"
call "%~dp0launch bide.bat" %*
exit /b %ERRORLEVEL%
