/**
 * 工作区管理器 - 自动注入规则文件和脚本
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const LOCAL_DIR_NAME = 'feedback-assets';
const GLOBAL_DIR_NAME = '.panel-feedback';
const RULE_MARKER = '<!-- PANEL_FEEDBACK_V5 -->';

export class WorkspaceManager {
    constructor(private readonly extensionPath: string) { }

    public setup() {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders?.length) {
            return;
        }

        const homeDir = os.homedir();
        const globalDir = path.join(homeDir, GLOBAL_DIR_NAME);
        const globalScriptPath = path.join(globalDir, 'feedback.cjs');

        try {
            if (!fs.existsSync(globalDir)) {
                fs.mkdirSync(globalDir, { recursive: true });
            }
            const scriptSrc = path.join(this.extensionPath, 'lib', 'feedback.cjs');
            if (fs.existsSync(scriptSrc)) {
                fs.copyFileSync(scriptSrc, globalScriptPath);
                fs.chmodSync(globalScriptPath, '755');
            }
        } catch (e) {
            console.error(`[PanelFeedback] Failed to setup global script: ${e}`);
        }

        for (const folder of folders) {
            const workspacePath = folder.uri.fsPath;
            const localDir = path.join(workspacePath, LOCAL_DIR_NAME);
            if (!fs.existsSync(localDir)) {
                fs.mkdirSync(localDir, { recursive: true });
            }
            this.updateWindsurfRules(workspacePath, globalScriptPath);
            this.updateGitignore(workspacePath);
        }
    }

    private updateWindsurfRules(workspacePath: string, scriptPath: string) {
        const rulesDest = path.join(workspacePath, '.windsurfrules');
        const rulesContent = this.generateRulesContent(scriptPath, workspacePath);

        if (fs.existsSync(rulesDest)) {
            const existing = fs.readFileSync(rulesDest, 'utf-8');
            if (existing.includes('PANEL_FEEDBACK')) {
                const lines = existing.split('\n');
                let newLines = [];
                let skip = false;
                for (const line of lines) {
                    if (line.includes('PANEL_FEEDBACK')) skip = true;
                    if (!skip) newLines.push(line);
                    if (skip && line.includes('alwaysApply: true')) {
                        skip = false;
                        continue;
                    }
                }
                fs.writeFileSync(rulesDest, newLines.join('\n').trim() + '\n\n' + rulesContent);
                return;
            }
        }
        fs.appendFileSync(rulesDest, '\n\n' + rulesContent);
    }

    private updateGitignore(workspacePath: string) {
        const gitignorePath = path.join(workspacePath, '.gitignore');
        if (fs.existsSync(gitignorePath)) {
            const content = fs.readFileSync(gitignorePath, 'utf-8');
            const entry = LOCAL_DIR_NAME + '/';
            // 彻底不再忽略该目录，直接从 .gitignore 中移除相关规则（如果存在）
            if (content.includes(entry) || content.includes('.panel-feedback/')) {
                const lines = content.split('\n');
                const newContent = lines.filter(line =>
                    !line.includes(entry) &&
                    !line.includes('.panel-feedback/') &&
                    !line.includes('Panel Feedback')
                ).join('\n').trim();
                fs.writeFileSync(gitignorePath, newContent + '\n');
            }
        }
    }

    private generateRulesContent(scriptPath: string, workspacePath: string): string {
        const homeDir = os.homedir();
        const displayPath = scriptPath.startsWith(homeDir)
            ? scriptPath.replace(homeDir, '~')
            : scriptPath;

        return `${RULE_MARKER}

# 🔄 交互循环
每一轮回复结束前必须调用脚本，不得自行终止对话：

\`\`\`bash
node "${displayPath}" "状态描述..."
\`\`\`

- **Blocking**: true
- **SafeToAutoRun**: true
- **处理**: 遇到指令立即执行；遇到图片路径用 read_file 查看。

## 规则
1. 强制在回复末尾调用脚本。
2. 所有回复必须使用中文。
3. 严禁使用省略号。

trigger: always_on
alwaysApply: true
`;
    }
}
