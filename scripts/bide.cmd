@echo off
setlocal EnableExtensions DisableDelayedExpansion
set "BIDE_NODE_EXE="
if defined BIDE_NODE goto explicit_node
if exist "C:\devhome\tools\node24\current\node.exe" set "BIDE_NODE_EXE=C:\devhome\tools\node24\current\node.exe"
if defined BIDE_NODE_EXE goto run
for /f "delims=" %%N in ('where.exe node.exe 2^>nul') do if not defined BIDE_NODE_EXE set "BIDE_NODE_EXE=%%N"
if defined BIDE_NODE_EXE goto run
echo bide: Node.js 22 or newer was not found. Use your existing installation on PATH,
echo in C:\devhome\tools\node24\current, or set BIDE_NODE to the full path to node.exe.
echo Nothing was downloaded.
exit /b 1

:explicit_node
if exist "%BIDE_NODE%" set "BIDE_NODE_EXE=%BIDE_NODE%"
if defined BIDE_NODE_EXE goto run
echo bide: BIDE_NODE does not point to an existing node.exe. Nothing was downloaded.
exit /b 1

:run
"%BIDE_NODE_EXE%" "%~dp0windows.mjs" %*
exit /b %ERRORLEVEL%
