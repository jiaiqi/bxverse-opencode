// packages/core/src/ai.ts
// 可选 AI 日志润色（私有模块）：
// 未启用 / 缺配置时短路返回原文；启用时调用 OpenAI 兼容接口（Node 内置 fetch，零第三方依赖）。
// 产出仍为草稿，绝不直接定稿（R14 人工确认原则）。

import type { AppConfig } from '@bxverse/shared'

const POLISH_TIMEOUT_MS = 30_000
const MAX_TEXT_LENGTH = 200_000

const SYSTEM_PROMPT = [
  '你是版本发布日志编辑助理。用户的输入是一份技术性的「对外更新日志」草稿（可能包含提交明细）。',
  '请改写成面向终端用户的分节发布说明：',
  '- 保留 Markdown 结构与原有分节标题；',
  '- 用简洁、用户可感知的措辞描述变更，去掉纯内部细节（如 commit 哈希、文件路径明细）；',
  '- 不新增不存在的变更，不编造内容；',
  '- 仅输出改写后的日志正文（Markdown），不要解释、不要用代码块包裹。',
].join('\n')

interface ChatCompletionResp {
  choices?: { message?: { content?: string } }[]
}

/**
 * 润色对外日志草稿。
 * - 未启用：返回原文（短路）
 * - 服务不可用 / 超时 / 返回异常：抛错（由调用方呈现，避免静默返回原文误导用户以为已润色）
 */
export async function polishLog(ai: AppConfig['ai'], text: string): Promise<string> {
  if (!ai.enabled || !ai.baseUrl || !ai.model) return text
  if (!text.trim()) return text
  if (text.length > MAX_TEXT_LENGTH) {
    throw new Error(`日志过长（${text.length} 字符，上限 ${MAX_TEXT_LENGTH}），无法润色`)
  }

  const url = `${ai.baseUrl.replace(/\/+$/, '')}/chat/completions`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), POLISH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(ai.apiKey ? { Authorization: `Bearer ${ai.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: ai.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
        temperature: 0.3,
        stream: false,
      }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 200)
      throw new Error(`AI 服务响应异常（${res.status}）：${detail || res.statusText}`)
    }
    const data = (await res.json()) as ChatCompletionResp
    const content = data.choices?.[0]?.message?.content?.trim()
    if (!content) throw new Error('AI 服务未返回有效内容')
    return stripFence(content)
  } finally {
    clearTimeout(timer)
  }
}

/** 去除模型偶发的 ```markdown 代码块包裹 */
function stripFence(s: string): string {
  const m = /^```[a-zA-Z]*\n([\s\S]*?)\n```$/.exec(s.trim())
  return m ? m[1].trim() : s
}
