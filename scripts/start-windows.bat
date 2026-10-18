@echo off
rem Starts the WhatsApp summarizer on Windows. Double-click this file.
rem To start it at login: press Win+R, type shell:startup, and put a shortcut to this file there.
cd /d "%~dp0\.."
title WhatsApp summarizer
node --disable-warning=ExperimentalWarning --disable-warning=DEP0040 src\index.js
echo.
echo The bot stopped. Press any key to close this window.
pause >nul
