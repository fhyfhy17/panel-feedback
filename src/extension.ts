import * as vscode from 'vscode';
import { FeedbackPanelProvider } from './FeedbackPanelProvider';
import { MCPServer } from './mcpServer';
import { execSync } from 'child_process';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// 固定的 MCP 服务器路径
const FIXED_MCP_DIR = path.join(os.homedir(), '.panel-feedback');
const FIXED_MCP_PATH = path.join(FIXED_MCP_DIR, 'mcp-stdio-wrapper.js');
const FIXED_NODE_PATH = path.join(FIXED_MCP_DIR, 'node');

/**
 * 获取 node 可执行文件的完整路径
 * 优先动态检测，失败则回退到常见路径
 */
function getNodePath(): string {
    const isWindows = os.platform() === 'win32';
    const command = isWindows ? 'where node' : 'which node';
    
    try {
        const output = execSync(command, { encoding: 'utf-8' }).trim();
        if (output) {
            // Windows 的 where 可能返回多行，取第一行
            const nodePath = output.split(/\r?\n/)[0];
            if (nodePath) {
                return nodePath;
            }
        }
    } catch (e) {
        // 忽略错误
    }
    
    // 回退到常见路径
    if (isWindows) {
        // Windows 常见 Node.js 安装路径
        const commonPaths = [
            path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node.exe'),
            path.join(process.env.LOCALAPPDATA || '', 'Programs', 'node', 'node.exe'),
            'C:\\Program Files\\nodejs\\node.exe'
        ];
        for (const p of commonPaths) {
            if (fs.existsSync(p)) {
                return p;
            }
        }
        return 'node.exe'; // 依赖 PATH
    }
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

/**
 * 创建 node 符号链接到固定位置
 * 这样即使升级 node 版本，重启 IDE 后符号链接会自动更新
 */
function createNodeSymlink(): boolean {
    // Windows 不支持符号链接（或需要管理员权限），跳过
    if (os.platform() === 'win32') {
        console.log('Skipping node symlink on Windows');
        return false;
    }
    
    try {
        const nodePath = getNodePath();
        
        // 删除旧的符号链接（如果存在）
        if (fs.existsSync(FIXED_NODE_PATH)) {
            fs.unlinkSync(FIXED_NODE_PATH);
        }
        
        // 创建新的符号链接
        fs.symlinkSync(nodePath, FIXED_NODE_PATH);
        console.log(`Node symlink created: ${FIXED_NODE_PATH} -> ${nodePath}`);
        return true;
    } catch (err) {
        console.warn(`Failed to create node symlink:`, err);
        return false;
    }
}

/**
 * 复制 MCP 服务器到固定位置
 * 这样用户只需配置一次 MCP，更新扩展后不用重新配置
 */
function copyMcpServerToFixedLocation(extensionUri: vscode.Uri): boolean {
    try {
        // 创建目录（如果不存在）
        if (!fs.existsSync(FIXED_MCP_DIR)) {
            fs.mkdirSync(FIXED_MCP_DIR, { recursive: true });
        }
        
        // 复制 mcp-stdio-wrapper.js
        const sourcePath = vscode.Uri.joinPath(extensionUri, 'mcp-stdio-wrapper.js').fsPath;
        if (fs.existsSync(sourcePath)) {
            fs.copyFileSync(sourcePath, FIXED_MCP_PATH);
            console.log(`MCP server copied to: ${FIXED_MCP_PATH}`);
        } else {
            console.warn(`Source MCP file not found: ${sourcePath}`);
            return false;
        }
        
        // 创建 node 符号链接
        createNodeSymlink();
        
        return true;
    } catch (err) {
        console.warn(`Failed to copy MCP server to fixed location:`, err);
        return false;
    }
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Windsurf Feedback Panel is now active!');
    
    // 复制 MCP 服务器到固定位置
    copyMcpServerToFixedLocation(context.extensionUri);
    
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
            // 使用固定路径，这样更新扩展后不用重新配置
            // macOS/Linux 使用固定的 node 符号链接，Windows 使用动态检测的 node 路径
            const nodePath = (os.platform() === 'win32' || !fs.existsSync(FIXED_NODE_PATH)) 
                ? getNodePath() 
                : FIXED_NODE_PATH;
            const config = {
                "panel-feedback": {
                    "command": nodePath,
                    "args": [FIXED_MCP_PATH]
                }
            };
            const isFixedNode = nodePath === FIXED_NODE_PATH;
            const instruction = `Paste this config into mcp_config.json under mcpServers.\n\n` +
                `MCP server path: ${FIXED_MCP_PATH}\n` +
                `Node path: ${nodePath}${isFixedNode ? ' (symlink, auto-updates on IDE restart)' : ''}\n\n` +
                `You only need to configure once - updates won't change these paths.`;

            const configStr = JSON.stringify(config, null, 2);
            await vscode.env.clipboard.writeText(configStr);
            
            vscode.window.showInformationMessage(
                '✅ MCP config copied to clipboard! (using fixed path)', 
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
