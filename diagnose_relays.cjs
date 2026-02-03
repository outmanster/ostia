
const WebSocket = require('ws');

const relays = [
    'ws://127.0.0.1:9200',
    'ws://localhost:9200',
    'wss://ostia-relay.opensaas.cc'
];

console.log("=== 中继器连接诊断工具 ===");
console.log("正在尝试连接以下中继器...");

relays.forEach(url => {
    console.log(`[${url}] 正在发起连接...`);
    const start = Date.now();
    
    try {
        const ws = new WebSocket(url);

        ws.on('open', () => {
            const time = Date.now() - start;
            console.log(`✅ [${url}] 连接成功! (耗时: ${time}ms)`);
            ws.close();
        });

        ws.on('error', (err) => {
            console.log(`❌ [${url}] 连接失败: ${err.message}`);
            if (err.message.includes('ECONNREFUSED')) {
                console.log(`   -> 原因: 目标端口拒绝连接。请确认中继器服务是否已启动？`);
            }
        });

        // 5秒超时
        setTimeout(() => {
            if (ws.readyState === WebSocket.CONNECTING) {
                console.log(`⚠️ [${url}] 连接超时 (5000ms)`);
                ws.terminate();
            }
        }, 5000);

    } catch (e) {
        console.log(`❌ [${url}] 初始化错误: ${e.message}`);
    }
});
