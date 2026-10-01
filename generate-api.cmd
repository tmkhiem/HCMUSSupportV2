@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0generate-api.ps1"
exit /b %ERRORLEVEL%
