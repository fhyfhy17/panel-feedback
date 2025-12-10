# Panel Feedback v1.1.1

## 🐛 Bug Fix

### Fixed: MCP shows yellow status with 0 tools
- **Root Cause**: `mcp-stdio-wrapper.js` forwarded all requests (including `initialize` and `tools/list`) to extension's HTTP server on port 19876, but extension may not be activated yet
- **Solution**: Wrapper now handles `initialize` and `tools/list` locally, only forwards `tools/call` to extension
- MCP will now show **green status with 1 tool** even when extension panel is not opened

---

# Panel Feedback v2.0.0 🎉

## 🚀 Major Updates

### ✨ Dual Installation Methods
- **NPM Package (NEW)**: `npm install -g panel-feedback-mcp` - Super simple!
- **Direct Extension**: Traditional `.vsix` file installation

### 🧠 Smart MCP Configuration
- Interactive config selection: `Cmd+Shift+P` → `Panel Feedback: Copy MCP Config`
- Choose between NPM package or extension path
- Auto-generated configuration with instructions

### 📦 What's New
- Created standalone NPM package `panel-feedback-mcp` 
- Enhanced user experience with guided setup
- Improved documentation (English & Chinese)
- Added build and publish scripts

## 📥 Installation Options

### Method 1: NPM Package (Recommended)
```bash
# Install extension from VS Code Marketplace (search "Panel Feedback")
npm install -g panel-feedback-mcp
# Configure MCP and you're done!
```

### Method 2: Direct Extension  
```bash
# Download windsurf-feedback-panel-2.0.0.vsix
code --install-extension windsurf-feedback-panel-2.0.0.vsix
# Use built-in config copy command
```

## 🔧 MCP Configuration Examples

**NPM Package:**
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

## 🐛 Bug Fixes
- Improved error messages for connection issues
- Better handling of extension path detection
- Enhanced polling mechanism stability

---

**Full Changelog**: https://github.com/fhyfhy17/panel-feedback/compare/v1.0.0...v2.0.0
