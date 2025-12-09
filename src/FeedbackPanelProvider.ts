import * as vscode from 'vscode';
import * as path from 'path';

interface ChatMessage {
    role: 'ai' | 'user';
    content: string;
    timestamp: number;
    images?: string[];
}

export class FeedbackPanelProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'feedbackPanel.view';
    
    private _view?: vscode.WebviewView;
    private _pendingResolve?: (value: string) => void;
    private _currentMessage: string = '';
    private _currentOptions: string[] = [];
    private _currentRequestId?: string;
    private _chatHistory: ChatMessage[] = [];

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // 监听来自 webview 的消息
        webviewView.webview.onDidReceiveMessage(data => {
            switch (data.type) {
                case 'submit':
                    this._handleSubmit(data.value, data.images);
                    break;
                case 'optionSelected':
                    this._handleSubmit(data.value, []);
                    break;
                case 'clearHistory':
                    this.clearHistory();
                    break;
            }
        });
    }

    private _handleSubmit(text: string, images: string[]) {
        if (this._pendingResolve) {
            // 记录用户回复到历史
            this._chatHistory.push({
                role: 'user',
                content: text,
                timestamp: Date.now(),
                images: images.length > 0 ? images : undefined
            });
            this._updateHistoryInView();
            
            const result = images.length > 0 
                ? JSON.stringify({ text, images })
                : text;
            this._pendingResolve(result);
            this._pendingResolve = undefined;
        }
    }
    
    private _updateHistoryInView() {
        if (this._view) {
            this._view.webview.postMessage({
                type: 'updateHistory',
                history: this._chatHistory
            });
        }
    }
    
    public clearHistory() {
        this._chatHistory = [];
        this._updateHistoryInView();
    }

    public async showMessage(message: string, options?: string[], requestId?: string): Promise<string> {
        this._currentMessage = message;
        this._currentOptions = options || [];
        this._currentRequestId = requestId;

        // 记录 AI 消息到历史
        this._chatHistory.push({
            role: 'ai',
            content: message,
            timestamp: Date.now()
        });

        if (this._view) {
            // false = 不保留焦点，让面板获得焦点
            this._view.show?.(false);
            this._view.webview.postMessage({
                type: 'showMessage',
                message: message,
                options: options || [],
                history: this._chatHistory
            });
        }

        return new Promise((resolve) => {
            this._pendingResolve = resolve;
        });
    }

    public submitFeedback() {
        if (this._view) {
            this._view.webview.postMessage({ type: 'triggerSubmit' });
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Feedback</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background: var(--vscode-sideBar-background);
            padding: 12px;
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        .chat-container {
            margin-bottom: 12px;
            padding: 8px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .chat-bubble {
            max-width: 90%;
            padding: 10px 14px;
            border-radius: 12px;
            line-height: 1.5;
            word-wrap: break-word;
        }
        .chat-bubble.ai {
            align-self: flex-start;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-widget-border);
            border-bottom-left-radius: 4px;
        }
        .chat-bubble.user {
            align-self: flex-end;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border-bottom-right-radius: 4px;
        }
        .chat-bubble .timestamp {
            font-size: 10px;
            opacity: 0.6;
            margin-top: 4px;
        }
        .chat-bubble .user-images {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
            margin-top: 6px;
        }
        .chat-bubble .user-images img {
            max-width: 60px;
            max-height: 60px;
            border-radius: 4px;
        }
        .message {
            line-height: 1.6;
            white-space: pre-wrap;
        }
        .message h1, .message h2, .message h3 {
            margin: 8px 0;
            color: var(--vscode-textLink-foreground);
        }
        .message code {
            background: var(--vscode-textCodeBlock-background);
            padding: 2px 6px;
            border-radius: 3px;
            font-family: var(--vscode-editor-font-family);
        }
        .message pre {
            background: var(--vscode-textCodeBlock-background);
            padding: 12px;
            border-radius: 4px;
            overflow-x: auto;
            margin: 8px 0;
        }
        .clear-history-btn {
            position: absolute;
            top: 8px;
            right: 8px;
            padding: 4px 8px;
            font-size: 11px;
            background: transparent;
            color: var(--vscode-descriptionForeground);
            border: 1px solid var(--vscode-widget-border);
            border-radius: 4px;
            cursor: pointer;
            opacity: 0.7;
        }
        .clear-history-btn:hover {
            opacity: 1;
            background: var(--vscode-button-secondaryBackground);
        }
        .current-question {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-focusBorder);
            border-radius: 8px;
            padding: 12px;
            margin-bottom: 12px;
        }
        .current-question .label {
            font-size: 11px;
            color: var(--vscode-textLink-foreground);
            margin-bottom: 6px;
            font-weight: 500;
        }
        .options-container {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-bottom: 12px;
        }
        .option-btn {
            padding: 8px 16px;
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            transition: background 0.2s;
        }
        .option-btn:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        .input-area {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .image-preview {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-bottom: 8px;
        }
        .image-preview img {
            max-width: 100px;
            max-height: 80px;
            border-radius: 4px;
            cursor: pointer;
        }
        .image-preview .remove-btn {
            position: absolute;
            top: -6px;
            right: -6px;
            width: 18px;
            height: 18px;
            background: var(--vscode-errorForeground);
            color: white;
            border: none;
            border-radius: 50%;
            cursor: pointer;
            font-size: 12px;
            line-height: 1;
        }
        .image-item {
            position: relative;
            display: inline-block;
        }
        textarea {
            width: 100%;
            min-height: 80px;
            padding: 10px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            resize: vertical;
            font-family: inherit;
            font-size: inherit;
        }
        textarea:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }
        .toolbar {
            display: flex;
            gap: 8px;
            align-items: center;
        }
        .toolbar-btn {
            padding: 6px 12px;
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }
        .toolbar-btn:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        .submit-btn {
            padding: 10px 20px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 500;
            margin-left: auto;
        }
        .submit-btn:hover {
            background: var(--vscode-button-hoverBackground);
        }
        .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: var(--vscode-descriptionForeground);
            text-align: center;
        }
        .empty-state svg {
            width: 48px;
            height: 48px;
            margin-bottom: 12px;
            opacity: 0.5;
        }
        #dropZone {
            border: 2px dashed var(--vscode-widget-border);
            border-radius: 4px;
            padding: 20px;
            text-align: center;
            color: var(--vscode-descriptionForeground);
            display: none;
        }
        #dropZone.active {
            display: block;
            border-color: var(--vscode-focusBorder);
            background: var(--vscode-editor-selectionBackground);
        }
        .hidden { display: none !important; }
    </style>
