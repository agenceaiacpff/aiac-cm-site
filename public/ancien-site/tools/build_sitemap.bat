@echo off
REM AIAC — Générer site-map.json (Windows)
cd /d "%~dp0.."
python tools\generate_sitemap.py
pause
