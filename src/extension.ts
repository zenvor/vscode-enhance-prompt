import * as vscode from 'vscode';
import fetch from 'node-fetch';

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

  const systemPrompt = '你是一名资深需求分析师，请将给出的原始“口语化”需求增强为结构化、Markdown 格式的开发任务说明。';
  const userPrompt = `<<<原始描述>>>\n${rawText}\n<<<输出要求>>> \n1. 先用一句话概括改动范围；\n2. 按模块添加二级标题；\n3. 每点以“**动作**：原因/目的”书写；\n4. 删除项说明原因；\n5. 结尾追加“技术实现要求”；\n请按 Markdown 输出。`;

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
