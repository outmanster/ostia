# Ostia Cloudflare Workers（独立部署）

本目录包含 3 个相互独立的 Worker，可以按需单独部署：
- Blossom 媒体服务器（KV 存储，30 天 TTL）：[blossom-worker.js](file:///d:/Ostia/server/cloudflare/blossom-worker.js)
- Webhook 推送网关（可选）：[webhook-worker.js](file:///d:/Ostia/server/cloudflare/webhook-worker.js)
- Nostr 私信监听 + 推送触发：[listener-worker.js](file:///d:/Ostia/server/cloudflare/listener-worker.js)

为避免混用 KV 导致理解混乱，部署时建议使用不同的 KV 绑定名与 Namespace：
- Blossom：绑定名 `MEDIA_KV`（Namespace 建议 `ostia-media-kv`）
- 监听：绑定名 `NOTIFY_KV`（Namespace 建议 `ostia-notify-kv`）

## 对应部署文档
- Blossom 媒体服务器部署：见 [README.blossom.md](file:///d:/Ostia/server/cloudflare/README.blossom.md)
- Webhook 推送网关部署：见 [README.webhook.md](file:///d:/Ostia/server/cloudflare/README.webhook.md)
- Nostr 监听 + 推送部署：见 [README.listener.md](file:///d:/Ostia/server/cloudflare/README.listener.md)
