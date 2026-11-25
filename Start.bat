@echo off
rem Guraydingview: starts without a console window, with an icon next to the clock.
cd /d "%~dp0"
where pythonw >/dev/null 2>/dev/null && (start "" pythonw "%~dp0tray.py") || (start "" pyw "%~dp0tray.py")
exit
