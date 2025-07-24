/**
 * 安全存储管理模块
 * 基于 Cline 的设计，使用 VSCode Secrets API 进行安全的 API Key 存储
 * 支持 Windows/Mac/Linux 跨平台
 */

import * as vscode from 'vscode'
import { SecretKey, GlobalStateKey, WorkspaceStateKey, DEFAULT_CONFIG, SupportedModel } from './state-keys'

/**
 * 检查是否为临时配置文件模式
 * 在临时模式下，secrets 存储在内存中而不是持久化存储
 */
const isTemporaryProfile = process.env.TEMP_PROFILE === "true"

/**
 * 临时配置文件的内存存储
 * 用于测试环境或临时会话，进程结束后自动清除
 */
const inMemorySecrets = new Map<string, string>()

/**
 * API 配置接口
 */
export interface ApiConfiguration {
	deepSeekApiKey?: string
	model?: SupportedModel
	temperature?: number
}

/**
 * 存储 Secret 到安全存储
 * @param context VSCode 扩展上下文
 * @param key Secret 键名
 * @param value Secret 值，undefined 表示删除
 */
export async function storeSecret(context: vscode.ExtensionContext, key: SecretKey, value?: string): Promise<void> {
	if (isTemporaryProfile) {
		if (value) {
			inMemorySecrets.set(key, value)
		} else {
			inMemorySecrets.delete(key)
		}
		return
	}
	
	if (value) {
		await context.secrets.store(key, value)
	} else {
		await context.secrets.delete(key)
	}
}

/**
 * 从安全存储获取 Secret
 * @param context VSCode 扩展上下文
 * @param key Secret 键名
 * @returns Secret 值或 undefined
 */
export async function getSecret(context: vscode.ExtensionContext, key: SecretKey): Promise<string | undefined> {
	if (isTemporaryProfile) {
		return inMemorySecrets.get(key)
	}
	return await context.secrets.get(key)
}

/**
 * 批量更新 Secrets
 * 优化性能，减少与系统密钥存储的交互次数
 * @param context VSCode 扩展上下文
 * @param updates 要更新的 Secret 键值对
 */
export async function updateSecretsBatch(
	context: vscode.ExtensionContext, 
	updates: Record<string, string | undefined>
): Promise<void> {
	if (isTemporaryProfile) {
		Object.entries(updates).forEach(([key, value]) => {
			if (value) {
				inMemorySecrets.set(key, value)
			} else {
				inMemorySecrets.delete(key)
			}
		})
		return
	}
	
	// 使用 Promise.all 并行执行批量更新
	await Promise.all(
		Object.entries(updates).map(([key, value]) => 
			storeSecret(context, key as SecretKey, value)
		)
	)
}

/**
 * 存储全局状态
 * @param context VSCode 扩展上下文
 * @param key 状态键名
 * @param value 状态值
 */
export async function storeGlobalState(
	context: vscode.ExtensionContext, 
	key: GlobalStateKey, 
	value: any
): Promise<void> {
	await context.globalState.update(key, value)
}

/**
 * 获取全局状态
 * @param context VSCode 扩展上下文
 * @param key 状态键名
 * @param defaultValue 默认值
 * @returns 状态值
 */
export function getGlobalState<T>(
	context: vscode.ExtensionContext, 
	key: GlobalStateKey, 
	defaultValue?: T
): T | undefined {
	return context.globalState.get(key, defaultValue)
}

/**
 * 批量更新全局状态
 * @param context VSCode 扩展上下文
 * @param updates 要更新的状态键值对
 */
export async function updateGlobalStateBatch(
	context: vscode.ExtensionContext, 
	updates: Record<string, any>
): Promise<void> {
	await Promise.all(
		Object.entries(updates).map(([key, value]) => 
			storeGlobalState(context, key as GlobalStateKey, value)
		)
	)
}

/**
 * 获取当前 API 配置
 * @param context VSCode 扩展上下文
 * @returns API 配置对象
 */
export async function getApiConfiguration(context: vscode.ExtensionContext): Promise<ApiConfiguration> {
	const deepSeekApiKey = await getSecret(context, "deepSeekApiKey")
	const model = getGlobalState(context, "model", DEFAULT_CONFIG.model) as SupportedModel
	const temperature = getGlobalState(context, "temperature", DEFAULT_CONFIG.temperature)
	
	return {
		deepSeekApiKey,
		model,
		temperature
	}
}

/**
 * 更新 API 配置
 * 使用批量操作优化性能
 * @param context VSCode 扩展上下文
 * @param apiConfiguration 新的 API 配置
 */
export async function updateApiConfiguration(
	context: vscode.ExtensionContext, 
	apiConfiguration: ApiConfiguration
): Promise<void> {
	const { deepSeekApiKey, model, temperature } = apiConfiguration
	
	// 批量更新 Secrets
	const batchedSecretUpdates: Record<string, string | undefined> = {
		deepSeekApiKey
	}
	
	// 批量更新全局状态
	const batchedGlobalUpdates: Record<string, any> = {}
	if (model !== undefined) {
		batchedGlobalUpdates.model = model
	}
	if (temperature !== undefined) {
		batchedGlobalUpdates.temperature = temperature
	}
	
	// 并行执行批量操作以获得最佳性能
	await Promise.all([
		updateGlobalStateBatch(context, batchedGlobalUpdates),
		updateSecretsBatch(context, batchedSecretUpdates)
	])
}

/**
 * 重置所有状态和 Secrets
 * 用于扩展卸载或重置功能
 * @param context VSCode 扩展上下文
 */
export async function resetAllState(context: vscode.ExtensionContext): Promise<void> {
	// 清除所有全局状态
	for (const key of context.globalState.keys()) {
		await context.globalState.update(key, undefined)
	}
	
	// 清除所有 Secrets
	const secretKeys: SecretKey[] = [
		"deepSeekApiKey",
		"authNonce"
	]
	
	await Promise.all(
		secretKeys.map(key => storeSecret(context, key, undefined))
	)
	
	// 清除临时内存存储
	if (isTemporaryProfile) {
		inMemorySecrets.clear()
	}
}

/**
 * 验证 API Key 是否有效
 * @param apiKey DeepSeek API Key
 * @returns 是否有效
 */
export async function validateApiKey(apiKey: string): Promise<boolean> {
	if (!apiKey || apiKey.trim().length === 0) {
		return false
	}
	
	try {
		const fetch = (await import('node-fetch')).default
		const response = await fetch('https://api.deepseek.com/v1/models', {
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${apiKey}`,
				'Content-Type': 'application/json'
			}
		})
		return response.ok
	} catch (error) {
		console.error('API Key validation error:', error)
		return false
	}
}

/**
 * 获取 API Key 的掩码版本（用于显示）
 * @param apiKey 原始 API Key
 * @returns 掩码后的 API Key，保持原始长度
 */
export function maskApiKey(apiKey: string): string {
	if (!apiKey) return ''
	if (apiKey.length <= 8) return '●'.repeat(apiKey.length)

	const start = apiKey.substring(0, 4)
	const end = apiKey.substring(apiKey.length - 4)
	// 保持原始长度，不压缩中间部分
	const middle = '●'.repeat(apiKey.length - 8)

	return `${start}${middle}${end}`
}
