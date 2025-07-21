# Enhance Prompt for VS Code

> 一键把散乱的需求描述升级为可交付的开发任务说明 —— DeepSeek LLM 驱动  
> **快捷键**：`Ctrl+Alt+E`

## 特性
- 兼容任何语言文本
- 自带中文模板，可自行修改
- 选中文本或整篇文档均可增强
- 基于 DeepSeek API（OpenAI‑兼容）调用

## 安装
```bash
git clone https://github.com/zenvor/vscode-enhance-prompt
cd vscode-enhance-prompt
npm i
npm run build
vsce package      # 需要先 global 安装 vsce
code --install-extension vscode-enhance-prompt-0.0.1.vsix
