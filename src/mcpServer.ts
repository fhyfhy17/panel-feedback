import * as http from 'http';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { FeedbackPanelProvider } from './FeedbackPanelProvider';

// 端口注册表接口
interface PortRegistryEntry {
    port: number;
    workspace: string;
    lastActive: number;
    pid: number;
    vscodePid?: string;  // VSCODE_PID 环境变量，用于精确路由
}

interface PortRegistry {
    windows: PortRegistryEntry[];
}

interface MCPRequest {
    jsonrpc: string;
    id: number | string;
    method: string;
    params?: any;
}

interface MCPResponse {
    jsonrpc: string;
    id: number | string;
    result?: any;
    error?: {
        code: number;
        message: string;
    };
}

interface PendingRequest {
    id: string;
    params: any;
    status: 'pending' | 'completed' | 'error';
    result?: any;
    error?: string;
    createdAt: number;
}

export class MCPServer {
    private server: http.Server | null = null;
    private port: number = 0;
    private pendingRequests: Map<string, PendingRequest> = new Map();
    private context: vscode.ExtensionContext | null = null;
    private workspace: string = '';
    private vscodePid: string = '';

    // 端口范围
    private static readonly PORT_MIN = 19876;
    private static readonly PORT_MAX = 19899;
    private static readonly REGISTRY_DIR = path.join(os.homedir(), '.panel-feedback');
    private static readonly REGISTRY_FILE = path.join(MCPServer.REGISTRY_DIR, 'ports.json');

    constructor(private provider: FeedbackPanelProvider) {
        // 获取当前工作区路径
        this.workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
        // 获取 VSCODE_PID 用于精确路由
        this.vscodePid = process.env.VSCODE_PID || '';
    }

    private getPidRegistryFile(): string {
        return path.join(MCPServer.REGISTRY_DIR, `port-${process.pid}.json`);
    }

    private writePidRegistry(): void {
        try {
            if (!fs.existsSync(MCPServer.REGISTRY_DIR)) {
                fs.mkdirSync(MCPServer.REGISTRY_DIR, { recursive: true });
            }
            fs.writeFileSync(
                this.getPidRegistryFile(),
                JSON.stringify({ port: this.port, workspace: this.workspace, pid: process.pid, vscodePid: this.vscodePid }, null, 2)
            );
        } catch (e) {
            console.error('Failed to write pid registry:', e);
        }
    }

    private deletePidRegistry(): void {
        try {
            const f = this.getPidRegistryFile();
            if (fs.existsSync(f)) {
                fs.unlinkSync(f);
            }
        } catch (e) {
            console.error('Failed to delete pid registry:', e);
        }
    }

    // 设置扩展上下文（用于持久化）
    setContext(context: vscode.ExtensionContext) {
        this.context = context;
        this.restorePendingRequests();
    }

    // 从持久化存储恢复未完成请求
    private restorePendingRequests() {
        if (!this.context) return;

        const stored = this.context.globalState.get<PendingRequest[]>('pendingRequests', []);
        const now = Date.now();
        const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

        for (const req of stored) {
            // 只恢复 7 天内的 pending 请求
            if (req.status === 'pending' && (now - req.createdAt) < SEVEN_DAYS) {
                this.pendingRequests.set(req.id, req);
                // 重新显示到面板
                this.processRequest(req);
            }
        }

        console.log(`Restored ${this.pendingRequests.size} pending requests`);
    }

    // 持久化请求状态
    private persistRequests() {
        if (!this.context) return;

        const requests = Array.from(this.pendingRequests.values());
        this.context.globalState.update('pendingRequests', requests);
    }

    // 处理请求（显示到面板）
    private async processRequest(request: PendingRequest) {
        try {
            const { message, predefined_options } = request.params.arguments || {};

            const feedback = await this.provider.showMessage(
                message || '',
                predefined_options,
                request.id
            );

            // 解析反馈内容
            const content = this.parseResponse(feedback);

            // 更新请求状态
            request.status = 'completed';
            request.result = { content };
            this.persistRequests();
        } catch (err: any) {
            request.status = 'error';
            request.error = err.message;
            this.persistRequests();
        }
    }

