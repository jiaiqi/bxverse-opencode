// packages/core/src/ai.ts
// 可选 AI 能力（R21 多供应商，OpenAI 兼容）：
// - chatCompletion：基础请求封装（Node 内置 fetch，零第三方依赖，超时/错误归一）
// - polishLog：对外日志润色（产出仍为草稿，绝不直接定稿——R14 人工确认原则）
// - testConnection：最小请求验证 key/模型可用
// 未启用 / 缺凭据时由调用方短路或抛错，绝不静默返回原文误导用户。

import type { AiProvider, CommitType, AiTestResult } from '@bxverse/shared'

const AI_TIMEOUT_MS = 30_000
const MAX_TEXT_LENGTH = 200_000

const POLISH_SYSTEM_PROMPT = [
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

export interface ChatOpts {
  /** 超时毫秒（默认 30s） */
  timeoutMs?: number
  temperature?: number
  maxChars?: number
}

/**
 * 智能 URL 归一化（容错：去除尾部多余斜杠、/chat/completions 后缀、补齐协议与 /v1 等）。
 */
export function normalizeBaseUrl(raw: string): string {
  let s = (raw ?? '').trim()
  if (!s) return ''
  // 补全 http/https 协议
  if (!/^https?:\/\//i.test(s)) {
    if (/^(localhost|127\.0\.0\.1)(:\d+)?/i.test(s)) {
      s = `http://${s}`
    } else {
      s = `https://${s}`
    }
  }
  // 剥离末尾的 /chat/completions 或 /completions
  s = s.replace(/\/+(?:chat\/)?completions(?:\/.*)?$/i, '')
  // 去除尾部多余斜杠
  s = s.replace(/\/+$/, '')
  return s
}

/**
 * OpenAI 兼容 chat/completions 基础调用。
 * 上游失败抛错（含状态与截断响应体）；成功返回 content（去除 ``` 包裹）。
 */
export async function chatCompletion(
  provider: { baseUrl: string; model: string; name?: string },
  apiKey: string,
  system: string,
  user: string,
  opts: ChatOpts = {},
): Promise<string> {
  const timeout = opts.timeoutMs ?? AI_TIMEOUT_MS
  const maxChars = opts.maxChars ?? MAX_TEXT_LENGTH
  const baseUrl = normalizeBaseUrl(provider?.baseUrl)
  if (!baseUrl || !provider.model) throw new Error('AI 供应商 Base URL / 模型未配置')
  if (!apiKey) throw new Error('AI 供应商未设置 API Key')
  if (!user.trim()) throw new Error('输入内容为空')
  if (user.length > maxChars) {
    throw new Error(`输入过长（${user.length} 字符，上限 ${maxChars}），请缩减后重试`)
  }

  const url = `${baseUrl}/chat/completions`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: opts.temperature ?? 0.3,
        stream: false,
      }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 300)
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

/**
 * 在线拉取供应商支持的模型列表（GET /v1/models）。
 * 提取模型 id 并去重排序返回；如不支持则抛出明确错误。
 */
export async function fetchModels(
  provider: { baseUrl: string },
  apiKey?: string,
  opts: { timeoutMs?: number } = {},
): Promise<string[]> {
  const baseUrl = normalizeBaseUrl(provider.baseUrl)
  if (!baseUrl) throw new Error('请先填写 Base URL')
  const url = `${baseUrl}/models`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15_000)
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`
    const res = await fetch(url, { method: 'GET', headers, signal: controller.signal })
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 200)
      throw new Error(`无法获取模型列表（${res.status}）：${detail || res.statusText}`)
    }
    const json = (await res.json()) as { data?: { id?: string }[]; models?: { id?: string }[] }
    const rawList = Array.isArray(json.data) ? json.data : (Array.isArray(json.models) ? json.models : [])
    const ids = Array.from(new Set(rawList.map(m => String(m.id ?? '')).filter(Boolean)))
    ids.sort((a, b) => a.localeCompare(b))
    return ids
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 润色对外日志草稿（按指定供应商）。
 * 失败抛错（由调用方呈现，避免静默返回原文误导用户以为已润色）。
 */
export async function polishLog(provider: AiProvider, apiKey: string, text: string): Promise<string> {
  return chatCompletion(provider, apiKey, POLISH_SYSTEM_PROMPT, text)
}

/** 测试连接：最小 chat 请求验证 key/模型可用并测速，返回延迟毫秒与模型回复 */
export async function testConnection(
  provider: { baseUrl: string; model?: string; name?: string },
  apiKey: string,
): Promise<AiTestResult> {
  const targetModel = provider.model?.trim() || 'deepseek-chat'
  const start = Date.now()
  const reply = await chatCompletion(
    { baseUrl: provider.baseUrl, model: targetModel, name: provider.name },
    apiKey,
    '你是一个连通性测试助手。',
    '请回复：正常',
    { temperature: 0, timeoutMs: 15_000 },
  )
  const latencyMs = Date.now() - start
  return {
    ok: true,
    latencyMs,
    model: targetModel,
    reply,
    providerName: provider.name,
  }
}
/** 去除模型偶发的 ```markdown 代码块包裹 */
function stripFence(s: string): string {
  const m = /^```[a-zA-Z]*\n([\s\S]*?)\n```$/.exec(s.trim())
  return m ? m[1].trim() : s
}

