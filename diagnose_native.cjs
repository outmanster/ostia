
// Node.js v22 has native WebSocket support.
// We'll use a try-catch to fallback to using the 'net' module if WebSocket is not globally available.

const relays = [
    { url: 'ws://127.0.0.1:9200', host: '127.0.0.1', port: 9200 },
    { url: 'ws://localhost:9200', host: 'localhost', port: 9200 },
    { url: 'wss://ostia-relay.opensaas.cc', host: 'ostia-relay.opensaas.cc', port: 443 }
];

console.log("=== 中继器连接诊断工具 (v2 - Native) ===");

async function testRelay(relay) {
    console.log(`\nTesting: ${relay.url}`);

    // Try Native WebSocket first (Node 22+)
    if (typeof WebSocket !== 'undefined') {
        try {
            await new Promise((resolve, reject) => {
                const ws = new WebSocket(relay.url);
                const timer = setTimeout(() => {
                    ws.close();
                    reject(new Error("Timeout (3s)"));
                }, 3000);

                ws.onopen = () => {
                    clearTimeout(timer);
                    console.log(`✅ [WebSocket] Connection Successful!`);
                    ws.close();
                    resolve();
                };

                ws.onerror = (e) => {
                    clearTimeout(timer);
                    ws.close();
                    // Native WS error events don't always have messages in Node
                    reject(new Error("WebSocket Error Event Triggered"));
                };
            });
            return;
        } catch (e) {
            console.log(`⚠️ [WebSocket] Failed: ${e.message}`);
        }
    } else {
        console.log("⚠️ Native WebSocket not available in this Node environment.");
    }

    // Fallback: Use 'net' module to check TCP port (only works for non-TLS usually, or raw TCP check)
    // For wss://, net.connect needs port 443.
    const net = require('net');
    console.log(`   -> Falling back to TCP socket check on ${relay.host}:${relay.port}...`);

    try {
        await new Promise((resolve, reject) => {
            const socket = new net.Socket();
            const timer = setTimeout(() => {
                socket.destroy();
                reject(new Error("TCP Connect Timeout (3s)"));
            }, 3000);

            socket.connect(relay.port, relay.host, () => {
                clearTimeout(timer);
                console.log(`✅ [TCP] Port is OPEN and accepting connections.`);
                socket.destroy();
                resolve();
            });

            socket.on('error', (err) => {
                clearTimeout(timer);
                socket.destroy();
                reject(err);
            });
        });
    } catch (e) {
        console.log(`❌ [TCP] Connection Failed: ${e.message}`);
        if (e.message.includes('ECONNREFUSED')) {
            console.log(`   *** 结论: 服务未运行或被防火墙拦截 ***`);
        }
    }
}

async function run() {
    for (const relay of relays) {
        await testRelay(relay);
    }
}

run();
