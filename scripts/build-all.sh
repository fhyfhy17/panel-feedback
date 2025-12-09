#!/bin/bash

# 构建扩展和npm包脚本
set -e

echo "🔨 Building Panel Feedback extension and npm package..."

# 构建扩展
echo "📦 Building VS Code extension..."
npm install
npm run compile

# 打包扩展
echo "📦 Packaging extension..."
npx vsce package --allow-missing-repository

echo "✅ Build completed!"
echo ""
echo "Generated files:"
echo "- windsurf-feedback-panel-2.0.0.vsix (VS Code extension)"
echo "- npm-package/ (NPM package ready for publishing)"
echo ""
echo "Next steps:"
echo "1. Test the extension: code --install-extension windsurf-feedback-panel-2.0.0.vsix"
echo "2. Publish npm package: ./scripts/publish-npm.sh"
