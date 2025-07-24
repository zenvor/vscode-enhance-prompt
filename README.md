# VS Code 插件：Enhance Prompt （Clarify 版）

> 将口语化需求一键梳理成结构化待办事项

## 功能简介
- **Clarify**：输入零散描述，输出「改动目标 / 待办事项 / 备注」三段清晰 Markdown。
- **安全存储**：企业级 API Key 安全存储，基于 VSCode Secrets API，支持跨平台。
- **一键配置**：内置 API Key 配置界面，支持保存、验证和测试连接。
- 基于 **DeepSeek LLM**，本地调用，支持中文/英文双语识别。
- 自动复制、清空、快捷键 **Ctrl / Cmd + Enter** 触发。
- 面板模式保留上下文，不再闪烁。

## 🔒 安全特性
- **系统级加密**: 使用操作系统原生密钥管理
  - Windows: Credential Manager
  - macOS: Keychain
  - Linux: Secret Service
- **零明文存储**: API Key 永远不会以明文形式存储在配置文件中
- **跨窗口同步**: 支持多个 VSCode 窗口间的安全同步
- **临时模式**: 测试环境支持内存存储，进程结束后自动清除

## 快速开始
1. 安装依赖  
   ```bash
   npm install
   ```

2. 配置 API Key（推荐使用安全存储）

   **方式一：安全存储（推荐）**
   * 通过扩展界面配置：点击侧边栏的"配置 API Key"
   * 系统会自动验证并安全存储到系统密钥管理器

   **方式二：环境变量（备选）**
   * 设置环境变量 `DEEPSEEK_API_KEY=sk-xxxxx`

   **注意**: 不再支持在 VSCode 设置中明文存储 API Key

3. 调试运行

   ```bash
   npm run watch      # TS 实时编译
   F5                 # 在调试窗口加载插件
   ```

4. 使用

   * 侧栏 / 命令面板执行 **"Enhance Prompt: 打开面板"**
   * 粘贴描述 → 点击 **✨ 增强** 或 `Ctrl / Cmd + Enter`。

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
├─ src/                # 插件主逻辑
│  ├─ extension.ts     # 主扩展文件
│  ├─ storage/         # 安全存储模块
│  │  ├─ state.ts      # 核心存储逻辑
│  │  ├─ state-keys.ts # 存储键定义
│  │  └─ storage-service.ts # 存储服务类
│  └─ test/            # 测试文件
│     └─ storage-test.ts # 存储功能测试
├─ package.json
├─ README.md
└─ SECURITY.md         # 安全说明文档
```

## 安全存储详情

### API Key 安全配置
推荐使用扩展内置的安全存储功能：
1. 打开扩展侧边栏
2. 点击"配置 API Key"按钮
3. 输入您的 DeepSeek API Key
4. 系统会自动验证并安全存储

### 存储位置
- **Windows**: Windows Credential Manager
- **macOS**: macOS Keychain
- **Linux**: Secret Service API (如 gnome-keyring)

### 开发者测试命令
在开发模式下可使用以下命令测试存储功能：
- `enhancePrompt.testStorage`: 测试基本存储功能
- `enhancePrompt.testCrossPlatform`: 测试跨平台兼容性

详细安全说明请参考 [SECURITY.md](./SECURITY.md)

## 核心依赖

* `vscode` API
* `typescript` 5.x
* `node-fetch` 3.x
