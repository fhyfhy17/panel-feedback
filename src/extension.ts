import * as vscode from 'vscode';
import { FeedbackPanelProvider } from './FeedbackPanelProvider';
import { MCPServer } from './mcpServer';

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
            const wrapperPath = vscode.Uri.joinPath(context.extensionUri, 'mcp-stdio-wrapper.js').fsPath;
            const config = {
                "panel-feedback": {
                    "command": "node",
                    "args": [wrapperPath]
                }
            };
            const configStr = JSON.stringify(config, null, 2);
            await vscode.env.clipboard.writeText(configStr);
            vscode.window.showInformationMessage('MCP config copied! Paste into mcp_config.json under mcpServers.');
        })
    );
}

export function deactivate() {
    if (mcpServer) {
        mcpServer.stop();
    }
}