</head>
<body>
    <div id="emptyState" class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
        <p>等待 AI 请求反馈...</p>
    </div>

    <div id="feedbackArea" class="hidden" style="position: relative; display: flex; flex-direction: column; height: 100%; overflow-y: auto;">
        <button id="clearHistoryBtn" class="clear-history-btn" title="清除历史">🗑️ 清除</button>
        
        <!-- 历史对话区域 -->
        <div id="chatHistory" class="chat-container"></div>
        
        <!-- 当前问题区域 -->
        <div id="currentQuestion" class="current-question">
            <div class="label">🤖 AI 提问</div>
            <div id="messageContent" class="message"></div>
        </div>
        
        <div id="optionsContainer" class="options-container"></div>
        
        <div id="dropZone">
            📷 拖拽图片到这里或粘贴
        </div>

        <div class="input-area">
            <div id="imagePreview" class="image-preview"></div>
            <textarea 
                id="feedbackInput" 
                placeholder="输入反馈内容，支持粘贴图片 (Ctrl+V)..."
            ></textarea>
            <div class="toolbar">
                <button class="toolbar-btn" id="pasteBtn">📋 粘贴图片</button>
                <input type="file" id="fileInput" accept="image/*" multiple style="display: none;">
                <button class="toolbar-btn" id="uploadBtn">📁 上传图片</button>
                <button class="submit-btn" id="submitBtn">提交反馈</button>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        const emptyState = document.getElementById('emptyState');
        const feedbackArea = document.getElementById('feedbackArea');
        const messageContent = document.getElementById('messageContent');
        const optionsContainer = document.getElementById('optionsContainer');
        const feedbackInput = document.getElementById('feedbackInput');
        const imagePreview = document.getElementById('imagePreview');
        const submitBtn = document.getElementById('submitBtn');
        const pasteBtn = document.getElementById('pasteBtn');
        const uploadBtn = document.getElementById('uploadBtn');
        const fileInput = document.getElementById('fileInput');
        const dropZone = document.getElementById('dropZone');
        const chatHistory = document.getElementById('chatHistory');
        const clearHistoryBtn = document.getElementById('clearHistoryBtn');
        const currentQuestion = document.getElementById('currentQuestion');

        let images = [];
        let historyData = [];

        // 简单的 Markdown 渲染
        function renderMarkdown(text) {
            return text
                .replace(/^### (.*$)/gm, '<h3>$1</h3>')
                .replace(/^## (.*$)/gm, '<h2>$1</h2>')
                .replace(/^# (.*$)/gm, '<h1>$1</h1>')
                .replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>')
                .replace(/\\*(.*?)\\*/g, '<em>$1</em>')
                .replace(/\`\`\`([\\s\\S]*?)\`\`\`/g, '<pre><code>$1</code></pre>')
                .replace(/\`([^\`]+)\`/g, '<code>$1</code>')
                .replace(/^- (.*$)/gm, '• $1')
                .replace(/\\n/g, '<br>');
        }

        // 格式化时间
        function formatTime(timestamp) {
            const date = new Date(timestamp);
            return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        }

        // 渲染历史对话
        // showAll: true 时显示全部历史（等待状态用）
        function renderHistory(history, showAll = false) {
            // 正常情况：最后一条是当前 AI 问题，不在历史里显示
            // 等待状态：显示全部（包括刚提交的用户回复）
            const historyToShow = showAll ? history : history.slice(0, -1);
            
            chatHistory.innerHTML = '';
            
            if (historyToShow.length === 0) {
                chatHistory.style.display = 'none';
                return;
            }
            
            chatHistory.style.display = 'flex';
            
            historyToShow.forEach(msg => {
                const bubble = document.createElement('div');
                bubble.className = 'chat-bubble ' + msg.role;
                
                let content = '';
                if (msg.role === 'ai') {
                    content = '<div class="message">' + renderMarkdown(msg.content) + '</div>';
                } else {
                    content = '<div>' + (msg.content || '<em>(空)</em>') + '</div>';
                    if (msg.images && msg.images.length > 0) {
                        content += '<div class="user-images">';
                        msg.images.forEach(img => {
                            content += '<img src="' + img + '">';
                        });
                        content += '</div>';
                    }
                }
                content += '<div class="timestamp">' + formatTime(msg.timestamp) + '</div>';
                
                bubble.innerHTML = content;
                chatHistory.appendChild(bubble);
            });
            
            // 滚动到底部
            scrollToBottom();
        }
        
        function scrollToBottom() {
            setTimeout(() => {
                feedbackArea.scrollTop = feedbackArea.scrollHeight;
                // 自动聚焦输入框
                feedbackInput.focus();
            }, 50);
        }

        // 显示消息
        function showMessage(message, options, history) {
            emptyState.classList.add('hidden');
            feedbackArea.classList.remove('hidden');
            
            // 隐藏等待提示
            const waitingDiv = document.getElementById('waitingHint');
            if (waitingDiv) waitingDiv.style.display = 'none';
            
            // 显示当前问题和输入区
            currentQuestion.style.display = 'block';
            document.querySelector('.input-area').style.display = 'flex';
            
            // 渲染历史
            if (history && history.length > 0) {
                historyData = history;
                renderHistory(history);
            }
            
            messageContent.innerHTML = renderMarkdown(message);
            
            // 滚动到底部
            scrollToBottom();
            
            // 渲染选项按钮
            optionsContainer.innerHTML = '';
            if (options && options.length > 0) {
                options.forEach(opt => {
                    const btn = document.createElement('button');
                    btn.className = 'option-btn';
                    btn.textContent = opt;
                    btn.onclick = () => selectOption(opt);
                    optionsContainer.appendChild(btn);
                });
            }
            
            feedbackInput.value = '';
            images = [];
            updateImagePreview();
        }

        // 选择选项
        function selectOption(value) {
            // 先添加用户回复到本地历史
            addUserReplyToHistory(value, []);
            vscode.postMessage({ type: 'optionSelected', value });
            showWaitingState();
        }

        // 提交反馈
        function submit() {
            const text = feedbackInput.value.trim();
            const currentImages = [...images];
            
            // 先添加用户回复到本地历史
            addUserReplyToHistory(text, currentImages);
            
            vscode.postMessage({ 
                type: 'submit', 
                value: text,
                images: currentImages 
            });
            showWaitingState();
        }
        
        // 添加用户回复到本地历史
        function addUserReplyToHistory(text, imgs) {
            historyData.push({
                role: 'user',
                content: text,
                timestamp: Date.now(),
                images: imgs.length > 0 ? imgs : undefined
            });
            // 等待状态时显示完整历史
            renderHistory(historyData, true);
        }

        // 显示等待状态（保留历史，隐藏当前问题）
        function showWaitingState() {
            feedbackInput.value = '';
            images = [];
            updateImagePreview();
            
            // 隐藏当前问题和输入区，但保留历史
            currentQuestion.style.display = 'none';
            optionsContainer.innerHTML = '';
            document.querySelector('.input-area').style.display = 'none';
            
            // 如果没有历史，则显示空状态
            if (historyData.length <= 1) {
                emptyState.classList.remove('hidden');
                feedbackArea.classList.add('hidden');
            } else {
                // 显示等待提示
                const waitingDiv = document.getElementById('waitingHint') || createWaitingHint();
                waitingDiv.style.display = 'block';
            }
        }
        
        function createWaitingHint() {
            const div = document.createElement('div');
            div.id = 'waitingHint';
            div.style.cssText = 'text-align: center; padding: 20px; color: var(--vscode-descriptionForeground); font-size: 13px;';
            div.innerHTML = '⏳ 等待 AI 下一个问题...';
            feedbackArea.appendChild(div);
            return div;
        }

        function resetToEmpty() {
            emptyState.classList.remove('hidden');
            feedbackArea.classList.add('hidden');
            feedbackInput.value = '';
            images = [];
            updateImagePreview();
        }

        // 图片处理
        function addImage(dataUrl) {
            images.push(dataUrl);
            updateImagePreview();
        }

        function removeImage(index) {
            images.splice(index, 1);
            updateImagePreview();
        }

        function updateImagePreview() {
            imagePreview.innerHTML = '';
            images.forEach((img, idx) => {
                const item = document.createElement('div');
                item.className = 'image-item';
                item.innerHTML = \`
                    <img src="\${img}" onclick="window.open('\${img}')">
                    <button class="remove-btn" onclick="removeImage(\${idx})">×</button>
                \`;
                imagePreview.appendChild(item);
            });
        }

        // 粘贴处理
        document.addEventListener('paste', async (e) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            
            for (const item of items) {
                if (item.type.startsWith('image/')) {
                    e.preventDefault();
                    const file = item.getAsFile();
                    const reader = new FileReader();
                    reader.onload = () => addImage(reader.result);
                    reader.readAsDataURL(file);
                }
            }
        });

        // 拖拽处理
        document.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('active');
        });

        document.addEventListener('dragleave', () => {
            dropZone.classList.remove('active');
        });

        document.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('active');
            
            const files = e.dataTransfer?.files;
            if (files) {
                Array.from(files).forEach(file => {
                    if (file.type.startsWith('image/')) {
                        const reader = new FileReader();
                        reader.onload = () => addImage(reader.result);
                        reader.readAsDataURL(file);
                    }
                });
            }
        });

        // 文件上传
        uploadBtn.onclick = () => fileInput.click();
        fileInput.onchange = (e) => {
            const files = e.target.files;
            Array.from(files).forEach(file => {
                const reader = new FileReader();
                reader.onload = () => addImage(reader.result);
                reader.readAsDataURL(file);
            });
        };

        // 提交按钮
        submitBtn.onclick = submit;

        // 快捷键：回车发送，Cmd+回车换行
        feedbackInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                if (e.ctrlKey || e.metaKey) {
                    // Cmd+回车 = 换行，不阻止默认行为
                    return;
                }
                // 回车 = 发送
                e.preventDefault();
                submit();
            }
        });

        // 清除历史按钮
        clearHistoryBtn.onclick = () => {
            vscode.postMessage({ type: 'clearHistory' });
            historyData = [];
            chatHistory.innerHTML = '';
            chatHistory.style.display = 'none';
        };

        // 监听来自扩展的消息
        window.addEventListener('message', event => {
            const data = event.data;
            switch (data.type) {
                case 'showMessage':
                    showMessage(data.message, data.options, data.history);
                    break;
                case 'triggerSubmit':
                    submit();
                    break;
                case 'updateHistory':
                    historyData = data.history || [];
                    // 更新历史时显示全部（包括最新用户回复）
                    renderHistory(historyData, true);
                    break;
            }
        });
    </script>
</body>
</html>`;
    }
}
