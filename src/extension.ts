import * as vscode from 'vscode';
import { FeedbackPanelProvider } from './FeedbackPanelProvider';
import { HttpServer } from './httpServer';
import { WorkspaceManager } from './workspaceManager';
import * as https from 'https';

let httpServer: HttpServer | undefined;

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
 * Compare two version strings
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
 * 清理所有工作区中遗留的哨兵文件
 * 防止因上次异常退出（如直接关闭 Windsurf）导致面板卡死
 */
function cleanupStaleSentinelFiles(): void {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');

    const LOCAL_DIR = 'feedback-assets';
    const SENTINEL_FILE = 'NEXT_STEP.md';

    // 1. 清理全局目录
    const globalSentinel = path.join(os.homedir(), LOCAL_DIR, SENTINEL_FILE);
    if (fs.existsSync(globalSentinel)) {
        try {
            fs.unlinkSync(globalSentinel);
            console.log(`[PanelFeedback] Cleaned up stale sentinel: ${globalSentinel}`);
        } catch (e) {
            console.error(`[PanelFeedback] Failed to clean sentinel: ${e}`);
        }
    }

    // 2. 清理每个工作区的目录
    const folders = vscode.workspace.workspaceFolders;
    if (folders) {
        for (const folder of folders) {
            const sentinelPath = path.join(folder.uri.fsPath, LOCAL_DIR, SENTINEL_FILE);
            if (fs.existsSync(sentinelPath)) {
                try {
                    fs.unlinkSync(sentinelPath);
                    console.log(`[PanelFeedback] Cleaned up stale sentinel: ${sentinelPath}`);
                } catch (e) {
                    console.error(`[PanelFeedback] Failed to clean sentinel: ${e}`);
                }
            }
        }
    }
}

/**
 * 清理所有工作区中超过 1 天的旧图片
 */
function cleanupOldImages(): void {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const folders = vscode.workspace.workspaceFolders;

    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const now = Date.now();

    const dirsToClean: string[] = [];

    // 1) 全局目录（家目录）
    dirsToClean.push(path.join(os.homedir(), '.panel-feedback', 'images'));

    // 2) 工作区目录
    if (folders) {
        for (const folder of folders) {
            dirsToClean.push(path.join(folder.uri.fsPath, '.panel-feedback', 'images'));
        }
    }

    for (const imagesDir of dirsToClean) {
        if (fs.existsSync(imagesDir)) {
            try {
                const files = fs.readdirSync(imagesDir);
                for (const file of files) {
                    const filePath = path.join(imagesDir, file);
                    const stats = fs.statSync(filePath);
                    if (now - stats.mtimeMs > ONE_DAY_MS) {
                        fs.unlinkSync(filePath);
                        console.log(`[PanelFeedback] Deleted old image: ${filePath}`);
                    }
                }
            } catch (e) {
                console.error(`[PanelFeedback] Failed to cleanup images: ${e}`);
            }
        }
    }
}

export function activate(context: vscode.ExtensionContext) {
    console.log('[PanelFeedback] Activating extension...');

    // 【重要】：启动时清理遗留的哨兵文件，防止因上次异常退出导致面板卡死
    cleanupStaleSentinelFiles();
    // 【重要】：清理全局目录中超过 24 小时的旧图片
    cleanupOldImages();

    // Check for updates (delayed)
    setTimeout(() => checkForUpdates(), 5000);

    // 创建 Provider
    const provider = new FeedbackPanelProvider(context.extensionUri);

    // 创建工作区管理器
    const workspaceManager = new WorkspaceManager(context.extensionPath);

    // 监听 Webview 的解析/显示事件
    // 注意：FeedbackPanelProvider 原本没有 onResolve 事件，我们在这里利用 setPort 的调用链
    // 或者直接重写其 resolveWebviewView
    const originalResolve = provider.resolveWebviewView.bind(provider);
    provider.resolveWebviewView = (webviewView, context, token) => {
        console.log('[PanelFeedback] Panel resolved, checking workspace setup...');
        workspaceManager.setup();
        if (httpServer && httpServer.getPort() > 0) {
            httpServer.writePortFiles(httpServer.getPort());
        }
        return originalResolve(webviewView, context, token);
    };

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

    // 立即执行一次 setup
    if (vscode.workspace.workspaceFolders?.length) {
        console.log('[PanelFeedback] Running initial workspace setup...');
        workspaceManager.setup();
    }

    // 创建 HTTP 服务器
    httpServer = new HttpServer(provider, async (data) => {
        console.log(`[PanelFeedback] Received request: ${data.requestId}`);
        await provider.showMessage(data.prompt, [], data.requestId);
    });

    // 监听用户响应
    provider.onUserResponse((response) => {
        httpServer?.sendResponse(response, response.requestId);
    });

    // 启动 HTTP 服务器
    setTimeout(async () => {
        try {
            const port = await httpServer!.start();
            if (port > 0) {
                console.log(`[PanelFeedback] HTTP Server started on port ${port}`);
                provider.setPort(port);

                // 确保端口文件已写入 (setup 里面也会写，这里双重保险)
                httpServer!.writePortFiles(port);
            }
        } catch (err) {
            vscode.window.showErrorMessage(`PanelFeedback failed to start: ${err}`);
        }
    }, 100);

    // 监听工作区变化
    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(() => {
            console.log('[PanelFeedback] Workspace folders changed, re-running setup...');
            if (vscode.workspace.workspaceFolders?.length) {
                workspaceManager.setup();
                if (httpServer && httpServer.getPort() > 0) {
                    httpServer.writePortFiles(httpServer.getPort());
                }
            }
        })
    );

    // 注册手动初始化命令
    context.subscriptions.push(
        vscode.commands.registerCommand('feedbackPanel.setupWorkspace', () => {
            workspaceManager.setup();
            if (httpServer && httpServer.getPort() > 0) {
                httpServer.writePortFiles(httpServer.getPort());
            }
            vscode.window.showInformationMessage('Panel Feedback 工作区配置已更新');
        })
    );

    // 注册提交反馈命令
    context.subscriptions.push(
        vscode.commands.registerCommand('feedbackPanel.submit', () => {
            provider.submitFeedback();
        })
    );

    // 复制配置命令（保留但更新内容）
    context.subscriptions.push(
        vscode.commands.registerCommand('feedbackPanel.copyMcpConfig', async () => {
            const instruction = `Panel Feedback 现在使用 CLI 模式，不再需要 MCP 配置。\n\n` +
                `扩展会自动在工作区创建：\n` +
                `- .panel-feedback/feedback.cjs (CLI 脚本)\n` +
                `- .windsurfrules (AI 规则文件)\n\n` +
                `AI 会自动在每次回复后调用脚本等待你的反馈。\n\n` +
                `如果文件未生成，可运行命令 [Panel Feedback: 初始化工作区]`;

            vscode.window.showInformationMessage(instruction, { modal: true });
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

    console.log('[PanelFeedback] Extension activated');
}

export function deactivate() {
    if (httpServer) {
        httpServer.dispose();
    }
    console.log('[PanelFeedback] Extension deactivated');
}
