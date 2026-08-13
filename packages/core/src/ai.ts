// packages/core/src/ai.ts
// 可选 AI 日志润色（私有模块）：未启用时短路返回原文

import type { AppConfig } from '@bxverse/shared'

/**
 * v1 实现：短路返回原文。
 * 后续接入时在 cfg.enabled 且 baseUrl 有效时调用 OpenAI 兼容接口润色，
 * 产出仍为草稿，绝不直接定稿（R14 人工确认原则）。
 */
export async function polishLog(ai: AppConfig['ai'], text: string): Promise<string> {
  if (!ai.enabled || !ai.baseUrl) return text
  return text
}
