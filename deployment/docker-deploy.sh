#!/bin/bash
# Ostia Docker 部署脚本
# 用于部署 Nostr Relay 和 Blossom Media Server

set -e

echo "========================================="
echo "    Ostia Docker 部署脚本"
echo "========================================="
echo ""

# 检查 Docker 是否安装
if ! command -v docker &> /dev/null; then
    echo "❌ 错误: Docker 未安装"
    echo "请先安装 Docker: https://docs.docker.com/get-docker/"
    exit 1
fi

# 检查 Docker Compose 是否安装
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ 错误: Docker Compose 未安装"
    echo "请先安装 Docker Compose: https://docs.docker.com/compose/install/"
    exit 1
fi

# 确定使用 docker-compose 还是 docker compose
if command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
elif docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
else
    echo "❌ 错误: 无法确定 Docker Compose 命令"
    exit 1
fi

echo "✅ Docker 检查通过"
echo "使用命令: $COMPOSE_CMD"
echo ""

# 检查配置文件
if [ ! -f "docker-compose.yml" ]; then
    echo "❌ 错误: docker-compose.yml 文件不存在"
    exit 1
fi

if [ ! -f "relay-config.toml" ]; then
    echo "❌ 错误: relay-config.toml 文件不存在"
    exit 1
fi

echo "✅ 配置文件检查通过"
echo ""

# 创建数据目录
mkdir -p ./relay-data
mkdir -p ./blossom-data

echo "📁 创建数据目录:"
echo "   - ./relay-data (Nostr Relay 数据)"
echo "   - ./blossom-data (Blossom 媒体文件)"
echo ""

# 设置权限 (Linux/macOS)
if [ "$(uname)" != "MINGW"* ] && [ "$(uname)" != "MSYS"* ]; then
    chmod 755 ./relay-data
    chmod 755 ./blossom-data
    echo "✅ 设置数据目录权限"
    echo ""
fi

# 显示配置信息
echo "========================================="
echo "    部署配置信息"
echo "========================================="
echo ""
echo "Nostr Relay (文本消息):"
echo "  - 端口: 9200"
echo "  - 地址: http://localhost:9200"
echo "  - 数据: ./relay-data"
echo ""
echo "Blossom Media Server (图片/文件):"
echo "  - 端口: 9300"
echo "  - 地址: http://localhost:9300"
echo "  - 数据: ./blossom-data"
echo "  - 最大文件: 25MB"
echo ""
echo "========================================="
echo ""

# 询问是否开始部署
read -p "是否开始部署? (y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ 已取消部署"
    exit 0
fi

echo "🚀 开始部署..."
echo ""

# 停止并删除旧容器（如果存在）
echo "1. 清理旧容器..."
$COMPOSE_CMD down 2>/dev/null || true

# 拉取镜像
echo "2. 拉取镜像..."
$COMPOSE_CMD pull

# 启动服务
echo "3. 启动服务..."
$COMPOSE_CMD up -d

echo ""
echo "========================================="
echo "    部署完成!"
echo "========================================="
echo ""
echo "服务状态:"
$COMPOSE_CMD ps
echo ""
echo "查看日志:"
echo "  $COMPOSE_CMD logs -f nostr-relay"
echo "  $COMPOSE_CMD logs -f blossom-server"
echo ""
echo "停止服务:"
echo "  $COMPOSE_CMD down"
echo ""
echo "重启服务:"
echo "  $COMPOSE_CMD restart"
echo ""
echo "========================================="
echo ""
echo "📱 Ostia 客户端配置:"
echo ""
echo "1. 打开 Ostia 应用"
echo "2. 进入设置 -> 中继器设置"
echo "3. 添加自定义中继器: ws://YOUR_SERVER_IP:9200"
echo "4. 设置媒体服务器: http://YOUR_SERVER_IP:9300"
echo ""
echo "Android 模拟器配置:"
echo "  # 执行端口映射"
echo "  adb reverse tcp:9200 tcp:9200"
echo "  adb reverse tcp:9300 tcp:9300"
echo ""
echo "  # 然后在 Ostia 中配置:"
echo "  - 中继器: ws://localhost:9200"
echo "  - 媒体服务器: http://localhost:9300"
echo ""
echo "注意:"
echo "  - 本机测试: 使用 localhost"
echo "  - 局域网/公网: 使用服务器IP"
echo "  - Android 模拟器: 使用 adb reverse + localhost"
echo ""
