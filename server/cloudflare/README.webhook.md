# Webhook 推送网关部署指南

对应脚本：[webhook-worker.js](file:///d:/Ostia/server/cloudflare/webhook-worker.js)

用途：把统一的 JSON 推送请求转发为 Bark / Discord / Slack / 飞书 / 企业微信 / 钉钉等平台的 Webhook 调用。

## 1. 创建 Worker
1. **Workers & Pages** -> **Overview** -> **Create application** -> **Create Worker**。
2. 例如命名：`ostia-webhook`，点击 **Deploy**。

## 2. 配置代码
1. 点击 **Edit Code**。
2. 打开本地文件 [webhook-worker.js](file:///d:/Ostia/server/cloudflare/webhook-worker.js)，全选复制。
3. 替换网页编辑器内代码，点击 **Deploy**。

## 3. 配置变量（推荐）
在 Worker 的 **Settings** -> **Variables** 添加：
- `AUTH_TOKEN`: 调用令牌（用于防止被滥用）
- `BARK_BASE_URL`: 可选，默认 `https://api.day.app`

## 4. 调用方式
- `GET /health`：健康检查
- `POST /push/<provider>`：转发到不同平台（例如 `/push/bark`、`/push/discord`）
- `POST /push`：等价于 `/push/bark`

示例（curl）：
```bash
curl -X POST "https://<你的worker域名>/push" \
  -H "Authorization: Bearer <AUTH_TOKEN>" \
  -H "Content-Type: application/json" \
  -d "{\"deviceKey\":\"<BARK设备Key>\",\"title\":\"新消息\",\"body\":\"收到一条新消息\"}"
```
