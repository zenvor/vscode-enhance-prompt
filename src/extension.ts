import * as vscode from 'vscode'
import * as fs from 'fs'
import fetch from 'node-fetch'
import { randomUUID } from 'crypto'
import { StorageService, StorageEventManager, StorageEventType } from './storage/storage-service'
import { ApiConfiguration } from './storage/state'
import { DEFAULT_CONFIG } from './storage/state-keys'

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
  private storageService: StorageService

  constructor(context: vscode.ExtensionContext, outputChannel?: vscode.OutputChannel) {
    super(context, outputChannel)
    this.storageService = StorageService.getInstance(context)
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
      clientId: this.clientId,
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
          const result = await clarifyText(payload, this.context)
          this.postMessageToWebview({
            type: 'result',
            payload: result,
            timestamp: Date.now(),
          })
        } catch (error) {
          this.outputChannel?.appendLine(`Clarify error: ${error}`)
          this.postMessageToWebview({
            type: 'result',
            error: error instanceof Error ? error.message : String(error),
            timestamp: Date.now(),
          })
        }
        break

      case 'saveConfig':
        try {
          this.outputChannel?.appendLine('Processing save config request')
          const { apiKey, model } = payload
          await this.saveConfig(apiKey, model)
          this.postMessageToWebview({
            type: 'configSaved',
            success: true,
            timestamp: Date.now(),
          })
        } catch (error) {
          this.outputChannel?.appendLine(`Save config error: ${error}`)
          this.postMessageToWebview({
            type: 'configSaved',
            success: false,
            error: error instanceof Error ? error.message : String(error),
            timestamp: Date.now(),
          })
        }
        break

      case 'testConfig':
        try {
          this.outputChannel?.appendLine('Processing test config request')
          const { apiKey } = payload
          const isValid = await this.testApiKey(apiKey)
          this.postMessageToWebview({
            type: 'configTested',
            success: isValid,
            timestamp: Date.now(),
          })
        } catch (error) {
          this.outputChannel?.appendLine(`Test config error: ${error}`)
          this.postMessageToWebview({
            type: 'configTested',
            success: false,
            error: error instanceof Error ? error.message : String(error),
            timestamp: Date.now(),
          })
        }
        break

      case 'getConfig':
        try {
          this.outputChannel?.appendLine('Processing get config request')
          const config = await this.getCurrentConfig()
          this.postMessageToWebview({
            type: 'configData',
            payload: config,
            timestamp: Date.now(),
          })
        } catch (error) {
          this.outputChannel?.appendLine(`Get config error: ${error}`)
          this.postMessageToWebview({
            type: 'configData',
            error: error instanceof Error ? error.message : String(error),
            timestamp: Date.now(),
          })
        }
        break

      case 'openSettings':
        try {
          this.outputChannel?.appendLine('Opening VSCode settings')
          await vscode.commands.executeCommand('workbench.action.openSettings', 'enhancePrompt')
        } catch (error) {
          this.outputChannel?.appendLine(`Open settings error: ${error}`)
        }
        break

      case 'ready':
        // WebView 已准备就绪，可以发送初始化数据
        this.outputChannel?.appendLine('WebView ready signal received')
        this.postMessageToWebview({
          type: 'init',
          config: {
            version: this.context.extension.packageJSON.version,
            extensionMode: this.context.extensionMode,
          },
        })
        break

      default:
        this.outputChannel?.appendLine(`Unknown message type: ${type}`)
    }
  }

  private async saveConfig(apiKey: string, model?: string): Promise<void> {
    const config: ApiConfiguration = {
      deepSeekApiKey: apiKey,
    }

    if (model) {
      config.model = model as any // 类型转换，实际使用时会验证
    }

    await this.storageService.updateConfiguration(config)
  }

  private async testApiKey(apiKey: string): Promise<boolean> {
    return await this.storageService.testApiKey(apiKey)
  }

  private async getCurrentConfig(): Promise<any> {
    return await this.storageService.getDisplayConfiguration()
  }
}

/* ---------- Clarify 核心 ---------- */
async function clarifyText(raw: string, context: vscode.ExtensionContext): Promise<string> {
  const storageService = StorageService.getInstance(context)
  const config = await storageService.getConfiguration()
  const apiKey = config.deepSeekApiKey || process.env.DEEPSEEK_API_KEY || ''

  if (!apiKey.trim()) {
    vscode.window.showErrorMessage('缺少 DeepSeek API Key，请先配置 API Key')
    return ''
  }

  const systemPrompt = `
    你是一名需求梳理专家，将口语化开发需求整理为结构化执行清单。

    **核心原则**：
    - 严格基于用户描述内容，不添加技术方案或实现细节
    - 只整理用户明确提到的需求，不推测或扩展
    - 简洁明了，避免过度分析

    **输出格式**：
    ## 改动目标
    <一句话概括用户的核心需求>

    ## 待办事项
    1. **[动作]** 具体任务：基于原描述的直接理由
    2. ...

    ## 备注
    <仅记录用户提到的重要信息或约束>`.trim()

  const body = {
    model: config.model || DEFAULT_CONFIG.model,
    temperature: config.temperature ?? DEFAULT_CONFIG.temperature,
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

  // 初始化存储服务
  const storageService = StorageService.getInstance(context)

  // 注册 WebView Provider，启用上下文保留
  const provider = new ClarifyViewProvider(context, outputChannel)
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ClarifyViewProvider.viewId, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  )

  // 监听 Secrets 变化，实现跨窗口同步
  context.subscriptions.push(
    context.secrets.onDidChange(async (event) => {
      if (event.key === 'deepSeekApiKey') {
        outputChannel.appendLine(`API Key changed: ${event.key}`)
        // 可以在这里添加跨窗口同步逻辑
        const eventManager = StorageEventManager.getInstance()
        eventManager.dispatchEvent({
          type: StorageEventType.API_KEY_CHANGED,
          data: { key: event.key },
        })
      }
    })
  )

  // 开发模式下注册测试命令
  if (context.extensionMode === vscode.ExtensionMode.Development) {
    const { registerTestCommands } = require('./test/storage-test')
    registerTestCommands(context)
    outputChannel.appendLine('Development mode: Storage test commands registered')
  }

  // 清理资源
  context.subscriptions.push(provider)
}

export function deactivate() {
  // 清理存储服务和事件管理器
  StorageService.dispose()
  StorageEventManager.dispose()
}
