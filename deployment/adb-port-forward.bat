@echo off
chcp 65001 >nul
echo =========================================
echo     ADB 端口映射工具
echo =========================================
echo.

:: 检查 ADB 是否安装
adb --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] ADB 未安装或未在 PATH 中
    echo.
    echo 请安装 Android SDK Platform-Tools:
    echo https://developer.android.com/studio/releases/platform-tools
    echo.
    pause
    exit /b 1
)

echo [成功] ADB 已安装
echo.

:: 检查设备连接
echo 检查设备连接...
adb devices >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 无法连接到 ADB 服务
    pause
    exit /b 1
)

:: 获取设备列表
echo.
echo 已连接的设备:
adb devices
echo.

:: 询问是否继续
set /p "choice=是否继续设置端口映射? (Y/N): "
if /i "%choice%" neq "Y" (
    echo 已取消
    pause
    exit /b 0
)

echo.
echo [1/3] 设置端口映射...
adb reverse tcp:9200 tcp:9200
if %errorlevel% neq 0 (
    echo [警告] 9200 端口映射失败
) else (
    echo [成功] 9200 端口映射完成
)

adb reverse tcp:9300 tcp:9300
if %errorlevel% neq 0 (
    echo [警告] 9300 端口映射失败
) else (
    echo [成功] 9300 端口映射完成
)

echo.
echo [2/3] 验证映射...
adb reverse --list

echo.
echo [3/3] 完成!
echo.
echo =========================================
echo     配置说明
echo =========================================
echo.
echo 在 Ostia 应用中配置:
echo   - 中继器: ws://localhost:9200
echo   - 媒体服务器: http://localhost:9300
echo.
echo 注意事项:
echo   1. 端口映射在设备断开连接后会失效
echo   2. 每次重新连接设备都需要重新执行此脚本
echo   3. 也可以手动执行: adb reverse tcp:9200 tcp:9200
echo.
pause
