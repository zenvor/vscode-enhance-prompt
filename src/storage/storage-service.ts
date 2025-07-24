/**
 * 存储服务类
 * 提供统一的存储管理接口，封装所有存储操作
 */

import * as vscode from 'vscode'
import { 
	ApiConfiguration, 
	getApiConfiguration, 
	updateApiConfiguration, 
	validateApiKey, 
	maskApiKey, 
	resetAllState,
	storeSecret,
	getSecret
} from './state'
import { SecretKey, SupportedModel, DEFAULT_CONFIG } from './state-keys'

/**
 * 存储服务单例类
 */
export class StorageService {
	private static instance: StorageService | null = null
	private context: vscode.ExtensionContext

	private constructor(context: vscode.ExtensionContext) {
		this.context = context
	}

	/**
	 * 获取存储服务实例
	 * @param context VSCode 扩展上下文
	 * @returns 存储服务实例
	 */
	public static getInstance(context: vscode.ExtensionContext): StorageService {
		if (!StorageService.instance) {
			StorageService.instance = new StorageService(context)
		}
		return StorageService.instance
	}

	/**
	 * 设置 DeepSeek API Key
	 * @param apiKey API Key
	 * @returns 是否设置成功
	 */
	public async setApiKey(apiKey: string): Promise<boolean> {
		try {
			// 验证 API Key 有效性
			const isValid = await validateApiKey(apiKey)
			if (!isValid) {
				throw new Error('Invalid API Key')
			}

			await storeSecret(this.context, "deepSeekApiKey", apiKey)
			return true
		} catch (error) {
			console.error('Failed to set API Key:', error)
			return false
		}
	}

	/**
	 * 获取 DeepSeek API Key
	 * @returns API Key 或 undefined
	 */
	public async getApiKey(): Promise<string | undefined> {
		return await getSecret(this.context, "deepSeekApiKey")
	}

	/**
	 * 删除 API Key
	 */
	public async removeApiKey(): Promise<void> {
		await storeSecret(this.context, "deepSeekApiKey", undefined)
	}

	/**
	 * 检查是否已配置 API Key
	 * @returns 是否已配置
	 */
	public async hasApiKey(): Promise<boolean> {
		const apiKey = await this.getApiKey()
		return !!apiKey && apiKey.trim().length > 0
	}

	/**
	 * 获取掩码后的 API Key（用于显示）
	 * @returns 掩码后的 API Key
	 */
	public async getMaskedApiKey(): Promise<string> {
		const apiKey = await this.getApiKey()
		return apiKey ? maskApiKey(apiKey) : ''
	}

	/**
	 * 测试 API Key 有效性
	 * @param apiKey 可选的 API Key，如果不提供则使用已存储的
	 * @returns 是否有效
	 */
	public async testApiKey(apiKey?: string): Promise<boolean> {
		const keyToTest = apiKey || await this.getApiKey()
		if (!keyToTest) {
			return false
		}
		return await validateApiKey(keyToTest)
	}

	/**
	 * 获取完整的 API 配置
	 * @returns API 配置对象
	 */
	public async getConfiguration(): Promise<ApiConfiguration> {
		return await getApiConfiguration(this.context)
	}

	/**
	 * 更新 API 配置
	 * @param config 新的配置
	 */
	public async updateConfiguration(config: ApiConfiguration): Promise<void> {
		await updateApiConfiguration(this.context, config)
	}

	/**
	 * 获取用于 UI 显示的配置信息
	 * @returns 显示用的配置信息
	 */
	public async getDisplayConfiguration(): Promise<{
		hasApiKey: boolean
		apiKeyMasked: string
		model: SupportedModel
		temperature: number
	}> {
		const config = await this.getConfiguration()
		const hasApiKey = await this.hasApiKey()
		const apiKeyMasked = await this.getMaskedApiKey()

		return {
			hasApiKey,
			apiKeyMasked,
			model: config.model || DEFAULT_CONFIG.model,
			temperature: config.temperature ?? DEFAULT_CONFIG.temperature
		}
	}

	/**
	 * 重置所有配置
	 */
	public async resetAll(): Promise<void> {
		await resetAllState(this.context)
	}

	/**
	 * 设置认证随机数（用于安全验证）
	 * @param nonce 随机数
	 */
	public async setAuthNonce(nonce: string): Promise<void> {
		await storeSecret(this.context, "authNonce", nonce)
	}

	/**
	 * 获取认证随机数
	 * @returns 随机数或 undefined
	 */
	public async getAuthNonce(): Promise<string | undefined> {
		return await getSecret(this.context, "authNonce")
	}

	/**
	 * 清除认证随机数
	 */
	public async clearAuthNonce(): Promise<void> {
		await storeSecret(this.context, "authNonce", undefined)
	}

	/**
	 * 监听 Secrets 变化
	 * 用于跨窗口同步
	 * @param callback 变化回调函数
	 * @returns 取消监听的函数
	 */
	public onSecretsChange(callback: (key: string) => void): vscode.Disposable {
		return this.context.secrets.onDidChange((event) => {
			callback(event.key)
		})
	}

	/**
	 * 销毁服务实例
	 */
	public static dispose(): void {
		StorageService.instance = null
	}
}

/**
 * 存储事件类型
 */
export enum StorageEventType {
	API_KEY_CHANGED = 'apiKeyChanged',
	CONFIG_CHANGED = 'configChanged',
	RESET = 'reset'
}

/**
 * 存储事件接口
 */
export interface StorageEvent {
	type: StorageEventType
	data?: any
}

/**
 * 存储事件管理器
 */
export class StorageEventManager {
	private static instance: StorageEventManager | null = null
	private listeners: Map<StorageEventType, Set<(event: StorageEvent) => void>> = new Map()

	private constructor() {}

	public static getInstance(): StorageEventManager {
		if (!StorageEventManager.instance) {
			StorageEventManager.instance = new StorageEventManager()
		}
		return StorageEventManager.instance
	}

	/**
	 * 添加事件监听器
	 * @param type 事件类型
	 * @param listener 监听器函数
	 */
	public addEventListener(type: StorageEventType, listener: (event: StorageEvent) => void): void {
		if (!this.listeners.has(type)) {
			this.listeners.set(type, new Set())
		}
		this.listeners.get(type)!.add(listener)
	}

	/**
	 * 移除事件监听器
	 * @param type 事件类型
	 * @param listener 监听器函数
	 */
	public removeEventListener(type: StorageEventType, listener: (event: StorageEvent) => void): void {
		const listeners = this.listeners.get(type)
		if (listeners) {
			listeners.delete(listener)
		}
	}

	/**
	 * 触发事件
	 * @param event 事件对象
	 */
	public dispatchEvent(event: StorageEvent): void {
		const listeners = this.listeners.get(event.type)
		if (listeners) {
			listeners.forEach(listener => {
				try {
					listener(event)
				} catch (error) {
					console.error('Storage event listener error:', error)
				}
			})
		}
	}

	/**
	 * 销毁事件管理器
	 */
	public static dispose(): void {
		if (StorageEventManager.instance) {
			StorageEventManager.instance.listeners.clear()
			StorageEventManager.instance = null
		}
	}
}
