import * as vscode from 'vscode';
import { FeedbackPanelProvider } from './FeedbackPanelProvider';
import { MCPServer } from './mcpServer';
import { execSync } from 'child_process';

/**
 * 获取 node 可执行文件的完整路径
 * 优先动态检测，失败则回退到常见路径
 */
function getNodePath(): string {
    try {
        const nodePath = execSync('which node', { encoding: 'utf-8' }).trim();
        if (nodePath) {
            return nodePath;
        }
    } catch (e) {
        // 忽略错误
    }
    // 回退到常见路径
    return '/usr/local/bin/node';
}

let mcpServer: MCPServer | undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('Windsurf Feedback Panel is now active!');

    // 创建侧边栏 Provider
    const provider = new FeedbackPanelProvider(context.extensionUri);
    
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'feedbackPanel.view',
            provider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true
                }
            }
        )
    );

    // 启动 MCP 服务器
    mcpServer = new MCPServer(provider);
    mcpServer.setContext(context);  // 传递 context 用于持久化
    mcpServer.start();

    // 注册命令
    context.subscriptions.push(
        vscode.commands.registerCommand('feedbackPanel.submit', () => {
            provider.submitFeedback();
        })
    );

    // 提供给 MCP 调用的接口
    context.subscriptions.push(
        vscode.commands.registerCommand('feedbackPanel.showMessage', 
            async (message: string, options?: string[]) => {
                return await provider.showMessage(message, options);
            }
        )
    );

    // 复制 MCP 配置命令
    context.subscriptions.push(
        vscode.commands.registerCommand('feedbackPanel.copyMcpConfig', async () => {
            // 直接使用扩展路径方式
            const wrapperPath = vscode.Uri.joinPath(context.extensionUri, 'mcp-stdio-wrapper.js').fsPath;
            const nodePath = getNodePath();
            const config = {
                "panel-feedback": {
                    "command": nodePath,
                    "args": [wrapperPath]
                }
            };
            const instruction = 'Paste this config into mcp_config.json under mcpServers.';

            const configStr = JSON.stringify(config, null, 2);
            await vscode.env.clipboard.writeText(configStr);
            
            vscode.window.showInformationMessage(
                '✅ MCP config copied to clipboard!', 
                'Show Instructions'
            ).then(action => {
                if (action === 'Show Instructions') {
                    vscode.window.showInformationMessage(instruction, { modal: true });
                }
            });
        })
    );
}

export function deactivate() {
    if (mcpServer) {
        mcpServer.stop();
    }
}
