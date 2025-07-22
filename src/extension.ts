import * as vscode from 'vscode';
import fetch from 'node-fetch';

// ============ 项目画像类型定义 ============
interface ProjectProfile {
  hasBackend: boolean;
  backendStack: 'php' | 'node' | 'go' | 'python' | 'java' | 'csharp' | null;
  hasDatabase: boolean;
  frontendStack: 'vue' | 'react' | 'angular' | 'svelte' | 'vanilla' | null;
  detectedFiles: string[];
  lastScanTime: number;
}

// 全局缓存的项目画像
let cachedProjectProfile: ProjectProfile | null = null;

// ============ 工作区分析功能 ============
async function analyzeWorkspace(): Promise<ProjectProfile> {
  const profile: ProjectProfile = {
    hasBackend: false,
    backendStack: null,
    hasDatabase: false,
    frontendStack: null,
    detectedFiles: [],
    lastScanTime: Date.now()
  };

  try {
    // 扫描最多1000个文件，排除node_modules
    const files = await vscode.workspace.findFiles(
      '**/*',
      '**/node_modules/**',
      1000
    );

    const filePaths = files.map(uri => uri.fsPath);
    profile.detectedFiles = filePaths.slice(0, 20); // 只保存前20个文件路径用于调试

    // 检测前端框架
    for (const path of filePaths) {
      const fileName = path.toLowerCase();

      // Vue.js 检测
      if (fileName.endsWith('.vue') || fileName.includes('vue.config') || fileName.includes('vite.config')) {
        profile.frontendStack = 'vue';
        break;
      }

      // React 检测
      if (fileName.endsWith('.jsx') || fileName.endsWith('.tsx') ||
          fileName.includes('react') || fileName.includes('next.config')) {
        profile.frontendStack = 'react';
        break;
      }

      // Angular 检测
      if (fileName.includes('angular.json') || fileName.endsWith('.component.ts') ||
          fileName.includes('@angular')) {
        profile.frontendStack = 'angular';
        break;
      }

      // Svelte 检测
      if (fileName.endsWith('.svelte') || fileName.includes('svelte.config')) {
        profile.frontendStack = 'svelte';
        break;
      }
    }

    // 检测后端技术栈
    for (const path of filePaths) {
      const fileName = path.toLowerCase();

      // PHP 检测
      if (fileName.endsWith('.php') || fileName.includes('composer.json')) {
        profile.hasBackend = true;
        profile.backendStack = 'php';
        break;
      }

      // Node.js 检测 (排除纯前端项目)
      if ((fileName.includes('server.js') || fileName.includes('app.js') ||
           fileName.includes('express') || fileName.includes('/api/') ||
           fileName.includes('/routes/')) && !fileName.includes('node_modules')) {
        profile.hasBackend = true;
        profile.backendStack = 'node';
        break;
      }

      // Go 检测
      if (fileName.endsWith('.go') || fileName.includes('go.mod')) {
        profile.hasBackend = true;
        profile.backendStack = 'go';
        break;
      }

      // Python 检测
      if (fileName.includes('django') || fileName.includes('flask') ||
          fileName.includes('fastapi') || fileName.includes('requirements.txt')) {
        profile.hasBackend = true;
        profile.backendStack = 'python';
        break;
      }

      // Java 检测
      if (fileName.endsWith('.java') || fileName.includes('pom.xml') ||
          fileName.includes('build.gradle')) {
        profile.hasBackend = true;
        profile.backendStack = 'java';
        break;
      }

      // C# 检测
      if (fileName.endsWith('.cs') || fileName.endsWith('.csproj') ||
          fileName.includes('.sln')) {
        profile.hasBackend = true;
        profile.backendStack = 'csharp';
        break;
      }
    }

    // 检测数据库相关文件
    for (const path of filePaths) {
      const fileName = path.toLowerCase();

      if (fileName.includes('/sql/') || fileName.includes('/migrations/') ||
          fileName.includes('.sql') || fileName.includes('.prisma') ||
          fileName.includes('.entity.') || fileName.includes('sequelize') ||
          fileName.includes('typeorm') || fileName.includes('mongoose') ||
          fileName.includes('database') || fileName.includes('schema')) {
        profile.hasDatabase = true;
        break;
      }
    }

    // 规则：如果没有检测到后端，强制设置数据库为false
    if (!profile.hasBackend) {
      profile.hasDatabase = false;
    }

    // 如果没有检测到特定前端框架，设置为vanilla
    if (!profile.frontendStack && filePaths.some(p =>
        p.toLowerCase().endsWith('.html') || p.toLowerCase().endsWith('.js'))) {
      profile.frontendStack = 'vanilla';
    }

  } catch (error) {
    console.error('工作区分析失败:', error);
  }

  return profile;
}

// ============ 项目画像缓存管理 ============
async function getProjectProfile(): Promise<ProjectProfile> {
  // 检查配置是否启用项目检测
  const cfg = vscode.workspace.getConfiguration('enhancePrompt');
  const detectEnabled = cfg.get<boolean>('detectProjectProfile') ?? true;

  if (!detectEnabled) {
    // 如果禁用检测，返回默认画像（全栈项目）
    return {
      hasBackend: true,
      backendStack: null,
      hasDatabase: true,
      frontendStack: null,
      detectedFiles: [],
      lastScanTime: Date.now()
    };
  }

  // 如果有缓存且不超过5分钟，直接返回
  if (cachedProjectProfile &&
      (Date.now() - cachedProjectProfile.lastScanTime) < 5 * 60 * 1000) {
    return cachedProjectProfile;
  }

  // 执行新的扫描
  console.log('开始分析工作区项目结构...');
  cachedProjectProfile = await analyzeWorkspace();

  // 输出调试信息
  console.log('项目画像分析完成:', {
    hasBackend: cachedProjectProfile.hasBackend,
    backendStack: cachedProjectProfile.backendStack,
    hasDatabase: cachedProjectProfile.hasDatabase,
    frontendStack: cachedProjectProfile.frontendStack,
    fileCount: cachedProjectProfile.detectedFiles.length
  });

  return cachedProjectProfile;
}

