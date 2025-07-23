import * as vscode from 'vscode'
import * as fs from 'fs'
import fetch from 'node-fetch'
import { randomUUID } from 'crypto'

/* ---------- Base WebView Provider ---------- */
abstract class BaseWebviewProvider {
  private static activeInstances: Set<BaseWebviewProvider> = new Set()
  private static clientIdMap = new Map<BaseWebviewProvider, string>()

  protected webview?: vscode.WebviewView
  protected readonly clientId: string
  private isDisposed = false

  constructor(
    protected readonly context: vscode.ExtensionContext,
    protected readonly outputChannel?: vscode.OutputChannel
  ) {
    BaseWebviewProvider.activeInstances.add(this)
    this.clientId = randomUUID()
    BaseWebviewProvider.clientIdMap.set(this, this.clientId)
  }

  protected abstract getHtmlContent(): string
  protected abstract handleMessage(message: any): Promise<void>

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.webview = webviewView

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    }

    webviewView.webview.html = this.getHtmlContent()

    // 消息处理
    webviewView.webview.onDidReceiveMessage(async (message) => {
      try {
        await this.handleMessage(message)
      } catch (error) {
        console.error('WebView message handling error:', error)
        this.outputChannel?.appendLine(`WebView error: ${error}`)
      }
    })

    // 清理处理
    webviewView.onDidDispose(() => {
      this.dispose()
    })
  }

  protected postMessageToWebview(message: any): void {
    if (this.webview && !this.isDisposed) {
      this.webview.webview.postMessage(message)
    }
  }

  protected getNonce(): string {
    let text = ''
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length))
    }
    return text
  }

  public dispose(): void {
    if (!this.isDisposed) {
      this.isDisposed = true
      BaseWebviewProvider.activeInstances.delete(this)
      BaseWebviewProvider.clientIdMap.delete(this)
    }
  }

  public static getActiveInstances(): Set<BaseWebviewProvider> {
    return new Set(BaseWebviewProvider.activeInstances)
  }
}

/* ---------- Clarify WebView Provider ---------- */
class ClarifyViewProvider extends BaseWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'enhancePrompt.view'

  constructor(context: vscode.ExtensionContext, outputChannel?: vscode.OutputChannel) {
    super(context, outputChannel)
  }

  protected getHtmlContent(): string {
    const nonce = this.getNonce()
    const isDevelopment = this.context.extensionMode === vscode.ExtensionMode.Development

    // 统一使用优化版本的 HTML 模板
    const htmlFileName = 'clarify-optimized.html'

    // 读取 HTML 模板
    const htmlUri = vscode.Uri.joinPath(this.context.extensionUri, 'media', htmlFileName)
    let html = fs.readFileSync(htmlUri.fsPath, 'utf8')

    // 生成资源 URI
    const stylesUri = this.webview!.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'styles.css')
    )
    const sparklesUri = this.webview!.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'sparkles-outline.svg')
    )

    // 准备配置对象
    const config = {
      extensionMode: this.context.extensionMode,
      isDevelopment,
      version: this.context.extension.packageJSON.version,
      timestamp: Date.now(),
      clientId: this.clientId
    }

    // 替换模板变量
    html = html
      .replace(/\{\{NONCE\}\}/g, nonce)
      .replace(/\{\{CLIENT_ID\}\}/g, this.clientId)
      .replace(/\{\{CONFIG\}\}/g, JSON.stringify(config))
      .replace(/\{\{STYLES_URI\}\}/g, stylesUri.toString())
      .replace(/\{\{SPARKLES_URI\}\}/g, sparklesUri.toString())

    // 开发模式日志
    if (isDevelopment) {
      this.outputChannel?.appendLine(`[DEV] Generated HTML for client ${this.clientId}`)
      this.outputChannel?.appendLine(`[DEV] Using unified template: ${htmlFileName}`)
      this.outputChannel?.appendLine(`[DEV] Config: ${JSON.stringify(config, null, 2)}`)
    }

    return html
  }

  protected async handleMessage(message: any): Promise<void> {
    const { type, payload, clientId } = message

    // 验证客户端ID（可选的安全检查）
    if (clientId && clientId !== this.clientId) {
      this.outputChannel?.appendLine(`Warning: Client ID mismatch. Expected: ${this.clientId}, Received: ${clientId}`)
    }

    switch (type) {
      case 'clarify':
        try {
          this.outputChannel?.appendLine(`Processing clarify request: ${payload?.substring(0, 100)}...`)
          const result = await clarifyText(payload)
          this.postMessageToWebview({
            type: 'result',
            payload: result,
            timestamp: Date.now()
          })
        } catch (error) {
          this.outputChannel?.appendLine(`Clarify error: ${error}`)
          this.postMessageToWebview({
            type: 'result',
            error: error instanceof Error ? error.message : String(error),
            timestamp: Date.now()
          })
        }
        break

      case 'ready':
        // WebView 已准备就绪，可以发送初始化数据
        this.outputChannel?.appendLine('WebView ready signal received')
        this.postMessageToWebview({
          type: 'init',
          config: {
            version: this.context.extension.packageJSON.version,
            extensionMode: this.context.extensionMode
          }
        })
        break

      default:
        this.outputChannel?.appendLine(`Unknown message type: ${type}`)
    }
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
  // 创建输出通道用于调试
  const outputChannel = vscode.window.createOutputChannel('Enhance Prompt')

  // 注册 WebView Provider，启用上下文保留
  const provider = new ClarifyViewProvider(context, outputChannel)
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ClarifyViewProvider.viewId, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  )

  // 清理资源
  context.subscriptions.push(provider)
}

export function deactivate() {}
