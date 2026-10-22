@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.12以降をインストールしてから、もう一度実行してください。
  pause
  exit /b 1
)
node scripts\serve.mjs --open
if errorlevel 1 pause
