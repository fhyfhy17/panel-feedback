#!/usr/bin/env node
const { spawn } = require('child_process');

const wrapper = spawn('node', ['mcp-stdio-wrapper.js'], {
    cwd: '/Users/fenghaiyu/workspace/windsurf-feedback-panel'
});

wrapper.stdout.on('data', (data) => {
    console.log('STDOUT:', data.toString());
});

wrapper.stderr.on('data', (data) => {
    console.log('STDERR:', data.toString());
});

// 发送 initialize 请求
const initRequest = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {}
});

console.log('Sending:', initRequest);
wrapper.stdin.write(initRequest + '\n');

// 3秒后发送 tools/list 请求
setTimeout(() => {
    const listRequest = JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {}
    });
    console.log('Sending:', listRequest);
    wrapper.stdin.write(listRequest + '\n');
}, 1000);

// 5秒后退出
setTimeout(() => {
    console.log('Test complete, exiting...');
    wrapper.kill();
    process.exit(0);
}, 5000);
