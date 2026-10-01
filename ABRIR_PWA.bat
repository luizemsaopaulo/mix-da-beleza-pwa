@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  start "Mix da Beleza PWA" /min py -m http.server 8087
) else (
  start "Mix da Beleza PWA" /min python -m http.server 8087
)
timeout /t 2 /nobreak >nul
start "" "http://localhost:8087"
exit
