#!/usr/bin/env node
/**
 * Stdio wrapper for windsurf-feedback-panel MCP
 * 使用轮询机制等待用户反馈，支持长时间等待（几天）
 */

const http = require('http');
const readline = require('readline');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// 端口注册表配置
const REGISTRY_DIR = path.join(os.homedir(), '.panel-feedback');
const REGISTRY_FILE = path.join(REGISTRY_DIR, 'ports.json');
const DEFAULT_PORT = 19876;
const POLL_INTERVAL = 500;  // 500ms 轮询间隔
const MAX_POLL_TIME = 86400000 * 7;  // 最长等待 7 天

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

// 读取端口注册表
function readRegistry() {
    try {
        if (fs.existsSync(REGISTRY_FILE)) {
            const content = fs.readFileSync(REGISTRY_FILE, 'utf-8');
            return JSON.parse(content);
        }
    } catch (e) {
        process.stderr.write(`Failed to read registry: ${e.message}\n`);
    }
    return { windows: [] };
}

function readPidRegistry(extensionHostPid) {
    try {
        if (!extensionHostPid) return null;
        const f = path.join(REGISTRY_DIR, `port-${extensionHostPid}.json`);
        if (!fs.existsSync(f)) return null;
        const content = fs.readFileSync(f, 'utf-8');
        return JSON.parse(content);
    } catch (e) {
        process.stderr.write(`Failed to read pid registry: ${e.message}\n`);
        return null;
    }
}

function getParentPid(pid) {
    try {
        if (os.platform() === 'win32') {
            // Windows: 优先使用 PowerShell (WMIC 在 Win10+ 已废弃)
            try {
                const result = execSync(
                    `powershell -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').ParentProcessId"`,
                    { encoding: 'utf-8', windowsHide: true }
                );
                const ppid = result.trim();
                if (ppid && /^\d+$/.test(ppid)) {
                    return ppid;
                }
            } catch {
                // PowerShell 失败，尝试 WMIC (兼容旧版 Windows)
                try {
                    const result = execSync(
                        `wmic process where ProcessId=${pid} get ParentProcessId /format:value`,
                        { encoding: 'utf-8', windowsHide: true }
                    );
                    const match = result.match(/ParentProcessId=(\d+)/);
                    if (match) return match[1];
                } catch {
                    // WMIC 也失败
                }
            }
            return null;
        } else {
            // Unix: 使用 ps 命令
            const result = execSync(`ps -o ppid= -p ${pid}`, { encoding: 'utf-8' });
            return result.trim();
        }
    } catch {
        return null;
    }
}

function findPidRegistryOwnerPid() {
    let cur = process.ppid;
    for (let i = 0; i < 8 && cur; i++) {
        const f = path.join(REGISTRY_DIR, `port-${cur}.json`);
        if (fs.existsSync(f)) {
            return String(cur);
        }
        const next = getParentPid(cur);
        if (!next) return null;
        cur = next;
    }
    return null;
}

// 根据 Extension Host PID、VSCODE_PID、工作区或最近活动时间选择目标端口
function selectTargetPort(workspace) {
    const ownerPid = findPidRegistryOwnerPid();
    if (ownerPid) {
        const pidReg = readPidRegistry(ownerPid);
        if (pidReg && pidReg.port) {
            process.stderr.write(`Matched by pid registry: ${ownerPid} -> port ${pidReg.port}\n`);
            return pidReg.port;
        }
    }

    const registry = readRegistry();
    
    if (registry.windows.length === 0) {
        return DEFAULT_PORT;  // 回退到默认端口
    }
    
    // 策略 2：使用 VSCODE_PID 匹配（支持多窗口）
    const vscodePid = process.env.VSCODE_PID;
    if (vscodePid) {
        const entry = registry.windows.find(e => e.vscodePid === vscodePid);
        if (entry) {
            process.stderr.write(`Matched by VSCODE_PID: ${vscodePid} -> port ${entry.port}\n`);
            return entry.port;
        }
    }
    
    // 策略 3：如果指定了工作区，精确匹配
    if (workspace) {
        const entry = registry.windows.find(e => e.workspace === workspace);
        if (entry) {
            process.stderr.write(`Matched by workspace: ${workspace} -> port ${entry.port}\n`);
            return entry.port;
        }
    }
    
    // 策略 4：否则选择最近活动的窗口
    const sorted = [...registry.windows].sort((a, b) => b.lastActive - a.lastActive);
    process.stderr.write(`Fallback to most recent: port ${sorted[0].port}\n`);
    return sorted[0].port;
}

