#!/usr/bin/env node
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const LOCAL_DIR_NAME = '.panel-feedback';
const BASE_PORT = 34600;

function makeRequest(port, prompt) {
    return new Promise((resolve) => {
        const data = JSON.stringify({ prompt, requestId: Date.now().toString() });
        const options = {
            hostname: '127.0.0.1',
            port,
            path: '/request',
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(body)); }
                catch (e) { resolve({ action: 'error', error: 'JSON parse failed' }); }
            });
        });

        req.on('error', (e) => resolve({ action: 'error', error: e.code }));
        req.setTimeout(0);
        req.write(data);
        req.end();
    });
}

function readPort() {
    const globalPortFile = path.join(os.homedir(), LOCAL_DIR_NAME, 'port');
    if (fs.existsSync(globalPortFile)) {
        try {
            const port = parseInt(fs.readFileSync(globalPortFile, 'utf-8').trim(), 10);
            if (port > 0 && port < 65536) return port;
        } catch (e) { }
    }
    return BASE_PORT;
}

async function main() {
    const prompt = process.argv.slice(2).join(' ') || '等待用户反馈';
    const port = readPort();
    const response = await makeRequest(port, prompt);

    const { action, text, images, error } = response;

    if (error) {
        console.error(`[PanelFeedback 错误] 连接失败: ${error}`);
        process.exit(1);
    }

    if (action === 'end') {
        console.log('User chose to end');
        process.exit(0);
    }

    if (action === 'continue' && !text && (!images || images.length === 0)) {
        console.log('继续。并且遵循工作区规则，每次回复结束前必须调用脚本！');
        process.exit(0);
    }

    let output = '';

    if (text) {
        output += `User instruction: ${text}`;
    }

    if (images && images.length > 0) {
        output += `\n\n用户提供了 ${images.length} 张图片，请使用 read_file 工具读取以下图片文件：\n`;
        for (const img of images) {
            output += `- ${img}\n`;
        }
    }

    output += '\n\n重要提醒：遵循工作区规则，每次回复结束前必须调用脚本！';

    console.log(output);
    process.exit(0);
}

main().catch(err => {
    console.error(err.stack);
    process.exit(1);
});
