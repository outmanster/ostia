@echo off
chcp 65001 >nul
echo ========================================
echo Blossom Server - 双击运行即可
echo ========================================
echo.
cd /d "%~dp0"
echo 正在启动服务器...
echo.
node blossom-server.cjs
