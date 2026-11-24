@echo off
rem Double-click to run Silo on this computer. Close this window (or press Ctrl+C) to stop it.
rem Uses the separate SQLite test database with local accounts. For the PostgreSQL
rem database and Google sign-in in .env, run: python scripts\start.py
title Silo
cd /d "%~dp0"
python scripts\start.py --local %*
if errorlevel 1 pause
