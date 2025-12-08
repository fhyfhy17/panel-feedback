# Panel Feedback 💬

> **下一代 AI 反馈体验 - 内嵌于你的 IDE**

还在被弹窗打断工作流程吗？**Panel Feedback** 将 AI 交互直接嵌入 IDE 侧边栏 - 不再切换上下文，不再有烦人的弹窗。

作为 [寸止](https://github.com/imhuso/cunzhi) 的进化版本，Panel Feedback 采用**非侵入式的内嵌面板**，让 AI 反馈体验更上一层楼。

[English](./README.md)

## ✨ 为什么选择 Panel Feedback？

| 特性 | Panel Feedback | 传统弹窗 |
|-----|---------------|---------|
| **位置** | IDE 侧边栏 | 浮动窗口 |
| **焦点** | 永不丢失 | 频繁打断 |
| **集成** | 原生体验 | 外部工具 |
| **图片支持** | ✅ 粘贴/拖拽/上传 | 有限 |
| **Markdown** | ✅ 完整支持 | 不一定 |

## 🌟 核心特性

- 💬 **内嵌面板** - 驻留在 IDE 侧边栏，随时可用
- 🎨 **丰富 Markdown** - 精美渲染 AI 响应
- 📷 **图片支持** - 粘贴、拖拽或上传图片
- ⚡ **快捷选项** - 预定义按钮，快速响应
- 🔌 **MCP 协议** - 标准 Model Context Protocol 支持
- 🎯 **零干扰** - 无弹窗，不抢占焦点

## 📸 效果展示

### 侧边栏集成
反馈面板驻留在 IDE 中 - 始终可见，永不打扰。

### Markdown 渲染
完整的 Markdown 支持，代码块语法高亮。

### 图片反馈
直接粘贴截图或拖拽图片，实现可视化反馈。

## 🚀 安装

### 前置条件
- VS Code、Windsurf 或任何兼容 VS Code 的 IDE
- Node.js 18+

### 快速安装

1. **下载扩展**
   ```bash
   git clone https://github.com/YOUR_USERNAME/panel-feedback.git
   cd panel-feedback
   npm install
   npm run compile
   ```

2. **打包扩展**
   ```bash
   npx vsce package --allow-missing-repository
   ```

3. **安装到 IDE**
   ```bash
   code --install-extension panel-feedback-1.0.0.vsix
   # 或者 Windsurf
   windsurf --install-extension panel-feedback-1.0.0.vsix
   ```

### MCP 配置

添加到你的 MCP 配置文件（如 `mcp_config.json`）：

```json
{
  "mcpServers": {
    "panel-feedback": {
      "command": "node",
      "args": ["/path/to/panel-feedback/mcp-stdio-wrapper.js"]
    }
  }
}
```

## 📖 使用方法

### AI 助手配置

将以下内容添加到 AI 助手的系统提示词中：

```
当你需要用户反馈或确认时：
1. 使用 panel_feedback MCP 工具，而不是直接询问
2. 提供清晰的 Markdown 格式消息
3. 包含 predefined_options 以便快速响应
4. 持续调用工具直到用户反馈为空

优先级：panel-feedback > 其他反馈工具
```

### 工具 Schema

```json
{
  "name": "panel_feedback",
  "description": "在 IDE 侧边栏显示消息并获取用户反馈",
  "inputSchema": {
    "type": "object",
    "properties": {
      "message": {
        "type": "string",
        "description": "要显示的消息（支持 Markdown）"
      },
      "predefined_options": {
        "type": "array",
        "items": { "type": "string" },
        "description": "快捷响应按钮"
      }
    },
    "required": ["message"]
  }
}
```

## 🔧 开发

```bash
# 克隆仓库
git clone https://github.com/YOUR_USERNAME/panel-feedback.git
cd panel-feedback

# 安装依赖
npm install

# 编译
npm run compile

# 监听模式
npm run watch

# 打包
npm run package
```

## 🆚 与寸止的对比

Panel Feedback 受寸止启发，并与其方案兼容，但有以下关键改进：

| 方面 | Panel Feedback | 寸止 |
|-----|---------------|------|
| **界面** | 内嵌侧边栏 | 弹窗 |
| **焦点** | 永不打断 | 可能抢占焦点 |
| **平台** | VS Code 扩展 | 独立应用 |
| **图片** | 完整支持 | 支持 |
| **Markdown** | 完整支持 | 支持 |

## 🤝 参与贡献

欢迎贡献！你可以：

- 🐛 报告 Bug
- 💡 建议新功能
- 🔧 提交 Pull Request

## 📄 开源协议

MIT License - 自由使用和修改！

## 🙏 致谢

- [寸止](https://github.com/imhuso/cunzhi) - AI 反馈工具的原始灵感来源
- [interactive-feedback-mcp](https://github.com/noopstudios/interactive-feedback-mcp) - MCP 反馈实现参考

---

**用 ❤️ 打造更好的 AI-人类协作**
