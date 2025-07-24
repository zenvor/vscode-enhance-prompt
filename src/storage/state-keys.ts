/**
 * 定义所有支持的 Secret Key 类型
 * 基于 Cline 的设计，但简化为只支持 DeepSeek API Key
 */

export type SecretKey = 
	| "deepSeekApiKey"           // DeepSeek API Key
	| "authNonce"                // 认证随机数（用于安全验证）

/**
 * 全局状态键定义
 */
export type GlobalStateKey = 
	| "model"                    // DeepSeek 模型名称
	| "temperature"              // 生成温度
	| "lastUsedTimestamp"        // 最后使用时间戳
	| "extensionVersion"         // 扩展版本号

/**
 * 工作区状态键定义
 */
export type WorkspaceStateKey = 
	| "lastPrompt"               // 最后使用的提示词
	| "enhanceHistory"           // 增强历史记录

/**
 * 默认配置值
 */
export const DEFAULT_CONFIG = {
	model: "deepseek-chat",
	temperature: 0.2,
} as const

/**
 * 支持的 DeepSeek 模型列表
 */
export const SUPPORTED_MODELS = [
	"deepseek-chat",
	"deepseek-reasoner",
	"deepseek-coder",
] as const

export type SupportedModel = typeof SUPPORTED_MODELS[number]