// ========================================================================
// R22：基于已暂存 diff 生成 Conventional Commits 提交信息 / 解读已暂存变更
// 仅在文件已暂存后调用（避免把未追踪噪音一股脑塞进 AI）；diff 由调用方截断
// ========================================================================

const COMMIT_MESSAGE_SYSTEM_PROMPT = [
  '你是 Conventional Commits 提交信息撰写助手。',
  '输入包含：(1) 待提交的文件列表（含状态/新增/修改/删除统计）；(2) 已暂存 diff 文本（可能截断）。',
  '请生成一份能直接使用的提交信息：',
  '- type(scope)?: subject（subject 中文，不超过 60 字，使用动词开头，不加句号）',
  '- body 列 3-6 条 bullet，说明关键变更（中文，面向代码评审者）',
  '- 不编造 diff 中未出现的变更；如 diff 截断请保守表达',
  '- 输出严格 JSON：{"subject":"...","body":"...","type":"feat|fix|perf|refactor|style|docs|test|build|ci|chore|revert|other"}',
  '- 仅输出 JSON，不加任何额外说明',
].join('\n')

const EXPLAIN_DIFF_SYSTEM_PROMPT = [
  '你是代码变更解读助理。',
  '输入包含：文件名 + diff 文本（可能截断）。',
  '请给出对开发者快速评审可用的解读：',
  '- intent：一句话说明变更意图',
  '- keyChanges：3-5 条关键变更要点',
  '- risks：兼容性 / 性能 / 安全 / 用户感知 等潜在风险（无则给空数组）',
  '- 输出严格 JSON：{"intent":"...","keyChanges":["..."],"risks":["..."]}',
  '- 仅输出 JSON',
].join('\n')

/** 提交信息生成（始终使用已暂存内容） */
export async function generateCommitMessage(
  provider: AiProvider,
  apiKey: string,
  payload: { fileSummary: string; diff: string },
): Promise<{ subject: string; body: string; type: CommitType }> {
  const user = `文件变更概览：\n${payload.fileSummary}\n\n已暂存 diff：\n${payload.diff || '(空)'}`
  const raw = await chatCompletion(provider, apiKey, COMMIT_MESSAGE_SYSTEM_PROMPT, user, { temperature: 0.2 })
  const parsed = parseJsonObject(stripFence(raw))
  const type = (parsed.type as CommitType) ?? 'chore'
  return {
    subject: String(parsed.subject ?? '').slice(0, 200),
    body: String(parsed.body ?? '').slice(0, 4000),
    type,
  }
}

/** 变更解读（单文件为佳；多文件时 caller 拼接） */
export async function explainDiff(
  provider: AiProvider,
  apiKey: string,
  payload: { filePath: string; diff: string },
): Promise<{ intent: string; keyChanges: string[]; risks: string[] }> {
  const user = `文件：${payload.filePath}\n\ndiff：\n${payload.diff || '(空)'}`
  const raw = await chatCompletion(provider, apiKey, EXPLAIN_DIFF_SYSTEM_PROMPT, user, { temperature: 0.2 })
  const parsed = parseJsonObject(stripFence(raw))
  return {
    intent: String(parsed.intent ?? '').slice(0, 500),
    keyChanges: Array.isArray(parsed.keyChanges) ? parsed.keyChanges.map(s => String(s)).slice(0, 10) : [],
    risks: Array.isArray(parsed.risks) ? parsed.risks.map(s => String(s)).slice(0, 10) : [],
  }
}

/** 解析模型偶发返回的 JSON 内容（兼容 markdown fence 之外的内容） */
function parseJsonObject(s: string): Record<string, unknown> {
  const t = s.trim()
  try { return JSON.parse(t) as Record<string, unknown> } catch { /* 尝试抽取首段 {...} */ }
  const m = /\{[\s\S]*\}/.exec(t)
  if (m) {
    try { return JSON.parse(m[0]) as Record<string, unknown> } catch { /* 忽略 */ }
  }
  return {}
}
