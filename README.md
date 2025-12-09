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
- **VS Code** / **Windsurf** / **Cursor** developers
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

### 🎯 Method 1: NPM Package (Recommended ⭐)

**Super Simple - Just 3 Steps:**

1. **Install Extension**: Download from [Releases](https://github.com/fhyfhy17/panel-feedback/releases) or install from marketplace
2. **Install MCP Server**: 
   ```bash
   npm install -g panel-feedback-mcp
   ```
3. **Auto-Configure**: `Cmd+Shift+P` → `Panel Feedback: Copy MCP Config` → Choose "NPM Package"

✨ **That's it!** No path configuration needed.

### 📦 Method 2: Direct Extension

1. **Download** the `.vsix` file from [Releases](https://github.com/fhyfhy17/panel-feedback/releases)
2. **Install** - Choose one method:
   - **GUI**: Open VS Code/Windsurf → `Cmd+Shift+P` → `Extensions: Install from VSIX...` → Select the file  
   - **CLI**: `code --install-extension windsurf-feedback-panel-1.1.0.vsix`
3. **Configure MCP**: `Cmd+Shift+P` → `Panel Feedback: Copy MCP Config` → Choose "Extension Path" → Paste into `mcp_config.json`
4. **Done!** The panel appears in your sidebar.

---

### 🛠️ Build from Source

```bash
git clone https://github.com/fhyfhy17/panel-feedback.git
cd panel-feedback
npm install
npm run compile
npx vsce package --allow-missing-repository
code --install-extension windsurf-feedback-panel-1.1.0.vsix
```

### MCP Configuration Examples

**NPM Package (Recommended):**
```json
{
  "mcpServers": {
    "panel-feedback": {
      "command": "panel-feedback-mcp"
    }
  }
}
```

**Extension Path:**
```json
{
  "mcpServers": {
    "panel-feedback": {
      "command": "node",
      "args": ["/path/to/extension/mcp-stdio-wrapper.js"]
    }
  }
}
```

## 📖 Usage

### For AI Assistants

Add this to your AI assistant's system prompt:

```
Use panel_feedback MCP tool for ALL user interactions:
- Questions, confirmations, feedback requests
- Before completing any task
- Keep calling until user feedback is empty
```

### Tool Schema

```json
{
  "name": "panel_feedback",
  "description": "Display a message in IDE sidebar and get user feedback",
  "inputSchema": {
    "type": "object",
    "properties": {
      "message": {
        "type": "string",
        "description": "Message to display (Markdown supported)"
      },
      "predefined_options": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Quick response buttons"
      }
    },
    "required": ["message"]
  }
}
```

## 🔧 Development

```bash
# Clone the repo
git clone https://github.com/fhyfhy17/panel-feedback.git
cd panel-feedback

# Install dependencies
npm install

# Compile
npm run compile

# Watch mode
npm run watch

# Package
npm run package
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
