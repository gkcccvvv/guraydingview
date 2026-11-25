@echo off
rem Grafik Masasi: konsol penceresi olmadan, saatin yanindaki simgeyle baslatir.
cd /d "%~dp0"
where pythonw >nul 2>nul && (start "" pythonw "%~dp0tray.py") || (start "" pyw "%~dp0tray.py")
exit