    private parseResponse(feedback: string): any[] {
        const content: any[] = [];

        try {
            const parsed = JSON.parse(feedback);
            const textContent = parsed.text || '';

            if (parsed.images && Array.isArray(parsed.images)) {
                for (const imageDataUrl of parsed.images) {
                    const match = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
                    if (match) {
                        // 统一返回 MCP 标准的 image 类型
                        content.push({
                            type: 'image',
                            data: match[2],
                            mimeType: match[1]
                        });
                    }
                }
            }

            if (textContent) {
                content.push({ type: 'text', text: textContent });
            }
        } catch {
            content.push({ type: 'text', text: feedback });
        }

        if (content.length === 0) {
            content.push({ type: 'text', text: '' });
        }

        return content;
    }

    // 读取端口注册表
    private readRegistry(): PortRegistry {
        try {
            if (fs.existsSync(MCPServer.REGISTRY_FILE)) {
                const content = fs.readFileSync(MCPServer.REGISTRY_FILE, 'utf-8');
                return JSON.parse(content);
            }
        } catch (e) {
            console.error('Failed to read registry:', e);
        }
        return { windows: [] };
    }

    // 写入端口注册表
    private writeRegistry(registry: PortRegistry): void {
        try {
            if (!fs.existsSync(MCPServer.REGISTRY_DIR)) {
                fs.mkdirSync(MCPServer.REGISTRY_DIR, { recursive: true });
            }
            fs.writeFileSync(MCPServer.REGISTRY_FILE, JSON.stringify(registry, null, 2));
        } catch (e) {
            console.error('Failed to write registry:', e);
        }
    }

    // 注册当前窗口
    private registerWindow(): void {
        const registry = this.readRegistry();

        // 清理无效的注册（进程不存在）
        registry.windows = registry.windows.filter(entry => {
            try {
                process.kill(entry.pid, 0);  // 检查进程是否存在
                return true;
            } catch {
                return false;
            }
        });

        // 移除同一进程的旧注册（同一个 Extension Host 重启/重复注册）
        registry.windows = registry.windows.filter(entry => entry.pid !== process.pid);

        // 添加新注册
        registry.windows.push({
            port: this.port,
            workspace: this.workspace,
            lastActive: Date.now(),
            pid: process.pid,
            vscodePid: this.vscodePid
        });

        this.writeRegistry(registry);
        this.writePidRegistry();
    }

    // 收到 MCP 请求时更新活动时间（不用持续心跳，避免切换窗口影响路由）
    private updateLastActive(): void {
        const registry = this.readRegistry();
        const entry = registry.windows.find(e => e.port === this.port && e.pid === process.pid);
        if (entry) {
            entry.lastActive = Date.now();
            this.writeRegistry(registry);
        }
    }

    // 注销当前窗口
    private unregisterWindow(): void {
        const registry = this.readRegistry();
        registry.windows = registry.windows.filter(
            entry => !(entry.port === this.port && entry.pid === process.pid)
        );
        this.writeRegistry(registry);
        this.deletePidRegistry();
    }

