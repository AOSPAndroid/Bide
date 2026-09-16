@echo off
cd /d "%~dp0"
call "%~dp0Install Dependencies.bat" %*
exit /b %ERRORLEVEL%
