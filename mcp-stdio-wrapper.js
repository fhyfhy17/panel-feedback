#!/usr/bin/env node
/**
 * Stdio wrapper for windsurf-feedback-panel MCP
 * 将 stdio 协议转换为 HTTP 调用扩展内置的服务器
 */

const http = require('http');
const readline = require('readline');

const SERVER_PORT = 19876;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

function sendToServer(request) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(request);
        
        const options = {
            hostname: '127.0.0.1',
            port: SERVER_PORT,
            path: '/',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            },
            timeout: 600000 // 10 minutes timeout for user input
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    reject(new Error('Invalid JSON response'));
                }
            });
        });

        req.on('error', (e) => {
            // 如果服务器没启动，返回提示
            if (e.code === 'ECONNREFUSED') {
                resolve({
                    jsonrpc: '2.0',
                    id: request.id,
                    error: {
                        code: -32000,
                        message: '扩展未启动。请先在 Windsurf 中打开 AI Feedback 面板。'
                    }
                });
            } else {
                reject(e);
            }
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        req.write(data);
        req.end();
    });
}

function respond(response) {
    console.log(JSON.stringify(response));
}

// 处理标准输入
rl.on('line', async (line) => {
    try {
        const request = JSON.parse(line);
        
        // 直接转发到 HTTP 服务器
        const response = await sendToServer(request);
        respond(response);
        
    } catch (err) {
        respond({
            jsonrpc: '2.0',
            id: null,
            error: { code: -32700, message: 'Parse error: ' + err.message }
        });
    }
});

// 启动时输出就绪信息
process.stderr.write('windsurf-feedback-panel MCP wrapper started\n');
