# Ostia 部署指南

本文件夹包含 Ostia 应用的部署配置。

## 🎯 架构说明

Ostia 使用**混合架构**：

| 服务 | 部署方式 | 端口 | 用途 |
|------|----------|------|------|
| **Nostr Relay** | Docker | 9200 | 文本消息 (NIP-17) |
| **Blossom Media** | Node.js | 9300 | 图片/文件上传 |

**为什么这样设计？**
- ✅ Nostr Relay: Docker 镜像稳定可用
- ✅ Blossom: Docker 镜像无法拉取，改用本地 Node.js

---

## 🚀 快速开始（推荐）

### 1. 启动 Blossom 服务器（图片/文件）

```bash
cd /d/Ostia/server
RUN.bat
```

Linux/macOS：

```bash
cd /path/to/Ostia/server
node blossom-server.cjs
```

**优势：**
- ✅ 无需 Docker
- ✅ 自动清理 30 天前文件
- ✅ 一键启动

### 2. 启动 Nostr Relay（文本消息）

```bash
cd /d/Ostia/deployment
docker-compose up -d nostr-relay
```

### 3. 配置 Ostia 客户端

```
设置 → 中继器 → 媒体服务器
填写: http://localhost:9300
```

---

## 📁 文件结构

```
deployment/
├── docker-compose.yml      # Nostr Relay 配置
├── relay-config.toml       # Relay 配置文件
├── docker-deploy.bat       # Windows 部署脚本
├── docker-deploy.sh        # Linux/macOS 部署脚本
├── adb-port-forward.bat    # Windows ADB 映射
├── adb-port-forward.sh     # Linux/macOS ADB 映射
└── README.md               # 本文件

server/
├── blossom-server.cjs      # Blossom Node.js 服务器
├── RUN.bat                 # Windows 一键启动脚本
└── blob-storage/           # 上传的文件存储位置
```

---

## 📱 Android 模拟器配置

使用 `adb reverse` 统一使用 `localhost`：

```bash
adb reverse tcp:9200 tcp:9200
adb reverse tcp:9300 tcp:9300
```

---

## 🔍 验证服务

### 检查 Nostr Relay (Docker)
```bash
docker-compose ps
curl http://localhost:9200
```

### 检查 Blossom (Node.js)
```bash
# 测试服务
curl http://localhost:9300/

# 查看日志（启动后会自动打开窗口）
```

---

## ⚡ 常用命令

### Docker (仅 Nostr Relay)
```bash
# 启动 Relay
docker-compose up -d nostr-relay

# 停止 Relay
docker-compose down

# 查看日志
docker-compose logs -f nostr-relay
```

### Blossom (Node.js)
```bash
# 启动
cd /d/Ostia/server
RUN.bat

# 手动停止：关闭弹出的命令窗口
```

### ADB (Android 模拟器)
```bash
# 设置映射
adb reverse tcp:9200 tcp:9200
adb reverse tcp:9300 tcp:9300

# 查看映射
adb reverse --list
```

---

## 🐛 遇到问题？

### 1. Blossom 无法启动
**检查：**
- Node.js 是否安装：`node --version`
- 端口 9300 是否被占用

### 2. Android 无法连接
```bash
# 执行端口映射
adb reverse tcp:9200 tcp:9200
adb reverse tcp:9300 tcp:9300
```

### 3. 消息收不到
- 检查两台设备使用相同的中继器地址
- 确保中继器地址格式：`ws://localhost:9200`
- 重启 Ostia 应用

### 4. 图片无法发送
- 检查 Blossom 是否运行（有命令窗口弹出）
- 客户端配置：`http://localhost:9300`

---

## 📚 详细文档

- **快速开始**: `QUICK_START.md`

---

## 🎉 开始使用

**完整启动流程：**

```bash
# 1. 启动 Blossom (图片/文件)
cd /d/Ostia/server
RUN.bat

# 2. 启动 Nostr Relay (文本消息)
cd /d/Ostia/deployment
docker-compose up -d nostr-relay

# 3. 配置客户端
# 设置 → 中继器 → 媒体服务器
# 填写: http://localhost:9300
```

祝使用愉快！🚀