// 生成唯一请求 ID
function generateRequestId() {
    return crypto.randomUUID();
}

// 休眠函数
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 发送 HTTP 请求
function sendRequest(urlPath, data, targetPort) {
    const port = targetPort || DEFAULT_PORT;
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify(data);
        const options = {
            hostname: '127.0.0.1',
            port: port,
            path: urlPath,
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
async function pollForResult(requestId, targetPort) {
    const startTime = Date.now();
    let connectionRefusedCount = 0;
    
    while (Date.now() - startTime < MAX_POLL_TIME) {
        try {
            const result = await sendRequest('/poll', { requestId }, targetPort);
            
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

// 写调试日志到文件
function writeDebugLog(content) {
    try {
        const logDir = path.join(os.homedir(), '.panel-feedback');
        const logFile = path.join(logDir, 'debug.log');
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        const timestamp = new Date().toISOString();
        fs.appendFileSync(logFile, `[${timestamp}] ${content}\n`);
    } catch (e) {
        // ignore
    }
}

// 处理 tools/call 请求（使用轮询）
async function handleToolCall(mcpId, params) {
    const requestId = generateRequestId();
    
    // 调试日志：写入文件
    writeDebugLog('=== MCP Call Debug ===');
    writeDebugLog(`Params: ${JSON.stringify(params, null, 2)}`);
    writeDebugLog(`PID: ${process.pid}, PPID: ${process.ppid}`);
    writeDebugLog(`Pid registry owner PID: ${findPidRegistryOwnerPid() || 'unknown'}`);
    writeDebugLog(`CWD: ${process.cwd()}`);
    writeDebugLog(`PWD: ${process.env.PWD || 'not set'}`);
    writeDebugLog(`HOME: ${process.env.HOME || 'not set'}`);
    // 检查是否有 workspace 相关的环境变量
    const workspaceEnvs = Object.entries(process.env).filter(([k]) => 
        k.toLowerCase().includes('workspace') || 
        k.toLowerCase().includes('folder') ||
        k.toLowerCase().includes('project') ||
        k.toLowerCase().includes('vscode') ||
        k.toLowerCase().includes('windsurf')
    );
    writeDebugLog(`Workspace-related envs: ${JSON.stringify(Object.fromEntries(workspaceEnvs), null, 2)}`);
    writeDebugLog('======================');
    
    // 从参数中提取 workspace（如果有）
    const workspace = params?.arguments?.workspace || '';
    const targetPort = selectTargetPort(workspace);
    writeDebugLog(`Selected target port: ${targetPort}`);
    
    process.stderr.write(`Routing to port ${targetPort}${workspace ? ` (workspace: ${workspace})` : ' (most recent)'}\n`);
    
    // 1. 提交请求（快速返回）
    const submitResult = await sendRequest('/submit', {
        requestId,
        params
    }, targetPort);
    
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
        const result = await pollForResult(requestId, targetPort);
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
async function handleOtherRequest(request, workspace) {
    const targetPort = selectTargetPort(workspace);
    const result = await sendRequest('/', request, targetPort);
    
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
                                },
                                workspace: {
                                    type: 'string',
                                    description: '目标工作区路径（可选，用于多窗口时精确路由）'
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
