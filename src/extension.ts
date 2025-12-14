import * as vscode from 'vscode';
import { FeedbackPanelProvider } from './FeedbackPanelProvider';
import { MCPServer } from './mcpServer';
import { execSync } from 'child_process';
import * as https from 'https';

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

const GITHUB_REPO = 'fhyfhy17/panel-feedback';
const EXTENSION_ID = 'fhyfhy17.windsurf-feedback-panel';

/**
 * Check for updates from GitHub releases
 */
async function checkForUpdates(): Promise<void> {
    const currentExtension = vscode.extensions.getExtension(EXTENSION_ID);
    if (!currentExtension) {
        return;
    }
    
    const currentVersion = currentExtension.packageJSON.version;
    
    const options = {
        hostname: 'api.github.com',
        path: `/repos/${GITHUB_REPO}/releases/latest`,
        headers: {
            'User-Agent': 'VSCode-Extension'
        }
    };
    
    https.get(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            try {
                const release = JSON.parse(data);
                const latestVersion = release.tag_name?.replace('v', '') || '';
                
                if (latestVersion && compareVersions(latestVersion, currentVersion) > 0) {
                    vscode.window.showInformationMessage(
                        `🎉 Panel Feedback v${latestVersion} is available! (current: v${currentVersion})`,
                        'Download',
                        'Later'
                    ).then(action => {
                        if (action === 'Download') {
                            vscode.env.openExternal(vscode.Uri.parse(release.html_url));
                        }
                    });
                }
            } catch (e) {
                // Ignore parse errors
            }
        });
    }).on('error', () => {
        // Ignore network errors
    });
}

/**
 * Compare two version strings (e.g., "1.2.3" vs "1.2.4")
 * Returns: 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
function compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const p1 = parts1[i] || 0;
        const p2 = parts2[i] || 0;
        if (p1 > p2) return 1;
        if (p1 < p2) return -1;
    }
    return 0;
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Windsurf Feedback Panel is now active!');
    
    // Check for updates (delayed to not block activation)
    setTimeout(() => checkForUpdates(), 5000);

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

    // 标题栏设置按钮
    context.subscriptions.push(
        vscode.commands.registerCommand('feedbackPanel.openSettings', () => {
            provider.openSettings();
        })
    );

    // 标题栏清除历史按钮
    context.subscriptions.push(
        vscode.commands.registerCommand('feedbackPanel.clearHistory', () => {
            provider.clearHistory();
        })
    );
}

export function deactivate() {
    if (mcpServer) {
        mcpServer.stop();
    }
}
