# Nostr 监听 + 推送（独立 Worker）部署指南

对应脚本：[listener-worker.js](file:///d:/Ostia/server/cloudflare/listener-worker.js)

用途：定时连接 Nostr Relay 拉取新私信事件（kind=1059），发现新事件后调用你配置的“推送网关”发送提醒。

## 1. 创建 KV 命名空间
1. Cloudflare 控制台 -> **Workers & Pages** -> **KV**。
2. 点击 **Create namespace**。
3. 建议命名：`ostia-notify-kv`。

## 2. 创建 Worker
1. **Workers & Pages** -> **Overview** -> **Create application** -> **Create Worker**。
2. 例如命名：`ostia-nostr-notify`，点击 **Deploy**。

## 3. 配置代码
1. 点击 **Edit Code**。
2. 打开本地文件 [listener-worker.js](file:///d:/Ostia/server/cloudflare/listener-worker.js)，全选复制。
3. 替换网页编辑器内代码，点击 **Deploy**。

## 4. 绑定 KV
1. Worker -> **Settings** -> **Bindings** -> **Add** -> **KV namespace**。
2. **Variable name**：`NOTIFY_KV`
3. **KV namespace**：选择 `ostia-notify-kv`
4. 保存并 Deploy

## 5. 配置变量
在 Worker 的 **Settings** -> **Variables** 添加：
- `AUTH_TOKEN`: 手动触发接口用的令牌（推荐）
- `NOSTR_PUBKEY_HEX`: 公钥 hex（64 位小写十六进制，不是 npub）
- `NOSTR_RELAYS`: 逗号分隔的 Relay 列表，例如 `wss://relay.damus.io,wss://nos.lol`
- `PUSH_ENDPOINT_URL`: 推送网关地址（例如 Bark 推送中转的 `/push`）
- `PUSH_ENDPOINT_AUTH_TOKEN`: 可选，推送网关令牌（如果网关配置了 `AUTH_TOKEN`）
- `PUSH_DEVICE_KEY`: 可选，推送目标标识（例如 Bark 的设备 Key）
- `PUSH_TITLE`: 可选，默认 `Ostia 新消息`
- `NOSTR_TIMEOUT_MS`: 可选，默认 7000

## 6. 配置定时触发器（Cron）
在 Worker 的 **Settings** -> **Triggers** -> **Cron Triggers** 添加：
- `*/1 * * * *`（每分钟检查一次）

## 7. 手动触发（可选）
- `GET /health`：健康检查
- `POST /run`：立刻执行一次检查并返回 JSON

示例（curl）：
```bash
curl -X POST "https://<你的worker域名>/run" \
  -H "Authorization: Bearer <AUTH_TOKEN>"
```
