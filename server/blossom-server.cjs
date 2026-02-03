const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// CONFIGURATION
const PORT = 9300; // Port 9300
const STORAGE_DIR = path.join(__dirname, 'blob-storage');
const RETENTION_DAYS = 30; // 30天自动删除
const PRUNE_INTERVAL = 24 * 60 * 60 * 1000; // 每24小时清理一次
const AUTH_TOKEN = process.env.AUTH_TOKEN; // 可选的鉴权 Token

/**
 * PUBLIC DEPLOYMENT NOTE (关于公网部署):
 * If you deploy this to a public server (VPS), you MUST use HTTPS.
 * Do not expose this script directly to the public internet via HTTP.
 * 
 * Recommended Setup (推荐配置):
 * 1. Run this script locally on the server (localhost:9300).
 * 2. Use Nginx or Caddy as a Reverse Proxy to handle SSL/HTTPS.
 * 
 * Example Caddyfile:
 * media.yourdomain.com {
 *     reverse_proxy localhost:9300
 * }
 */

// Ensure storage directory exists
if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

// 自动清理旧文件函数
function pruneOldFiles() {
    const now = Date.now();
    const cutoffTime = now - (RETENTION_DAYS * 24 * 60 * 60 * 1000);
    let deletedCount = 0;
    let totalSize = 0;

    try {
        if (!fs.existsSync(STORAGE_DIR)) return;

        const files = fs.readdirSync(STORAGE_DIR);

        files.forEach(file => {
            const filePath = path.join(STORAGE_DIR, file);
            const stat = fs.statSync(filePath);

            if (stat.isFile() && stat.mtimeMs < cutoffTime) {
                fs.unlinkSync(filePath);
                deletedCount++;
                totalSize += stat.size;
            }
        });

        if (deletedCount > 0) {
            console.log(`🧹 [PRUNE] 删除了 ${deletedCount} 个旧文件, 释放 ${formatBytes(totalSize)} 空间`);
        }
    } catch (err) {
        console.error('清理失败:', err.message);
    }
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 启动定期清理任务
setInterval(() => {
    console.log('🕒 [PRUNE] 执行定期清理检查...');
    pruneOldFiles();
}, PRUNE_INTERVAL);

// 立即执行一次清理（启动时）
setTimeout(() => {
    console.log('🚀 [PRUNE] 启动时执行首次清理...');
    pruneOldFiles();
}, 5000);

const server = http.createServer((req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Handle Upload: PUT /<sha256> or PUT /upload
    if (req.method === 'PUT') {
        // Auth Check
        if (AUTH_TOKEN) {
            const authHeader = req.headers['authorization'];
            const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;

            if (token !== AUTH_TOKEN) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'error', message: 'Unauthorized: Invalid or missing token' }));
                return;
            }
        }

        const isUploadPath = req.url === '/upload';
        // If specific hash is provided in URL, verify against it
        // Remove leading slash
        const urlHash = !isUploadPath ? req.url.substring(1) : null;

        let data = [];
        req.on('data', chunk => data.push(chunk));
        req.on('end', () => {
            const buffer = Buffer.concat(data);
            const hash = crypto.createHash('sha256').update(buffer).digest('hex');

            // Validation: If URL contained a hash, payload MUST match
            if (urlHash && urlHash !== hash) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'error', message: 'Hash mismatch' }));
                return;
            }

            fs.writeFileSync(path.join(STORAGE_DIR, hash), buffer);

            const host = req.headers.host || `localhost:${PORT}`;
            const fileUrl = `http://${host}/${hash}`;
            console.log(`Stored blob: ${hash} (${buffer.length} bytes)`);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                url: fileUrl,
                sha256: hash,
                size: buffer.length,
                type: req.headers['content-type'] || 'application/octet-stream',
                // Common Blossom/NIP-96 tags
                nip96: {
                    message: "Upload successful",
                    fallback: [fileUrl] // Fallback URLs
                }
            }));
        });
        return;
    }

    // Handle Download: GET /<sha256>
    if (req.method === 'GET') {
        const hash = req.url.substring(1);

        // Handle root path check
        if (!hash) {
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('🌸 Local Blossom Server is running.\n\nUsage:\nPUT /upload or PUT /<sha256>\nGET /<sha256>');
            return;
        }

        // Basic security check to prevent directory traversal
        if (hash.includes('..') || hash.includes('/')) {
            res.writeHead(400);
            res.end('Invalid hash');
            return;
        }

        const filePath = path.join(STORAGE_DIR, hash);

        if (fs.existsSync(filePath)) {
            const stat = fs.statSync(filePath);
            if (stat.isDirectory()) {
                res.writeHead(404);
                res.end('Not found');
                return;
            }

            // Try to guess mime type or default
            res.writeHead(200, {
                'Content-Type': 'application/octet-stream',
                'Content-Length': stat.size,
                'Cache-Control': 'public, max-age=31536000, immutable'
            });
            fs.createReadStream(filePath).pipe(res);
        } else {
            res.writeHead(404);
            res.end('Not found');
        }
        return;
    }

    res.writeHead(404);
    res.end('Not found');
});

server.listen(PORT, () => {
    console.log(`🌸 Local Blossom Server running at http://localhost:${PORT}`);
    console.log(`📂 Storage: ${STORAGE_DIR}`);
});
