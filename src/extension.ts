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
            const choice = await vscode.window.showQuickPick([
                {
                    label: '$(package) NPM Package (Recommended)',
                    description: 'Use global npm package (simpler)',
                    detail: 'Run: npm install -g panel-feedback-mcp'
                },
                {
                    label: '$(file-code) Extension Path',
                    description: 'Use local extension file',
                    detail: 'Uses the installed extension directly'
                }
            ], {
                placeHolder: 'Choose MCP configuration method'
            });

            if (!choice) return;

            let config: any;
            let instruction: string;

            if (choice.label.includes('NPM')) {
                // NPM 包方式
                config = {
                    "panel-feedback": {
                        "command": "panel-feedback-mcp"
                    }
                };
                instruction = 'First install: npm install -g panel-feedback-mcp\nThen paste this config into mcp_config.json under mcpServers.';
            } else {
                // 扩展路径方式
                const wrapperPath = vscode.Uri.joinPath(context.extensionUri, 'mcp-stdio-wrapper.js').fsPath;
                config = {
                    "panel-feedback": {
                        "command": "node",
                        "args": [wrapperPath]
                    }
                };
                instruction = 'Paste this config into mcp_config.json under mcpServers.';
            }

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
