#!/bin/bash

# 发布 npm 包脚本
set -e

echo "🚀 Publishing panel-feedback-mcp npm package..."

# 进入 npm 包目录
cd npm-package

# 检查是否已登录 npm
if ! npm whoami > /dev/null 2>&1; then
    echo "❌ Not logged into npm. Please run 'npm login' first."
    exit 1
fi

# 检查版本是否存在
PACKAGE_VERSION=$(node -p "require('./package.json').version")
if npm view panel-feedback-mcp@$PACKAGE_VERSION version > /dev/null 2>&1; then
    echo "❌ Version $PACKAGE_VERSION already exists on npm"
    echo "Update version in package.json first"
    exit 1
fi

# 发布包
echo "📦 Publishing version $PACKAGE_VERSION..."
npm publish

echo "✅ Successfully published panel-feedback-mcp@$PACKAGE_VERSION"
echo ""
echo "Users can now install with:"
echo "npm install -g panel-feedback-mcp"
