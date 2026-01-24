/**
 * 纯 HTTP 服务器 - 用于 CLI 脚本通信
 * 替代 MCP，走 windsurf-chat-open 模式
 */
import * as http from 'http';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { FeedbackPanelProvider } from './FeedbackPanelProvider';

// 配置常量
const BASE_PORT = 34600;  // 基础端口
const MAX_PORT_ATTEMPTS = 100;
const LOCAL_DIR_NAME = 'feedback-assets';
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;  // 30分钟
const MAX_REQUEST_BODY_SIZE = 10 * 1024 * 1024;  // 10MB

interface RequestData {
    prompt: string;
    requestId: string;
    timeoutMinutes?: number;
}

interface PendingRequest {
    res: http.ServerResponse;
    timer: NodeJS.Timeout | undefined;
    createdAt: number;
}

export class HttpServer {
    private server: http.Server | null = null;
    private port: number = 0;
    private pendingRequests: Map<string, PendingRequest> = new Map();
    private activeRequestId: string | null = null;
    private triedPorts: Set<number> = new Set();
    private connectionCheckInterval?: NodeJS.Timeout;

    constructor(
        private readonly provider: FeedbackPanelProvider,
        private readonly onRequest: (data: RequestData) => Promise<void>
    ) { }

    public getPort(): number {
        return this.port;
    }

    public async start(): Promise<number> {
        this.cleanupAllPortFiles();
        this.server = http.createServer((req, res) => this.handleIncomingRequest(req, res));

        // 设置服务器超时时间为0（不限制）
        this.server.timeout = 0;
        this.server.keepAliveTimeout = 0;
        this.server.headersTimeout = 0;

        // 设置 TCP Keep-Alive
        this.server.on('connection', (socket) => {
            socket.setKeepAlive(true, 30000);
            socket.setTimeout(0);
        });

        // 启动连接状态检测
        this.startConnectionCheck();

        return new Promise((resolve, reject) => {
            this.tryListen(BASE_PORT, 0, resolve, reject);
        });
    }

    private startConnectionCheck() {
        this.connectionCheckInterval = setInterval(() => {
            for (const [requestId, pending] of this.pendingRequests.entries()) {
                if (pending.res.writableEnded || pending.res.destroyed) {
                    console.log(`[PanelFeedback] Connection closed for request ${requestId}, cleaning up`);
                    this.clearPendingRequest(requestId, false);
                }
            }
        }, 30000);
    }

    private cleanupAllPortFiles() {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders) return;

