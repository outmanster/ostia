@echo off
chcp 65001 >nul
echo =========================================
echo     Ostia Docker 部署脚本 (Windows)
echo =========================================
echo.

:: 检查 Docker 是否安装
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] Docker 未安装或未在 PATH 中
    echo 请先安装 Docker: https://docs.docker.com/get-docker/
    pause
    exit /b 1
)

echo [成功] Docker 已安装

:: 检查 docker-compose 命令
docker compose version >nul 2>&1
if %errorlevel% equ 0 (
    set COMPOSE_CMD=docker compose
    echo [成功] 使用 docker compose 命令
) else (
    docker-compose --version >nul 2>&1
    if %errorlevel% equ 0 (
        set COMPOSE_CMD=docker-compose
        echo [成功] 使用 docker-compose 命令
    ) else (
        echo [错误] 未找到 docker-compose 命令
        pause
        exit /b 1
    )
)

echo.

:: 检查配置文件
if not exist "docker-compose.yml" (
    echo [错误] docker-compose.yml 文件不存在
    pause
    exit /b 1
)

if not exist "relay-config.toml" (
    echo [错误] relay-config.toml 文件不存在
    pause
    exit /b 1
)

echo [成功] 配置文件检查通过
echo.

:: 创建数据目录
if not exist "relay-data" mkdir relay-data
if not exist "blossom-data" mkdir blossom-data
echo [成功] 数据目录已创建
echo   - relay-data (Nostr Relay 数据)
echo   - blossom-data (Blossom 媒体文件)
echo.

:: 显示配置信息
echo =========================================
echo     部署配置信息
echo =========================================
echo.
echo Nostr Relay (文本消息):
echo   - 端口: 9200
echo   - 地址: http://localhost:9200
echo   - 数据: .\relay-data
echo.
echo Blossom Media Server (图片/文件):
echo   - 端口: 9300
echo   - 地址: http://localhost:9300
echo   - 数据: .\blossom-data
echo   - 最大文件: 25MB
echo.
echo =========================================
echo.

:: 询问是否开始部署
set /p "choice=是否开始部署? (Y/N): "
if /i "%choice%" neq "Y" (
    echo 已取消部署
    pause
    exit /b 0
)

echo.
echo [信息] 开始部署...
echo.

:: 停止旧容器
echo [1/4] 清理旧容器...
%COMPOSE_CMD% down 2>nul

:: 拉取镜像
echo [2/4] 拉取镜像...
%COMPOSE_CMD% pull

:: 启动服务
echo [3/4] 启动服务...
%COMPOSE_CMD% up -d

:: 显示状态
echo [4/4] 检查状态...
echo.
%COMPOSE_CMD% ps

echo.
echo =========================================
echo     部署完成!
echo =========================================
echo.
echo 服务状态已显示在上方
echo.
echo 查看日志:
echo   %COMPOSE_CMD% logs -f nostr-relay
echo   %COMPOSE_CMD% logs -f blossom-server
echo.
echo 停止服务:
echo   %COMPOSE_CMD% down
echo.
echo 重启服务:
echo   %COMPOSE_CMD% restart
echo.
echo =========================================
echo.
echo [重要] Ostia 客户端配置:
echo.
echo 1. 打开 Ostia 应用
echo 2. 进入设置 -^> 中继器设置
echo 3. 添加自定义中继器: ws://YOUR_SERVER_IP:9200
echo 4. 设置媒体服务器: http://YOUR_SERVER_IP:9300
echo.
echo Android 模拟器配置:
echo   # 执行端口映射
echo   adb reverse tcp:9200 tcp:9200
echo   adb reverse tcp:9300 tcp:9300
echo.
echo   # 然后在 Ostia 中配置:
echo   - 中继器: ws://localhost:9200
echo   - 媒体服务器: http://localhost:9300
echo.
echo 注意:
echo   - 本机测试: 使用 localhost
echo   - 局域网/公网: 使用服务器IP
echo   - Android 模拟器: 使用 adb reverse + localhost
echo.
pause
