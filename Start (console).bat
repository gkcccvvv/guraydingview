@echo off
chcp 65001 >nul
title Guraydingview (console)
rem For troubleshooting: runs the server the old way, in a console window.
cd /d "%~dp0"
python server.py --open
if errorlevel 1 pause
