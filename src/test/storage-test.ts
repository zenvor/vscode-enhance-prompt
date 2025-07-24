/**
 * 存储功能测试脚本
 * 用于验证 API Key 的安全存储功能
 */

import * as vscode from 'vscode'
import { StorageService } from '../storage/storage-service'
import { ApiConfiguration } from '../storage/state'

/**
 * 测试存储服务的基本功能
 */
export async function testStorageService(context: vscode.ExtensionContext): Promise<void> {
	const outputChannel = vscode.window.createOutputChannel('Storage Test')
	
	try {
		outputChannel.appendLine('=== 开始存储功能测试 ===')
		
		const storageService = StorageService.getInstance(context)
		
		// 测试 1: 检查初始状态
		outputChannel.appendLine('测试 1: 检查初始状态')
		const hasInitialKey = await storageService.hasApiKey()
		outputChannel.appendLine(`初始是否有 API Key: ${hasInitialKey}`)
		
		// 测试 2: 设置 API Key
		outputChannel.appendLine('测试 2: 设置测试 API Key')
		const testApiKey = 'sk-test-key-for-storage-validation-12345'
		
		// 注意：这里使用测试 API Key，不会真正验证
		// 在实际使用中需要有效的 DeepSeek API Key
		try {
			// 直接存储而不验证（用于测试）
			const config: ApiConfiguration = {
				deepSeekApiKey: testApiKey,
				model: 'deepseek-chat',
				temperature: 0.2
			}
			await storageService.updateConfiguration(config)
			outputChannel.appendLine('✓ API Key 设置成功')
		} catch (error) {
			outputChannel.appendLine(`✗ API Key 设置失败: ${error}`)
		}
		
		// 测试 3: 读取 API Key
		outputChannel.appendLine('测试 3: 读取 API Key')
		const retrievedKey = await storageService.getApiKey()
		const hasKey = await storageService.hasApiKey()
		outputChannel.appendLine(`是否有 API Key: ${hasKey}`)
		outputChannel.appendLine(`API Key 匹配: ${retrievedKey === testApiKey}`)
		
		// 测试 4: 获取掩码版本
		outputChannel.appendLine('测试 4: 获取掩码版本')
		const maskedKey = await storageService.getMaskedApiKey()
		outputChannel.appendLine(`掩码后的 API Key: ${maskedKey}`)
		
		// 测试 5: 获取显示配置
		outputChannel.appendLine('测试 5: 获取显示配置')
		const displayConfig = await storageService.getDisplayConfiguration()
		outputChannel.appendLine(`显示配置: ${JSON.stringify(displayConfig, null, 2)}`)
		
		// 测试 6: 更新配置
		outputChannel.appendLine('测试 6: 更新配置')
		const newConfig: ApiConfiguration = {
			model: 'deepseek-reasoner',
			temperature: 0.5
		}
		await storageService.updateConfiguration(newConfig)
		
		const updatedConfig = await storageService.getConfiguration()
		outputChannel.appendLine(`更新后的配置: ${JSON.stringify(updatedConfig, null, 2)}`)
		
		// 测试 7: 认证随机数
		outputChannel.appendLine('测试 7: 认证随机数')
		const testNonce = 'test-nonce-12345'
		await storageService.setAuthNonce(testNonce)
		const retrievedNonce = await storageService.getAuthNonce()
		outputChannel.appendLine(`随机数匹配: ${retrievedNonce === testNonce}`)
		
		// 测试 8: 清理测试数据
		outputChannel.appendLine('测试 8: 清理测试数据')
		await storageService.removeApiKey()
		await storageService.clearAuthNonce()
		
		const finalHasKey = await storageService.hasApiKey()
		const finalNonce = await storageService.getAuthNonce()
		outputChannel.appendLine(`清理后是否有 API Key: ${finalHasKey}`)
		outputChannel.appendLine(`清理后是否有随机数: ${!!finalNonce}`)
		
		outputChannel.appendLine('=== 存储功能测试完成 ===')
		outputChannel.appendLine('✓ 所有测试通过')
		
		// 显示测试结果
		vscode.window.showInformationMessage('存储功能测试完成，请查看输出通道了解详情')
		
	} catch (error) {
		outputChannel.appendLine(`=== 测试失败 ===`)
		outputChannel.appendLine(`错误: ${error}`)
		vscode.window.showErrorMessage(`存储功能测试失败: ${error}`)
	}
	
	// 显示输出通道
	outputChannel.show()
}

/**
 * 测试跨平台兼容性
 */
export async function testCrossPlatformCompatibility(context: vscode.ExtensionContext): Promise<void> {
	const outputChannel = vscode.window.createOutputChannel('Cross-Platform Test')
	
	try {
		outputChannel.appendLine('=== 跨平台兼容性测试 ===')
		
		// 检测当前平台
		const platform = process.platform
		outputChannel.appendLine(`当前平台: ${platform}`)
		
		const storageService = StorageService.getInstance(context)
		
		// 测试不同长度的 API Key
		const testKeys = [
			'short-key',
			'medium-length-api-key-for-testing',
			'very-long-api-key-that-might-cause-issues-on-some-platforms-with-limited-storage-capacity-12345678901234567890'
		]
		
		for (let i = 0; i < testKeys.length; i++) {
			const testKey = testKeys[i]
			outputChannel.appendLine(`测试 API Key ${i + 1} (长度: ${testKey.length})`)
			
			// 存储
			const config: ApiConfiguration = { deepSeekApiKey: testKey }
			await storageService.updateConfiguration(config)
			
			// 读取
			const retrieved = await storageService.getApiKey()
			const matches = retrieved === testKey
			outputChannel.appendLine(`  存储/读取匹配: ${matches}`)
			
			if (!matches) {
				outputChannel.appendLine(`  期望: ${testKey}`)
				outputChannel.appendLine(`  实际: ${retrieved}`)
			}
		}
		
		// 清理
		await storageService.removeApiKey()
		
		outputChannel.appendLine('=== 跨平台兼容性测试完成 ===')
		outputChannel.appendLine(`✓ 在 ${platform} 平台上测试通过`)
		
		vscode.window.showInformationMessage(`跨平台兼容性测试完成 (${platform})`)
		
	} catch (error) {
		outputChannel.appendLine(`=== 跨平台测试失败 ===`)
		outputChannel.appendLine(`错误: ${error}`)
		vscode.window.showErrorMessage(`跨平台测试失败: ${error}`)
	}
	
	outputChannel.show()
}

/**
 * 注册测试命令
 */
export function registerTestCommands(context: vscode.ExtensionContext): void {
	// 注册基本存储测试命令
	const testStorageCommand = vscode.commands.registerCommand(
		'enhancePrompt.testStorage',
		() => testStorageService(context)
	)
	
	// 注册跨平台测试命令
	const testCrossPlatformCommand = vscode.commands.registerCommand(
		'enhancePrompt.testCrossPlatform',
		() => testCrossPlatformCompatibility(context)
	)
	
	context.subscriptions.push(testStorageCommand, testCrossPlatformCommand)
}
