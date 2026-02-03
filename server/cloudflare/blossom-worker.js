/**
 * Cloudflare Worker: Blossom Media Server
 * 
 * 这是一个为 Cloudflare Workers + R2 优化的 Blossom 媒体服务器实现。
 * 它支持：
 * - GET /<sha256> (下载)
 * - PUT /<sha256> (带校验上传)
 * - PUT /upload (普通上传)
 * - OPTIONS (CORS 处理)
 */

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const method = request.method;
        const path = url.pathname.slice(1); // 移除开头的 /

        // 1. 处理 CORS
        const corsHeaders = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, PUT, HEAD, OPTIONS",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Max-Age": "86400",
        };

        if (method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders });
        }

        // 2. 可选的身份验证控制 (仅针对写操作 PUT)
        if (method === "PUT" && env.AUTH_TOKEN) {
            const authHeader = request.headers.get("Authorization");
            const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;

            if (token !== env.AUTH_TOKEN) {
                return new Response(
                    JSON.stringify({ status: "error", message: "Unauthorized: Invalid or missing token" }),
                    { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }
        }

        // 3. 处理首页 (Root)
        if (path === "" && method === "GET") {
            return new Response(
                "🌸 Cloudflare KV Blossom Server is running.\n\nUsage:\nPUT /upload or PUT /<sha256>\nGET /<sha256>",
                {
                    headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
                }
            );
        }

        // 4. 处理上传 (PUT)
        if (method === "PUT") {
            const isUploadPath = path === "upload";
            const urlHash = !isUploadPath ? path : null;

            try {
                const arrayBuffer = await request.arrayBuffer();

                // 检查大小限制 (KV 单个限制 25MB)
                if (arrayBuffer.byteLength > 25 * 1024 * 1024) {
                    return new Response(
                        JSON.stringify({ status: "error", message: "File too large (Max 25MB for KV)" }),
                        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                    );
                }

                // 计算 SHA-256
                const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const actualHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

                // 如果 URL 中提供了 Hash，则进行校验
                if (urlHash && urlHash !== actualHash) {
                    return new Response(
                        JSON.stringify({ status: "error", message: "Hash mismatch" }),
                        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                    );
                }

                // 保存到 KV
                // expirationTtl: 30 天 (30 * 24 * 60 * 60)
                const contentType = request.headers.get("content-type") || "application/octet-stream";
                await env.MEDIA_KV.put(actualHash, arrayBuffer, {
                    expirationTtl: 30 * 24 * 60 * 60,
                    metadata: { contentType }
                });

                const fileUrl = `${url.origin}/${actualHash}`;

                const responseData = {
                    url: fileUrl,
                    sha256: actualHash,
                    size: arrayBuffer.byteLength,
                    type: contentType,
                    nip96: {
                        message: "Upload successful (KV with 30-day TTL)",
                        fallback: [fileUrl]
                    }
                };

                return new Response(JSON.stringify(responseData), {
                    status: 200,
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });

            } catch (err) {
                return new Response(
                    JSON.stringify({ status: "error", message: err.message }),
                    { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }
        }

        // 5. 处理下载 (GET)
        if (method === "GET" || method === "HEAD") {
            // 基础安全检查：确保 path 看起来像一个 hex hash
            if (!/^[a-f0-9]{64}$/.test(path)) {
                return new Response("Invalid hash format", { status: 400, headers: corsHeaders });
            }

            const { value, metadata } = await env.MEDIA_KV.getWithMetadata(path, { type: "arrayBuffer" });

            if (value === null) {
                return new Response("File not found", { status: 404, headers: corsHeaders });
            }

            const headers = new Headers({
                ...corsHeaders,
                "Content-Type": metadata?.contentType || "application/octet-stream",
                "Cache-Control": "public, max-age=31536000, immutable"
            });

            if (method === "HEAD") {
                return new Response(null, { headers });
            }

            return new Response(value, { headers });
        }

        return new Response("Not Found", { status: 404, headers: corsHeaders });
    },
};
