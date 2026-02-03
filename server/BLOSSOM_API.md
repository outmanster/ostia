# Blossom 媒体服务器 API 文档

本文档描述了 Blossom 媒体服务器的接口规范。该服务器是一个简化的媒体存储服务，兼容 Nostr Blossom (NIP-96) 协议的核心功能。

任何语言的实现都应遵循以下规范以保持兼容性。

## 1. 概述

- **协议**: HTTP/1.1 或 HTTP/2
- **端口**: 默认 9300（当前实现固定为 9300）
- **鉴权**: 可选，仅针对写操作（PUT），启用后要求 `Authorization`
- **CORS**: 必须支持跨域访问 (`Access-Control-Allow-Origin: *`)

## 2. 接口定义

### 2.1 检查服务器状态

**请求**
- `GET /`

**响应**
- `200 OK`
- `Content-Type: text/plain`
- 响应体：返回一段文本提示，例如：
  - `🌸 Local Blossom Server is running.`
  - `Usage: PUT /upload or PUT /<sha256>`
  - `GET /<sha256>`

---

### 2.2 上传文件（通用）

上传文件并由服务器计算 SHA-256 哈希。

**请求**
- `PUT /upload`
- **请求头**:
  - `Content-Type`: 文件的 MIME 类型（例如 `image/jpeg`）
  - `Authorization`: 如果启用鉴权，支持 `Bearer <AUTH_TOKEN>` 或直接传入 Token
- **请求体**: 文件的原始二进制数据

**响应**

*成功（200 OK）*
```json
{
  "url": "http://localhost:9300/a1b2c3d4...",
  "sha256": "a1b2c3d4...",
  "size": 1024,
  "type": "image/jpeg",
  "nip96": {
    "message": "Upload successful",
    "fallback": ["http://localhost:9300/a1b2c3d4..."]
  }
}
```
说明：`message` 字段当前固定返回 `Upload successful`。

*失败（401 Unauthorized）*
```json
{
  "status": "error",
  "message": "Unauthorized: Invalid or missing token"
}
```

### 2.3 上传文件（带校验）

上传文件并指定预期的 SHA-256 哈希。服务器必须校验上传内容的哈希是否与 URL 中的哈希一致。

**请求**
- `PUT /<sha256>`
- **请求头**:
  - `Content-Type`: 文件的 MIME 类型
  - `Authorization`: 如果启用鉴权，支持 `Bearer <AUTH_TOKEN>` 或直接传入 Token
- **请求体**: 文件的原始二进制数据

**逻辑要求**
1. 计算 Body 的 SHA-256 哈希。
2. 比较计算出的哈希与 URL 路径中的 `<sha256>`。
3. 如果不匹配，返回 400 错误。

**响应**

*成功（200 OK）*
同 `PUT /upload`。

*失败（400 Bad Request）*
```json
{
  "status": "error",
  "message": "Hash mismatch"
}
```

---

### 2.4 下载 / 获取文件

**请求**
- `GET /<sha256>`

**响应**

*成功（200 OK）*
- `Content-Type`: `application/octet-stream`
- `Content-Length`: 文件大小
- `Cache-Control`: `public, max-age=31536000, immutable` (建议长期缓存)
- Body: 文件二进制流

*失败（404 Not Found）*
- Body: `Not found`

---

### 2.5 CORS 预检

服务器必须响应所有路径的 OPTIONS 请求。

**请求**
- `OPTIONS *`

**响应**
- `204 No Content`
- 响应头:
  - `Access-Control-Allow-Origin: *`
  - `Access-Control-Allow-Methods: GET, PUT, HEAD, OPTIONS`
  - `Access-Control-Allow-Headers: *`

## 3. 实现细节建议

### 3.1 存储与清理（保留策略）
参考实现 (`blossom-server.cjs`) 包含自动清理逻辑：
- **存储路径**: 本地文件系统
- **过期时间**: 30 天
- **清理机制**: 
  - 启动时执行一次清理。
  - 每 24 小时执行一次清理。
  - 删除最后修改时间 (mtime) 超过 30 天的文件。
  
当前实现未限制单文件大小，客户端会在上传前限制图片大小为 25MB。

### 3.2 安全建议
- **HTTPS**: 生产环境必须使用 HTTPS（通过 Nginx/Caddy 反向代理）。
- **鉴权令牌**: 如果部署在公网，建议设置 `AUTH_TOKEN` 环境变量并在 PUT 请求中强制校验。
- **路径遍历保护**: 在处理 `GET /<sha256>` 时，必须校验哈希格式，防止 `../` 等路径遍历攻击。

### 3.3 环境变量
实现应支持以下环境变量：
- `AUTH_TOKEN`: (可选) 用于鉴权的 Token 字符串。

## 4. 参考实现
- Node.js：`server/blossom-server.cjs`
- Cloudflare Worker：`server/cloudflare/worker.js`
