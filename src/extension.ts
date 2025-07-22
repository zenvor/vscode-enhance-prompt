import * as vscode from 'vscode'
import * as fs from 'fs'
import fetch from 'node-fetch'

/* ---------- Webview Provider ---------- */
class ClarifyViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'enhancePrompt.view'

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(view: vscode.WebviewView) {
    view.webview.options = { enableScripts: true }
    view.webview.html = this.getHtmlContent(view)

    // 收发消息
    view.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type !== 'clarify') return
      const result = await clarifyText(msg.payload)
      view.webview.postMessage({ type: 'result', payload: result })
    })
  }

  /** 读取 media/clarify.html 并返回 HTML 字符串 */
  private getHtmlContent(view: vscode.WebviewView): string {
    const htmlUri = vscode.Uri.joinPath(this.extensionUri, 'media', 'clarify.html')
    let html = fs.readFileSync(htmlUri.fsPath, 'utf8')

    // 处理 SVG 资源 URI
    const sparklesUri = view.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'sparkles-outline.svg')
    )

    // 替换 HTML 中的 SVG 路径
    html = html.replace(/media\/sparkles-outline\.svg/g, sparklesUri.toString())

    return html
  }
}

/* ---------- Clarify 核心 ---------- */
async function clarifyText(raw: string): Promise<string> {
  const cfg = vscode.workspace.getConfiguration('enhancePrompt')
  const apiKey = (cfg.get<string>('deepseekApiKey') || process.env.DEEPSEEK_API_KEY || '').trim()

  if (!apiKey) {
    vscode.window.showErrorMessage('缺少 DeepSeek API Key')
    return ''
  }

  const systemPrompt = `
你是一名需求梳理专家，只需将口语化描述整理为逻辑清晰的条目，
**禁止**添加任何项目中未提及的文件、技术细节或数据库改动。
输出格式：
## 改动目标
<一句话说明>
## 待办事项
1. **动作**：原因
2. ...
## 备注
<如无可留空>`.trim()

  const body = {
    model: cfg.get<string>('model') || 'deepseek-chat',
    temperature: cfg.get<number>('temperature') ?? 0.2,
    stream: false,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: raw.trim() },
    ],
  }

  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  const json = (await res.json()) as { choices: { message: { content: string } }[] }
  return json.choices[0].message.content.trim()
}

/* ---------- Activate / Deactivate ---------- */
export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ClarifyViewProvider.viewId, new ClarifyViewProvider(context.extensionUri))
  )
}

export function deactivate() {}
