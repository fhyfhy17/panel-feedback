#!/usr/bin/env node
/**
 * Stdio wrapper for windsurf-feedback-panel MCP
 * 使用轮询机制等待用户反馈，支持长时间等待（几天）
 */

const http = require('http');
const readline = require('readline');
const crypto = require('crypto');

const SERVER_PORT = 19876;
const POLL_INTERVAL = 500;  // 500ms 轮询间隔
const MAX_POLL_TIME = 86400000 * 7;  // 最长等待 7 天

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

// 生成唯一请求 ID
function generateRequestId() {
    return crypto.randomUUID();
}

// 休眠函数
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 发送 HTTP 请求
function sendRequest(path, data) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify(data);
        const options = {
            hostname: '127.0.0.1',
            port: SERVER_PORT,
            path: path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            },
            timeout: 5000  // 短超时，快速失败
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
            if (e.code === 'ECONNREFUSED') {
                // 服务器未启动，返回特殊标记
                resolve({ _connectionRefused: true });
            } else {
                reject(e);
            }
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        req.write(postData);
        req.end();
    });
}

// 轮询获取结果
async function pollForResult(requestId) {
    const startTime = Date.now();
    let connectionRefusedCount = 0;
    
    while (Date.now() - startTime < MAX_POLL_TIME) {
        try {
            const result = await sendRequest('/poll', { requestId });
            
            // 检查连接被拒绝
            if (result._connectionRefused) {
                connectionRefusedCount++;
                // 连续多次连接失败才报错
                if (connectionRefusedCount > 10) {
                    throw new Error('扩展未启动。请先在 Windsurf 中打开 AI Feedback 面板。');
                }
            } else {
                connectionRefusedCount = 0;  // 重置计数
                
                if (result.status === 'completed') {
                    return result.data;
                } else if (result.status === 'error') {
                    throw new Error(result.error || 'Unknown error');
                }
                // status === 'pending'，继续轮询
            }
        } catch (err) {
            // 非连接拒绝的错误，记录但继续轮询
            if (!err.message.includes('扩展未启动')) {
                process.stderr.write(`Poll error: ${err.message}\n`);
            } else {
                throw err;  // 连接拒绝太多次，抛出错误
            }
        }
        
        await sleep(POLL_INTERVAL);
    }
    
    throw new Error('Poll timeout after 7 days');
}

// 处理 tools/call 请求（使用轮询）
async function handleToolCall(mcpId, params) {
    const requestId = generateRequestId();
    
    // 1. 提交请求（快速返回）
    const submitResult = await sendRequest('/submit', {
        requestId,
        params
    });
    
    if (submitResult._connectionRefused) {
        return {
            jsonrpc: '2.0',
            id: mcpId,
            error: {
                code: -32000,
                message: '扩展未启动。请先在 Windsurf 中打开 AI Feedback 面板。'
            }
        };
    }
    
    if (submitResult.error) {
        return {
            jsonrpc: '2.0',
            id: mcpId,
            error: { code: -32000, message: submitResult.error }
        };
    }
    
    // 2. 轮询等待结果
    try {
        const result = await pollForResult(requestId);
        return {
            jsonrpc: '2.0',
            id: mcpId,
            result
        };
    } catch (err) {
        return {
            jsonrpc: '2.0',
            id: mcpId,
            error: { code: -32000, message: err.message }
        };
    }
}

// 处理其他 MCP 请求（直接转发）
async function handleOtherRequest(request) {
    const result = await sendRequest('/', request);
    
    if (result._connectionRefused) {
        return {
            jsonrpc: '2.0',
            id: request.id,
            error: {
                code: -32000,
                message: '扩展未启动。请先在 Windsurf 中打开 AI Feedback 面板。'
            }
        };
    }
    
    return result;
}

function respond(response) {
    console.log(JSON.stringify(response));
}

// 处理标准输入
rl.on('line', async (line) => {
    try {
        const request = JSON.parse(line);
        const { id, method, params } = request;
        
        let response;
        
        // 本地处理 initialize（不依赖扩展）
        if (method === 'initialize') {
            response = {
                jsonrpc: '2.0',
                id,
                result: {
                    protocolVersion: '2024-11-05',
                    serverInfo: { name: 'panel-feedback', version: '1.1.0' },
                    capabilities: { tools: {} }
                }
            };
        }
        // 本地处理 tools/list（不依赖扩展）
        else if (method === 'tools/list') {
            response = {
                jsonrpc: '2.0',
                id,
                result: {
                    tools: [{
                        name: 'panel_feedback',
                        description: '在 IDE 侧边栏显示消息并获取用户反馈，支持预定义选项和图片上传',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                message: {
                                    type: 'string',
                                    description: '要显示给用户的消息，支持 Markdown 格式'
                                },
                                predefined_options: {
                                    type: 'array',
                                    items: { type: 'string' },
                                    description: '预定义的选项按钮列表'
                                }
                            },
                            required: ['message']
                        }
                    }]
                }
            };
        }
        // 本地处理 notifications/initialized
        else if (method === 'notifications/initialized') {
            // 通知类请求不需要响应
            return;
        }
        // tools/call 请求使用轮询机制（需要扩展）
        else if (method === 'tools/call' && params?.name === 'panel_feedback') {
            response = await handleToolCall(id, params);
        }
        // 其他请求本地处理
        else {
            response = { jsonrpc: '2.0', id, result: {} };
        }
        
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
process.stderr.write('windsurf-feedback-panel MCP wrapper started (polling mode)\n');
