
const net = require('net');

const targets = [
    { host: '127.0.0.1', port: 9200 },
    { host: 'localhost', port: 9200 }
];

console.log("=== 中继器端口诊断 (TCP Mode) ===");

function checkPort(target) {
    return new Promise((resolve) => {
        const socket = new net.Socket();

        // Timeout 2s
        const timer = setTimeout(() => {
            console.log(`❌ [${target.host}:${target.port}] 连接超时 (2000ms)`);
            socket.destroy();
            resolve(false);
        }, 2000);

        socket.connect(target.port, target.host, () => {
            clearTimeout(timer);
            console.log(`✅ [${target.host}:${target.port}] 端口正常! (服务已启动)`);
            socket.destroy();
            resolve(true);
        });

        socket.on('error', (err) => {
            clearTimeout(timer);
            if (err.message.includes('ECONNREFUSED')) {
                console.log(`❌ [${target.host}:${target.port}] 连接被拒绝 (服务未启动或端口未映射)`);
            } else {
                console.log(`❌ [${target.host}:${target.port}] 错误: ${err.message}`);
            }
            resolve(false);
        });
    });
}

async function run() {
    for (const t of targets) {
        await checkPort(t);
    }
}

run();
