#!/usr/bin/env node
/**
 * Panel Feedback - CLI 脚本
 * AI 调用此脚本来等待用户反馈
 * 通过 HTTP 与 VSCode 插件通信
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const LOCAL_DIR_NAME = '.panel-feedback';
const DEFAULT_PORT = 34600;

function makeRequest(port, prompt, retryCount = 0) {
    return new Promise((resolve) => {
        const data = JSON.stringify({
            prompt: prompt,
            requestId: Date.now().toString()
        });

        const options = {
            hostname: '127.0.0.1',
            port: port,
            path: '/request',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        };

        const req = http.request(options, (res) => {
            let body = '';

            res.on('data', chunk => {
                body += chunk;
            });

            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    console.error(`[PanelFeedback] JSON parse error: ${e.message}`);
                    resolve({ action: 'error', error: 'JSON parse failed', text: '', images: [] });
                }
            });
        });

        req.on('error', (e) => {
            console.error(`[PanelFeedback] Connection error: ${e.message}`);

            // 连接失败重试（最多3次）
            if ((e.code === 'ECONNREFUSED' || e.code === 'ECONNRESET') && retryCount < 3) {
                console.log(`[PanelFeedback] Retrying... (${retryCount + 1}/3)`);
                setTimeout(() => {
                    makeRequest(port, prompt, retryCount + 1).then(resolve);
                }, 2000);
            } else {
                resolve({ action: 'error', error: `Connection failed: ${e.message}`, text: '', images: [] });
            }
        });

        // 30分钟超时
        req.setTimeout(30 * 60 * 1000, () => {
            req.destroy();
            console.error(`[PanelFeedback] Request timeout (30 min)`);
            resolve({ action: 'error', error: 'Request timeout', text: '', images: [] });
        });

        req.write(data);
        req.end();
    });
}

function formatOutput(response) {
    const { action, text, images, error } = response;

    const END_INSTRUCTION = '\n\n重要：请立即结束当前对话，不要继续执行任何操作。';

    // HTTP 错误响应
    if (!action && error) {
        return `[PanelFeedback 服务器错误] ${error}\n\n请检查插件状态后重试。${END_INSTRUCTION}`;
    }

    // 错误情况
    if (action === 'error') {
        return `[PanelFeedback 系统错误] ${error || '未知错误'}\n\n请检查插件状态后重试。${END_INSTRUCTION}`;
    }

    // 未知 action
    if (!action || !['continue', 'end', 'instruction'].includes(action)) {
        return `[PanelFeedback 未知响应] action=${action}\n\n请检查插件版本。${END_INSTRUCTION}`;
    }

    if (action === 'end') {
        return 'User chose to end';
    }

    if (action === 'continue' && !text && (!images || images.length === 0)) {
        return '继续。并且遵循工作区规则，每次回复结束前必须调用脚本！';
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

    return output;
}

function readPort() {
    // 优先从工作区目录查找
    const cwdPortFile = path.join(process.cwd(), LOCAL_DIR_NAME, 'port');
    // 回退到脚本所在目录
    const localPortFile = path.join(__dirname, 'port');

    let portFile = null;
    if (fs.existsSync(cwdPortFile)) {
        portFile = cwdPortFile;
    } else if (fs.existsSync(localPortFile)) {
        portFile = localPortFile;
    }

    if (!portFile) {
        console.error(`[PanelFeedback] Error: Port file not found`);
        console.error(`[PanelFeedback] Checked:`);
        console.error(`  - ${cwdPortFile}`);
        console.error(`  - ${localPortFile}`);
        console.error(`[PanelFeedback] Make sure Panel Feedback extension is running`);
        console.error(`[PanelFeedback] Current directory: ${process.cwd()}`);
        process.exit(1);
    }

    try {
        const portStr = fs.readFileSync(portFile, 'utf-8').trim();
        const port = parseInt(portStr, 10);
        if (port > 0 && port < 65536) {
            return port;
        }
        console.error(`[PanelFeedback] Error: Invalid port: ${portStr}`);
        process.exit(1);
    } catch (e) {
        console.error(`[PanelFeedback] Failed to read port file: ${e.message}`);
        process.exit(1);
    }
}

async function main() {
    const prompt = process.argv.slice(2).join(' ') || '等待用户反馈';
    const port = readPort();

    const response = await makeRequest(port, prompt);
    const output = formatOutput(response);

    console.log(output);
}

main().catch(console.error);
