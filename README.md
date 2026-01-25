# Panel Feedback 💬

> **让 AI 真正停下来听你说话 —— Windsurf 专属阻塞式交互面板**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![VS Code](https://img.shields.io/badge/VS%20Code-Extension-007ACC.svg)](https://code.visualstudio.com/)
[![Download](https://img.shields.io/badge/Download-VSIX-orange.svg)](https://github.com/fhyfhy17/panel-feedback/releases/latest)

**Panel Feedback** 是一款专为 Windsurf (以及支持规则注入的 AI IDE) 打造的交互增强扩展。它通过创新的“阻塞式 CLI”架构，彻底解决了 AI 助手“自顾自跑任务、无法及时纠偏”的痛点。

---

## 🔥 核心特性

- 🛡️ **强力阻塞循环**：通过自动注入 `.windsurfrules`，强制 AI 在每一轮任务结束前必须通过脚本调用侧边栏面板。AI 不再会一口气烧掉你的 Token，而是每一步都听取你的反馈。
- 🍎 **仅限 macOS 支持**：目前深度适配 macOS 环境，确保在 Windsurf 中的极致稳定。
- 🏠 **原生侧边栏集成**：拒绝干扰性弹窗。所有交互都在 IDE 侧边栏完成，保持编码心流不中断。
- 📷 **精准多模态视觉**：支持图片拖拽、粘贴上传。通过系统临时目录隔离技术，彻底消除了 AI 因为文件路径而产生的“路径幻觉”，让 AI 真正看清像素。
- ⚡ **零配置启动**：无需配置复杂的 MCP Server，安装后一键初始化工作区即可开始。
- 🕒 **无限等待**：脚本阻塞时间支持永久等待（Timeout: 0），给你充足的思考和回复时间。

## 🚀 快速上手 (安装与使用)

1. **下载安装**：
   从 [最新 Release 页面](https://github.com/fhyfhy17/panel-feedback/releases/latest) 下载 `.vsix` 文件，并拖入 Windsurf 完成安装。

2. **初始化**：
   在命令面板（`Cmd+Shift+P`）搜索并运行 `Panel Feedback: 初始化工作区`。

3. **核心规则 (AI 提示词)**：
   运行初始化后，插件会自动在你的工作区生成 `.windsurfrules`。这就是让 AI 变听话的魔法（你也可以手动复制以下内容）：

   ```markdown
   # 🔄 交互循环
   每一轮回复结束前必须调用以下脚本（配置 Blocking: true 和 SafeToAutoRun: true），严禁自行终止对话。遇到返回指令请立即执行，遇到图片路径请使用 read_file 查看：

   node "~/.panel-feedback/feedback.cjs" "状态描述..."

   ## 规则
   1. 强制在回复末尾调用脚本。
   2. 所有回复必须使用中文。
   3. 严禁使用省略号。

   trigger: always_on
   alwaysApply: true
   ```

4. **开始交谈**：
   在 Windsurf Cascade 中输入任务。**强烈建议在首次对话时，主动将上述“交互循环”代码块粘贴进输入框发送给 AI**，这能确保 AI 深刻理解后续每一步都需调用面板。

   之后，AI 会在完成每个动作后自动调起侧边栏并静静等待你的指示。你可以输入新的反馈，或者直接按 `Ctrl+Enter` 让它继续。

## 📄 开源协议

MIT License - 自由使用，欢迎 Star 代替赞赏！

---

**打造更人性化的 AI-人类协作体验。**

⭐ **如果觉得有用，请在 GitHub 给个 Star！**