    async start() {
        this.server = http.createServer(async (req, res) => {
            // CORS headers
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

            if (req.method === 'OPTIONS') {
                res.writeHead(200);
                res.end();
                return;
            }

            if (req.method !== 'POST') {
                res.writeHead(405);
                res.end('Method Not Allowed');
                return;
            }

            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body);
                    let response;

                    // 根据路径分发请求
                    if (req.url === '/submit') {
                        response = await this.handleSubmit(data);
                    } else if (req.url === '/poll') {
                        response = this.handlePoll(data);
                    } else {
                        // 兼容旧版请求
                        response = await this.handleRequest(data);
                    }

                    res.setHeader('Content-Type', 'application/json');
                    res.writeHead(200);
                    res.end(JSON.stringify(response));
                } catch (err) {
                    res.writeHead(400);
                    res.end(JSON.stringify({
                        jsonrpc: '2.0',
                        id: null,
                        error: { code: -32700, message: 'Parse error' }
                    }));
                }
            });
        });

        // 尝试监听端口，失败则重试下一个
        await this.tryListen();
    }

    // 尝试监听端口，失败时自动重试下一个端口
    private tryListen(): Promise<void> {
        return new Promise((resolve) => {
            this.server?.removeAllListeners('error');
            this.server?.removeAllListeners('listening');

            this.server?.once('error', (err: NodeJS.ErrnoException) => {
                console.error(`Failed to start server: ${err.message}`);
                resolve();
            });

            this.server?.once('listening', () => {
                const addr = this.server?.address();
                if (addr && typeof addr === 'object') {
                    this.port = addr.port;
                }
                console.log(`MCP Feedback Server running on port ${this.port}`);
                this.registerWindow();
                resolve();
            });

            this.server?.listen(0, '127.0.0.1');
        });
    }

    // 处理提交请求（快速返回）
    private async handleSubmit(data: any): Promise<any> {
        // 收到 MCP 请求时更新活动时间
        this.updateLastActive();

        const { requestId, params } = data;

        const request: PendingRequest = {
            id: requestId,
            params,
            status: 'pending',
            createdAt: Date.now()
        };

        this.pendingRequests.set(requestId, request);
        this.persistRequests();

        // 异步处理请求（不阻塞返回）
        this.processRequest(request);

        return { status: 'accepted', requestId };
    }

    // 处理轮询请求
    private handlePoll(data: any): any {
        const { requestId } = data;
        const request = this.pendingRequests.get(requestId);

        if (!request) {
            return { status: 'error', error: 'Request not found' };
        }

        if (request.status === 'completed') {
            // 清理已完成的请求
            this.pendingRequests.delete(requestId);
            this.persistRequests();
            return { status: 'completed', data: request.result };
        } else if (request.status === 'error') {
            this.pendingRequests.delete(requestId);
            this.persistRequests();
            return { status: 'error', error: request.error };
        }

        return { status: 'pending' };
    }

    private async handleRequest(request: MCPRequest): Promise<MCPResponse> {
        const { id, method, params } = request;

        switch (method) {
            case 'tools/list':
                return {
                    jsonrpc: '2.0',
                    id,
                    result: {
                        tools: [{
                            name: 'panel_feedback',
                            description: '在 IDE 侧边栏显示消息并获取用户反馈，支持预定义选项和图片',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    message: {
                                        type: 'string',
                                        description: '要显示给用户的消息，支持 Markdown'
                                    },
                                    predefined_options: {
                                        type: 'array',
                                        items: { type: 'string' },
                                        description: '预定义的选项按钮'
                                    }
                                },
                                required: ['message']
                            }
                        }]
                    }
                };

            case 'tools/call':
                if (params?.name === 'panel_feedback') {
                    const { message, predefined_options } = params.arguments || {};

                    try {
                        const feedback = await this.provider.showMessage(
                            message || '',
                            predefined_options
                        );

                        // 解析反馈内容，分离文本和图片
                        const content: any[] = [];

                        try {
                            // 尝试解析为 JSON（包含图片的情况）
                            const parsed = JSON.parse(feedback);

                            // 添加文本内容
                            if (parsed.text) {
                                content.push({
                                    type: 'text',
                                    text: parsed.text
                                });
                            }

                            // 添加图片内容（使用 MCP 标准的 image content type）
                            if (parsed.images && Array.isArray(parsed.images)) {
                                for (const imageDataUrl of parsed.images) {
                                    // 解析 data URL: data:image/png;base64,xxxxx
                                    const match = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
                                    if (match) {
                                        content.push({
                                            type: 'image',
                                            data: match[2],  // base64 数据（不含前缀）
                                            mimeType: match[1]  // 如 image/png
                                        });
                                    }
                                }
                            }
                        } catch {
                            // 不是 JSON，当作纯文本处理
                            content.push({
                                type: 'text',
                                text: feedback
                            });
                        }

                        // 确保至少有一个 content
                        if (content.length === 0) {
                            content.push({
                                type: 'text',
                                text: ''
                            });
                        }

                        return {
                            jsonrpc: '2.0',
                            id,
                            result: { content }
                        };
                    } catch (err: any) {
                        return {
                            jsonrpc: '2.0',
                            id,
                            error: { code: -32000, message: err.message }
                        };
                    }
                }
                return {
                    jsonrpc: '2.0',
                    id,
                    error: { code: -32601, message: 'Tool not found' }
                };

            case 'initialize':
                return {
                    jsonrpc: '2.0',
                    id,
                    result: {
                        protocolVersion: '2024-11-05',
                        serverInfo: {
                            name: 'windsurf-feedback-panel',
                            version: '1.0.0'
                        },
                        capabilities: {
                            tools: {}
                        }
                    }
                };

            default:
                return {
                    jsonrpc: '2.0',
                    id,
                    error: { code: -32601, message: 'Method not found' }
                };
        }
    }

    stop() {
        // 注销窗口
        this.unregisterWindow();

        if (this.server) {
            this.server.close();
            this.server = null;
        }
    }
}
