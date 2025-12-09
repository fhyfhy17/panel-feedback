import * as http from 'http';
import * as vscode from 'vscode';
import { FeedbackPanelProvider } from './FeedbackPanelProvider';

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
    private port = 19876;
    private pendingRequests: Map<string, PendingRequest> = new Map();
    private context: vscode.ExtensionContext | null = null;

    constructor(private provider: FeedbackPanelProvider) {}

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
            if (parsed.text) {
                content.push({ type: 'text', text: parsed.text });
            }
            if (parsed.images && Array.isArray(parsed.images)) {
                for (const imageDataUrl of parsed.images) {
                    const match = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
                    if (match) {
                        content.push({
                            type: 'image',
                            data: match[2],
                            mimeType: match[1]
                        });
                    }
                }
            }
        } catch {
            content.push({ type: 'text', text: feedback });
        }
        
        if (content.length === 0) {
            content.push({ type: 'text', text: '' });
        }
        
        return content;
    }

    start() {
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

        this.server.listen(this.port, () => {
            console.log(`MCP Feedback Server running on port ${this.port}`);
        });
    }

    // 处理提交请求（快速返回）
    private async handleSubmit(data: any): Promise<any> {
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
        if (this.server) {
            this.server.close();
            this.server = null;
        }
    }
}
