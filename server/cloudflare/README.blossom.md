# Blossom 媒体服务器（KV 版）部署指南

对应脚本：[blossom-worker.js](file:///d:/Ostia/server/cloudflare/blossom-worker.js)

特点：
- 存储使用 Cloudflare KV，单文件最大 25MB
- 上传时对每个文件设置 30 天 TTL（30 天后该文件 key 自动过期）
- 可选 `AUTH_TOKEN` 做写入鉴权

## 1. 创建 KV 命名空间
1. 打开 Cloudflare 控制台 -> **Workers & Pages** -> **KV**。
2. 点击 **Create namespace**。
3. 建议命名：`ostia-media-kv`。

## 2. 创建 Worker
1. **Workers & Pages** -> **Overview** -> **Create application** -> **Create Worker**。
2. 例如命名：`ostia-media`，点击 **Deploy**。

## 3. 配置代码
1. 点击 **Edit Code**。
2. 打开本地文件 [blossom-worker.js](file:///d:/Ostia/server/cloudflare/blossom-worker.js)，全选复制。
3. 替换网页编辑器内代码，点击 **Deploy**。

## 4. 绑定 KV
1. Worker -> **Settings** -> **Bindings** -> **Add** -> **KV namespace**。
2. **Variable name**：`MEDIA_KV`
3. **KV namespace**：选择 `ostia-media-kv`
4. 保存并 Deploy

## 5.（可选）开启写入鉴权
在 Worker -> **Settings** -> **Variables** 添加：
- `AUTH_TOKEN`: 令牌字符串（用于 PUT 上传鉴权）

## 6. 使用方式
- `GET /<sha256>`：下载
- `HEAD /<sha256>`：探测
- `PUT /upload`：上传（服务端计算 sha256）
- `PUT /<sha256>`：上传并校验 sha256
