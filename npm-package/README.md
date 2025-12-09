# Panel Feedback MCP

Global npm package for Panel Feedback VS Code extension MCP server.

## Installation

```bash
npm install -g panel-feedback-mcp
```

## Usage

Add to your MCP config file:

```json
{
  "mcpServers": {
    "panel-feedback": {
      "command": "panel-feedback-mcp"
    }
  }
}
```

## Requirements

- Node.js >= 14.0.0
- Panel Feedback VS Code extension installed and running
