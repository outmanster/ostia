#!/bin/bash
# ADB 端口映射工具 (Linux/macOS)

set -e

echo "========================================="
echo "    ADB 端口映射工具"
echo "========================================="
echo ""

# 检查 ADB 是否安装
if ! command -v adb &> /dev/null; then
    echo "❌ 错误: ADB 未安装"
    echo ""
    echo "请安装 Android SDK Platform-Tools:"
    echo "  macOS: brew install android-platform-tools"
    echo "  Linux: sudo apt-get install android-tools-adb"
    echo "  或从 https://developer.android.com/studio/releases/platform-tools 下载"
    echo ""
    exit 1
fi

echo "✅ ADB 已安装"
echo ""

# 检查设备连接
echo "检查设备连接..."
adb devices

if [ -z "$(adb devices | grep -v "List of devices" | grep device)" ]; then
    echo ""
    echo "❌ 未检测到连接的设备"
    echo ""
    echo "请确保:"
    echo "  1. Android 模拟器已启动"
    echo "  2. 或真机已连接并开启 USB 调试"
    echo "  3. 已授权 USB 调试"
    echo ""
    exit 1
fi

echo ""
read -p "是否继续设置端口映射? (y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "已取消"
    exit 0
fi

echo ""
echo "[1/3] 设置端口映射..."
adb reverse tcp:9200 tcp:9200 && echo "✅ 9200 端口映射完成" || echo "⚠️  9200 端口映射失败"
adb reverse tcp:9300 tcp:9300 && echo "✅ 9300 端口映射完成" || echo "⚠️  9300 端口映射失败"

echo ""
echo "[2/3] 验证映射..."
adb reverse --list

echo ""
echo "[3/3] 完成!"
echo ""
echo "========================================="
echo "    配置说明"
echo "========================================="
echo ""
echo "在 Ostia 应用中配置:"
echo "  - 中继器: ws://localhost:9200"
echo "  - 媒体服务器: http://localhost:9300"
echo ""
echo "注意事项:"
echo "  1. 端口映射在设备断开连接后会失效"
echo "  2. 每次重新连接设备都需要重新执行此脚本"
echo "  3. 也可以手动执行: adb reverse tcp:9200 tcp:9200"
echo ""
