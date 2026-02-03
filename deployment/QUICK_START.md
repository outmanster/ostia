# Ostia 快速启动指南

## 🚀 3 步启动（推荐）

```bash
# 1. 启动 Blossom（图片/文件服务器）
cd /d/Ostia/server
RUN.bat

# 2. 启动 Nostr Relay（文本消息服务器）
cd /d/Ostia/deployment
docker-compose up -d nostr-relay

# 3. 配置客户端
# 设置 → 中继器 → 媒体服务器
# 填写: http://localhost:9300
```

**完成！** 现在可以发送图片和消息了。

> 💡 **提示**: Linux/macOS 请使用 `node blossom-server.cjs` 启动。

---

## 📋 架构说明

| 服务 | 部署方式 | 端口 | 状态 |
|------|----------|------|------|
| Nostr Relay | Docker | 9200 | ✅ 文本消息 |
| Blossom | Node.js | 9300 | ✅ 图片上传 |

**为什么混合部署？**
- Nostr Relay: Docker 镜像稳定
- Blossom: Docker 镜像无法拉取，改用 Node.js

---

## 🔍 验证服务

```bash
# 测试 Nostr Relay
curl http://localhost:9200

# 测试 Blossom
curl http://localhost:9300/
```

---

## 📱 Android 模拟器

```bash
# 执行端口映射
adb reverse tcp:9200 tcp:9200
adb reverse tcp:9300 tcp:9300
```

配置：
- 中继器: `ws://localhost:9200`
- 媒体服务器: `http://localhost:9300`

---

## 🎯 公共服务器（备选）

如果不想本地运行，使用公共 Blossom 服务器：

```
中继器 → 媒体服务器 → https://blossom-relay.f7z.io
```

---

## 🛠️ 管理命令

### Nostr Relay (Docker)
```bash
# 启动
docker-compose up -d nostr-relay

# 停止
docker-compose down

# 查看日志
docker-compose logs -f nostr-relay
```

### Blossom (Node.js)
```bash
# 启动
cd /d/Ostia/server
RUN.bat

# 停止：关闭弹出的命令窗口
```

---

## ⚙️ 服务器配置

### Blossom 自动清理
- **保留时间**: 30 天
- **清理频率**: 每 24 小时
- **存储位置**: `server/blob-storage/`

### Nostr Relay 配置
- **配置文件**: `deployment/relay-config.toml`（当前 Docker 镜像未加载该文件）
- **数据存储**: `deployment/relay-data/`

---

## 🐛 常见问题

### 1. Blossom 无法启动
```bash
# 检查 Node.js
node --version

# 检查端口占用
netstat -ano | findstr :9300
```

### 2. Android 无法连接
```bash
# 重新执行端口映射
adb reverse tcp:9200 tcp:9200
adb reverse tcp:9300 tcp:9300
adb reverse --list
```

### 3. 图片发送失败
- 确认 Blossom 正在运行（有命令窗口）
- 客户端配置：`http://localhost:9300`
- 检查端口是否被防火墙阻止

---

## 📊 查看统计

在 Ostia 客户端中：
```
设置 → 存储（第4个图标）
```

可以查看：
- 消息数量
- 联系人数量
- 删除记录
- 最旧消息天数

并执行手动清理：
- 清理所有旧消息
- 清理陌生人消息
- 仅压缩数据库

---

## 🎉 开始使用

**推荐测试流程：**

1. ✅ 启动两个服务
2. ✅ 配置客户端媒体服务器
3. ✅ 在另一台设备/模拟器上配置相同中继器
4. ✅ 发送测试图片
5. ✅ 检查存储统计

祝使用愉快！🚀
