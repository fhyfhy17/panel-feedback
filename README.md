# Panel Feedback 💬

[🇨🇳 中文文档](./README_CN.md) | [🇺🇸 English](#panel-feedback-)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![NPM Package](https://img.shields.io/badge/NPM-panel--feedback--mcp-red.svg)](https://www.npmjs.com/package/panel-feedback-mcp)
[![VS Code](https://img.shields.io/badge/VS%20Code-Extension-007ACC.svg)](https://code.visualstudio.com/)
[![MCP](https://img.shields.io/badge/MCP-Compatible-blue.svg)](https://modelcontextprotocol.io)

> **The Next-Gen AI Feedback Experience - Embedded in Your IDE**
>
> *Stop the pop-ups. Start the flow.*

🚫 **Tired of pop-up windows interrupting your coding flow?**  
🚫 **Annoyed by dialogs stealing your focus?**  
🚫 **Context switching killing your productivity?**

**Panel Feedback** solves all of this by bringing AI interaction directly into your IDE's sidebar - seamlessly integrated, always accessible, never intrusive.

Born as an evolution of [寸止](https://github.com/imhuso/cunzhi), Panel Feedback takes the concept further with a **non-intrusive, embedded panel** that stays right where you need it.

### 🎯 Perfect for

- **Claude** / **GPT** / **Gemini** users with MCP support
- **VS Code** / **Windsurf** / **Cursor** / **Antigravity** developers
- Anyone who values **uninterrupted workflow**

[中文文档](./README_CN.md)

## ✨ Why Panel Feedback?

| Feature | Panel Feedback | Traditional Pop-ups |
|---------|---------------|---------------------|
| **Location** | IDE Sidebar | Floating Window |
| **Focus** | Never lost | Constantly interrupted |
| **Integration** | Native feel | External tool |
| **Image Support** | ✅ Paste/Drag/Upload | Limited |
| **Markdown** | ✅ Full support | Varies |

## 🌟 Features

- 💬 **Embedded Panel** - Lives in your IDE sidebar, always accessible
- 🎨 **Rich Markdown** - Beautiful rendering of AI responses
- 📷 **Image Support** - Paste, drag & drop, or upload images
- ⚡ **Quick Options** - Predefined buttons for fast responses
- 🔌 **MCP Protocol** - Standard Model Context Protocol support
- 🎯 **Zero Distraction** - No pop-ups, no focus stealing

## 📸 Screenshots

### Sidebar Integration

![Sidebar](./screenshots/sidebar.png)

The feedback panel lives in your IDE - always visible, never intrusive.

## 🚀 Installation

### Step 1️⃣ Install Extension

Download `.vsix` from [**Releases**](https://github.com/fhyfhy17/panel-feedback/releases/latest)

In VS Code/Windsurf:

- `Cmd+Shift+P` → `Extensions: Install from VSIX...` → Select the downloaded file

#### ⚠️ Cursor Users

Cursor requires an extra step before installing:

1. Open Settings (`Cmd+,`)
2. Search for `activityBar.orientation`
3. Add this to your `settings.json`:

   ```json
   "workbench.activityBar.orientation": "vertical"
   ```

4. Restart Cursor
5. Now you can install the `.vsix` file

This makes the sidebar vertical so the extension icon can be displayed.

✅ Now you have the **Sidebar Panel UI**

---

### Step 2️⃣ Configure MCP Server

The extension includes an MCP server. You need to tell your AI where to find it.

1. **Copy the config:**
   - `Cmd+Shift+P` → `Panel Feedback: Copy MCP Config`
   - This copies a JSON snippet to your clipboard

2. **Paste to MCP config file:**
   - Open `~/.codeium/windsurf/mcp_config.json` (Windsurf)
   - Or `~/.cursor/mcp.json` (Cursor)
   - Or `~/.gemini/antigravity/mcp_config.json` (Antigravity)
   - Add the copied content to `"mcpServers": { ... }`

Example:

```json
{
  "mcpServers": {
    "panel-feedback": {
      "command": "/usr/local/bin/node",
      "args": ["/path/to/extension/mcp-stdio-wrapper.js"]
    }
  }
}
```

> **Note**: Use the full path to node (e.g., `/usr/local/bin/node`) instead of just `node` to avoid PATH issues when IDE starts MCP servers.

✅ Now your AI can **call the panel_feedback tool**

---

### Step 3️⃣ Restart & Use

1. Restart VS Code/Windsurf
2. Click the 💬 icon in sidebar
3. Tell your AI: "Use panel_feedback MCP for interactions"

🎉 **Done!**

## 📖 Usage

### For AI Assistants

Add this to your AI assistant's system prompt:

```
Use panel_feedback MCP tool for ALL user interactions:
- Questions, confirmations, feedback requests
- Before completing any task
- Keep calling until user feedback is empty
```

## 🆚 Comparison with 寸止

Panel Feedback is inspired by and compatible with 寸止's approach, but with key improvements:

| Aspect | Panel Feedback | 寸止 |
|--------|---------------|------|
| **UI** | Embedded sidebar | Pop-up window |
| **Focus** | Never interrupts | May steal focus |
| **Platform** | VS Code extension | Standalone app |
| **Image** | Full support | Supported |
| **Markdown** | Full support | Supported |

## 🤝 Contributing

Contributions are welcome! Feel free to:

- 🐛 Report bugs
- 💡 Suggest features
- 🔧 Submit pull requests

## 📄 License

MIT License - Free to use and modify!

## 🙏 Acknowledgments

- [寸止](https://github.com/imhuso/cunzhi) - The original inspiration for AI feedback tools
- [interactive-feedback-mcp](https://github.com/noopstudios/interactive-feedback-mcp) - MCP feedback implementation reference

## 🏷️ Keywords

`MCP` `Model Context Protocol` `AI Feedback` `VS Code Extension` `Windsurf` `Cursor` `Claude` `GPT` `AI Assistant` `Developer Tools` `IDE Extension` `Non-intrusive` `Sidebar Panel` `Markdown` `Image Upload`

---

**Made with ❤️ for better AI-human collaboration**

⭐ **Star this repo if you find it useful!**
