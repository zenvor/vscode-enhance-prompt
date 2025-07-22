# VS Code 插件：Enhance Prompt （Clarify 版）

> 将口语化需求一键梳理成结构化待办事项

## 功能简介
- **Clarify**：输入零散描述，输出「改动目标 / 待办事项 / 备注」三段清晰 Markdown。
- 基于 **DeepSeek LLM**，本地调用，支持中文/英文双语识别。
- 自动复制、清空、快捷键 **Ctrl / Cmd + Enter** 触发。
- 面板模式保留上下文，不再闪烁。

## 快速开始
1. 安装依赖  
   ```bash
   npm install

2. 配置 API Key（任选其一）

   * `File → Preferences → Settings`

     ```jsonc
     {
       "enhancePrompt.deepseekApiKey": "sk-xxxxx..."
     }
     ```
   * 或在系统环境变量中设置 `DEEPSEEK_API_KEY=sk-xxxxx`

3. 调试运行

   ```bash
   npm run watch      # TS 实时编译
   F5                 # 在调试窗口加载插件
   ```

4. 使用

   * 侧栏 / 命令面板执行 **“Enhance Prompt: 打开面板”**
   * 粘贴描述 → 点击 **✨ 增强** 或 `Ctrl / Cmd + Enter`。

## 打包发布

```bash
npm run build          # 编译 dist
npx @vscode/vsce package
```

## 目录结构

```
├─ media/              # Webview 静态资源
│  ├─ clarify.html
│  └─ sparkles-outline.svg
├─ src/                # 插件主逻辑（WebviewPanel 版）
│  └─ extension.ts
├─ package.json
└─ README.md
```

## 核心依赖

* `vscode` API
* `typescript` 5.x
* `node-fetch` 3.x