// 生成项目上下文提示
function generateContextHint(profile: ProjectProfile): string {
  const parts: string[] = [];

  if (profile.frontendStack) {
    const frontendNames = {
      vue: 'Vue.js',
      react: 'React',
      angular: 'Angular',
      svelte: 'Svelte',
      vanilla: 'HTML/CSS/JS'
    };
    parts.push(`前端采用 ${frontendNames[profile.frontendStack]}`);
  }

  if (profile.hasBackend && profile.backendStack) {
    const backendNames = {
      php: 'PHP',
      node: 'Node.js',
      go: 'Go',
      python: 'Python',
      java: 'Java',
      csharp: 'C#'
    };
    parts.push(`后端采用 ${backendNames[profile.backendStack]}`);
  }

  if (profile.hasDatabase) {
    parts.push('包含数据库层');
  }

  if (parts.length === 0) {
    return '';
  }

  return `项目画像：${parts.join('；')}；请据此只输出可行的实现方案，不要提出项目中不存在层面的修改建议。\n\n`;
}

// ============ 新增：Webview View Provider ============
class EnhanceViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'enhancePrompt.view';

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView
  ): void | Thenable<void> {
    webviewView.webview.options = {
      enableScripts: true
    };

    webviewView.webview.html = this.getHtml();

    // 接收前端消息
    webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === 'enhance') {
        const enhanced = await enhanceText(msg.payload);
        // 把结果发回前端
        webviewView.webview.postMessage({
          type: 'result',
          payload: enhanced
        });
      }
    });
  }

  private getHtml(): string {
    // 最简单的 HTML，无框架依赖
    return /* html */ `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    body { font-family: var(--vscode-font-family); padding: 8px; }
    textarea { width: 100%; height: 120px; }
    button { margin-top: 8px; }
    pre { background: #1e1e1e; padding: 6px; white-space: pre-wrap; color: #dcdcdc; }
  </style>
</head>
<body>
  <h3>原始描述</h3>
  <textarea id="input"></textarea>
  <button id="run">✨ Enhance</button>
  <h3>增强结果</h3>
  <pre id="output"></pre>

  <script>
    const vscode = acquireVsCodeApi();
    document.getElementById('run').onclick = () => {
      const text = document.getElementById('input').value;
      vscode.postMessage({ type: 'enhance', payload: text });
    };
    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.type === 'result') {
        document.getElementById('output').textContent = msg.payload;
      }
    });
  </script>
</body>
</html>`;
  }
}

// ============ 现有 enhanceText 方法抽出来，供命令 & Webview 共用 ============
async function enhanceText(rawText: string): Promise<string> {
  const cfg = vscode.workspace.getConfiguration('enhancePrompt');
  const apiKey = (cfg.get<string>('deepseekApiKey') || process.env.DEEPSEEK_API_KEY || '').trim();
  if (!apiKey) {
    vscode.window.showErrorMessage('缺少 DeepSeek API Key');
    return '';
  }

  // 获取项目画像并生成上下文提示
  const profile = await getProjectProfile();
  const contextHint = generateContextHint(profile);

  const systemPrompt = '你是一名资深需求分析师，请将给出的原始“口语化”需求增强为结构化、Markdown 格式的开发任务说明。';
  const userPrompt = `${contextHint}<<<原始描述>>>\n${rawText}\n<<<输出要求>>> \n1. 先用一句话概括改动范围；\n2. 按模块添加二级标题；\n3. 每点以“**动作**：原因/目的”书写；\n4. 删除项说明原因；\n5. 结尾追加“技术实现要求”；\n请按 Markdown 输出。`;

  const body = {
    model: cfg.get<string>('model') || 'deepseek-chat',
    temperature: cfg.get<number>('temperature') ?? 0.2,
    stream: false,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]
  };

  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  const json = await res.json() as { choices: { message: { content: string } }[] };
  return json.choices[0].message.content.trim();
}

// ================= activation =================
export function activate(context: vscode.ExtensionContext) {
  // 初始化项目画像（异步执行，不阻塞激活）
  getProjectProfile().then(profile => {
    console.log('扩展激活完成，项目画像已缓存:', {
      hasBackend: profile.hasBackend,
      backendStack: profile.backendStack,
      hasDatabase: profile.hasDatabase,
      frontendStack: profile.frontendStack
    });
  }).catch(error => {
    console.error('项目画像初始化失败:', error);
  });

  // 注册侧边栏视图
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      EnhanceViewProvider.viewId,
      new EnhanceViewProvider(context)
    )
  );

  // 原来的命令仍保留
  const cmd = vscode.commands.registerCommand('enhancePrompt.enhance', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const sel = editor.selection;
    const raw = editor.document.getText(sel) || editor.document.getText();
    const enhanced = await enhanceText(raw);
    if (!enhanced) return;

    editor.edit(b => {
      if (sel.isEmpty) {
        // 替整为整文替换
        b.replace(new vscode.Range(0, 0, editor.document.lineCount, 0), enhanced);
      } else {
        b.replace(sel, enhanced);
      }
    });
  });

  context.subscriptions.push(cmd);
}

export function deactivate() {}
