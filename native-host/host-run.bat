@echo off
REM wrapper to run the host.js with node
SET SCRIPT_DIR=%~dp0
node "%SCRIPT_DIR%host.js"