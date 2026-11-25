@echo off
chcp 65001 >nul
title Grafik Masasi (konsol)
rem Sorun giderme icin: sunucuyu eski usul, konsol penceresinde calistirir.
cd /d "%~dp0"
python server.py --open
if errorlevel 1 pause