        for (const folder of folders) {
            const portFile = path.join(folder.uri.fsPath, LOCAL_DIR_NAME, 'port');
            if (fs.existsSync(portFile)) {
                try {
                    fs.unlinkSync(portFile);
                } catch (e) {
                    console.error(`[PanelFeedback] Failed to delete port file: ${e}`);
                }
            }
        }
    }

    private tryListen(port: number, attempt: number, resolve: (port: number) => void, reject: (err: any) => void) {
        if (attempt >= MAX_PORT_ATTEMPTS) {
            reject(new Error('Could not find an available port'));
            return;
        }

        if (this.triedPorts.has(port)) {
            this.tryListen(port + 1, attempt + 1, resolve, reject);
            return;
        }

        this.triedPorts.add(port);

        const onListenError = (err: any) => {
            if (err.code === 'EADDRINUSE') {
                this.tryListen(port + 1, attempt + 1, resolve, reject);
            } else {
                reject(err);
            }
        };

        this.server!.once('error', onListenError);

        this.server!.listen(port, '127.0.0.1', () => {
            this.server!.removeListener('error', onListenError);
            this.port = port;
            this.writePortFiles(port);
            resolve(port);
        });
    }

    public writePortFiles(port: number) {
        const folders = vscode.workspace.workspaceFolders;

        // 1. 写入全局家目录 (优先保证这个存在)
        const homeDir = require('os').homedir();
        const globalDir = path.join(homeDir, LOCAL_DIR_NAME);
        const globalPortFile = path.join(globalDir, 'port');
        try {
            if (!fs.existsSync(globalDir)) {
                fs.mkdirSync(globalDir, { recursive: true });
            }
            fs.writeFileSync(globalPortFile, port.toString(), 'utf-8');
            console.log(`[PanelFeedback] Global port file written: ${globalPortFile}`);
        } catch (e) {
            console.error(`[PanelFeedback] Failed to write global port file: ${e}`);
        }

        // 2. 写入各工作区目录
        if (!folders) return;

        for (const folder of folders) {
            const workspacePath = folder.uri.fsPath;
            const localDir = path.join(workspacePath, LOCAL_DIR_NAME);
            const portFile = path.join(localDir, 'port');

            try {
                if (!fs.existsSync(localDir)) {
                    fs.mkdirSync(localDir, { recursive: true });
                }
                fs.writeFileSync(portFile, port.toString(), 'utf-8');
            } catch (e) {
                console.error(`[PanelFeedback] Failed to write port file: ${e}`);
            }
        }
    }

    private handleIncomingRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        // CORS 和 Keep-Alive
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Keep-Alive', 'timeout=0');

        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        if (req.method === 'POST' && req.url === '/request') {
            this.handleFeedbackRequest(req, res);
        } else if (req.method === 'GET' && req.url === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'ok',
                port: this.port,
                pendingRequests: this.pendingRequests.size
            }));
        } else if (req.method === 'GET' && req.url === '/status') {
            const requests = Array.from(this.pendingRequests.entries()).map(([id, pending]) => ({
                requestId: id,
                createdAt: pending.createdAt,
                age: Date.now() - pending.createdAt
            }));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ port: this.port, pendingRequests: requests }));
        } else {
            res.writeHead(404);
            res.end('Not Found');
        }
    }

    private handleFeedbackRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        let body = '';
        let bodySize = 0;

        req.on('data', chunk => {
            bodySize += chunk.length;
            if (bodySize > MAX_REQUEST_BODY_SIZE) {
                req.destroy();
                res.writeHead(413);
                res.end(JSON.stringify({ error: 'Request too large' }));
                return;
            }
            body += chunk;
        });

        req.on('end', async () => {
            try {
                const data = JSON.parse(body) as RequestData;

                if (!data.prompt || typeof data.prompt !== 'string') {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid prompt' }));
                    return;
                }

                const requestId = data.requestId || Date.now().toString();

                // 清理同 ID 的旧请求
                this.clearPendingRequest(requestId, true, {
                    action: 'error',
                    error: 'Request superseded',
                    text: '',
                    images: []
                });

                this.activeRequestId = requestId;

                // 超时处理
                const timeoutMinutes = data.timeoutMinutes ?? 30;
                const timeoutMs = timeoutMinutes === 0 ? 0 : timeoutMinutes * 60 * 1000;

                let timer: NodeJS.Timeout | undefined;
                if (timeoutMs > 0) {
                    timer = setTimeout(() => {
                        const pending = this.pendingRequests.get(requestId);
                        if (pending && !pending.res.writableEnded) {
                            pending.res.writeHead(200, { 'Content-Type': 'application/json' });
                            pending.res.end(JSON.stringify({
                                action: 'error',
                                error: 'Timeout waiting for user response',
                                text: '',
                                images: []
                            }));
                            this.pendingRequests.delete(requestId);
                        }
                    }, timeoutMs);
                }

                // 【关键修复】先注册请求，再调用回调！否则用户提交时请求还没注册
                this.pendingRequests.set(requestId, { res, timer, createdAt: Date.now() });
                console.log(`[PanelFeedback] Request registered: ${requestId}`);

                // 现在才调用回调，显示消息给用户
                await this.onRequest({ ...data, requestId });

            } catch (e) {
                if (!res.writableEnded) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid JSON' }));
                }
            }
        });

        req.on('error', (err) => {
            console.error('[PanelFeedback] Request error:', err);
            if (!res.writableEnded) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: 'Request error' }));
            }
        });
    }

    private clearPendingRequest(requestId: string, sendResponse: boolean = false, responseData?: any) {
        const pending = this.pendingRequests.get(requestId);
        if (pending) {
            if (pending.timer) {
                clearTimeout(pending.timer);
            }
            if (sendResponse && !pending.res.writableEnded) {
                try {
                    pending.res.writeHead(200, { 'Content-Type': 'application/json' });
                    pending.res.end(JSON.stringify(responseData || {
                        action: 'error',
                        error: 'Request cancelled',
                        text: '',
                        images: []
                    }));
                } catch (e) {
                    console.error('[PanelFeedback] Failed to send response:', e);
                }
            }
            this.pendingRequests.delete(requestId);
        }
    }

    public sendResponse(response: any, requestId?: string) {
        console.log(`[PanelFeedback] sendResponse called with requestId: ${requestId}, activeRequestId: ${this.activeRequestId}`);
        console.log(`[PanelFeedback] pendingRequests keys: ${Array.from(this.pendingRequests.keys()).join(', ')}`);

        const id = requestId || this.activeRequestId;
        if (!id || !this.pendingRequests.has(id)) {
            console.warn(`[PanelFeedback] No pending request for ID: ${id}`);
            return;
        }

        const pending = this.pendingRequests.get(id)!;
        console.log(`[PanelFeedback] Found pending request, writableEnded: ${pending.res.writableEnded}, destroyed: ${pending.res.destroyed}`);

        if (pending.res.writableEnded || pending.res.destroyed) {
            console.warn(`[PanelFeedback] Response object closed for request ${id}`);
            this.clearPendingRequest(id);
            if (this.activeRequestId === id) {
                this.activeRequestId = null;
            }
            return;
        }

        try {
            pending.res.writeHead(200, {
                'Content-Type': 'application/json',
                'Connection': 'keep-alive'
            });
            pending.res.end(JSON.stringify(response));
            console.log(`[PanelFeedback] Response sent for request ${id}`);
        } catch (e) {
            console.error(`[PanelFeedback] Failed to send response:`, e);
        }

        this.clearPendingRequest(id);
        if (this.activeRequestId === id) {
            this.activeRequestId = null;
        }
    }

    public dispose() {
        if (this.connectionCheckInterval) {
            clearInterval(this.connectionCheckInterval);
        }
        this.cleanupAllPortFiles();
        for (const requestId of Array.from(this.pendingRequests.keys())) {
            this.clearPendingRequest(requestId, true, {
                action: 'error',
                error: 'Extension deactivated',
                text: '',
                images: []
            });
        }
        if (this.server) {
            this.server.close();
            this.server = null;
        }
    }
}
