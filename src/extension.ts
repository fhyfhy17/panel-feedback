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
}

export function deactivate() {
    if (mcpServer) {
        mcpServer.stop();
    }
}
