// apps/server/src/api/ai.ts
// AI 供应商管理与能力（R21 多供应商，OpenAI 兼容）：
// - providers CRUD（key 经 credential 端点单独设置，write-only 不回显）
// - credential：写入 credentials.json.aiKeys（0600）
// - test：最小 chat 请求验证 key/模型
// - polish：按生效供应商润色（失败 502，绝不静默返回原文）
// 旧单表单配置（ai.baseUrl/model/apiKey）在首次解析时惰性迁移为默认 provider（id 'legacy'）。

import type { AiProvider, AppConfig } from '@bxverse/shared'
import { explainDiff, generateCommitMessage, polishLog, testConnection, store } from '@bxverse/core'
import type { Ctx } from '../http/router'
import { apiError, readJsonBody, sendJson } from '../http/json'

export interface AiServices {
  loadCfg: () => Promise<AppConfig>
  saveCfg: (cfg: AppConfig) => Promise<void>
}

/** 惰性迁移旧单表单配置 → 默认 provider；apiKey 迁入 credentials 后清空 app.json */
export async function ensureLegacyMigration(cfg: AppConfig, services: AiServices): Promise<void> {
  const ai = cfg.ai
  if ((ai.providers?.length ?? 0) > 0 || !ai.baseUrl) return
  const legacy: AiProvider = {
    id: 'legacy',
    name: '默认',
    kind: 'openai-compatible',
    baseUrl: ai.baseUrl,
    model: ai.model,
    enabled: true,
  }
  ai.providers = [legacy]
  ai.activeProviderId = 'legacy'
  if (ai.apiKey) {
    const cred = await store.loadCredentials()
    cred.aiKeys = { ...(cred.aiKeys ?? {}), legacy: ai.apiKey }
    await store.saveCredentials(cred)
    ai.apiKey = ''
  }
  await services.saveCfg(cfg)
}

/** 解析当前生效供应商 */
function activeProvider(cfg: AppConfig): AiProvider | null {
  const providers = cfg.ai.providers ?? []
  if (cfg.ai.activeProviderId) {
    const hit = providers.find(p => p.id === cfg.ai.activeProviderId && p.enabled)
    if (hit) return hit
  }
  return providers.find(p => p.enabled) ?? null
}

async function apiKeyOf(providerId: string): Promise<string> {
  const cred = await store.loadCredentials()
  return (cred.aiKeys ?? {})[providerId] ?? ''
}

function toView(p: AiProvider, hasKey: boolean): AiProvider & { hasKey: boolean } {
  return { ...p, hasKey }
}

function providerOf(cfg: AppConfig, id: string): AiProvider {
  const p = (cfg.ai.providers ?? []).find(x => x.id === id)
  if (!p) throw apiError(404, 'NOT_FOUND', 'AI 供应商不存在')
  return p
}

export function register(router: import('../http/router').Router, services: AiServices): void {
  // ---------- 列表 ----------
  router.get('/api/ai/providers', async (ctx: Ctx) => {
    const cfg = await services.loadCfg()
    await ensureLegacyMigration(cfg, services)
    const cred = await store.loadCredentials()
    const list = (cfg.ai.providers ?? []).map(p => toView(p, !!((cred.aiKeys ?? {})[p.id])))
    sendJson(ctx.res, 200, list)
  })

  // ---------- 新增 ----------
  router.post('/api/ai/providers', async (ctx: Ctx) => {
    const cfg = await services.loadCfg()
    await ensureLegacyMigration(cfg, services)
    const body = (await readJsonBody(ctx.req)) as Record<string, unknown>
    const name = String(body.name ?? '').trim()
    const baseUrl = String(body.baseUrl ?? '').trim()
    const model = String(body.model ?? '').trim()
    const enabled = body.enabled !== false
    if (!name) throw apiError(400, 'VALIDATION', '供应商名称必填')
    if (!baseUrl || !/^https?:\/\//.test(baseUrl)) throw apiError(400, 'VALIDATION', 'Base URL 必须为 http(s) 地址')
    if (!model) throw apiError(400, 'VALIDATION', '模型必填')

    const id = `p_${Math.random().toString(36).slice(2, 10)}`
    const provider: AiProvider = { id, name, kind: 'openai-compatible', baseUrl, model, enabled }
    const providers = cfg.ai.providers ?? []
    cfg.ai.providers = [...providers, provider]
    if (enabled) cfg.ai.activeProviderId = id
    await services.saveCfg(cfg)
    sendJson(ctx.res, 201, toView(provider, false))
  })

  // ---------- 修改 ----------
  router.patch('/api/ai/providers/:id', async (ctx: Ctx) => {
    const cfg = await services.loadCfg()
    await ensureLegacyMigration(cfg, services)
    const p = providerOf(cfg, ctx.params.id)
    const body = (await readJsonBody(ctx.req)) as Record<string, unknown>
    if (typeof body.name === 'string' && body.name.trim()) p.name = body.name.trim()
    if (typeof body.baseUrl === 'string' && body.baseUrl.trim()) {
      if (!/^https?:\/\//.test(body.baseUrl.trim())) throw apiError(400, 'VALIDATION', 'Base URL 必须为 http(s) 地址')
      p.baseUrl = body.baseUrl.trim()
    }
    if (typeof body.model === 'string' && body.model.trim()) p.model = body.model.trim()
    if (body.enabled === true) {
      for (const x of cfg.ai.providers ?? []) x.enabled = x.id === p.id
      cfg.ai.activeProviderId = p.id
    } else if (body.enabled === false && p.id === cfg.ai.activeProviderId) {
      p.enabled = false
      cfg.ai.activeProviderId = ''
    }
    await services.saveCfg(cfg)
    const cred = await store.loadCredentials()
    sendJson(ctx.res, 200, toView(p, !!((cred.aiKeys ?? {})[p.id])))
  })

  // ---------- 删除 ----------
  router.delete('/api/ai/providers/:id', async (ctx: Ctx) => {
    const cfg = await services.loadCfg()
    await ensureLegacyMigration(cfg, services)
    const p = providerOf(cfg, ctx.params.id)
    cfg.ai.providers = (cfg.ai.providers ?? []).filter(x => x.id !== p.id)
    if (cfg.ai.activeProviderId === p.id) cfg.ai.activeProviderId = ''
    await services.saveCfg(cfg)
    const cred = await store.loadCredentials()
    if (cred.aiKeys?.[p.id]) {
      const next = { ...cred.aiKeys }
      delete next[p.id]
      cred.aiKeys = next
      await store.saveCredentials(cred)
    }
    sendJson(ctx.res, 200, { ok: true })
  })

  // ---------- 设置 key（write-only） ----------
  router.put('/api/ai/providers/:id/credential', async (ctx: Ctx) => {
    const cfg = await services.loadCfg()
    await ensureLegacyMigration(cfg, services)
    providerOf(cfg, ctx.params.id)
    const body = (await readJsonBody(ctx.req)) as Record<string, unknown>
    const apiKey = String(body.apiKey ?? '').trim()
    if (!apiKey) throw apiError(400, 'VALIDATION', 'apiKey 必填')
    const cred = await store.loadCredentials()
    cred.aiKeys = { ...(cred.aiKeys ?? {}), [ctx.params.id]: apiKey }
    await store.saveCredentials(cred)
    sendJson(ctx.res, 200, { ok: true, hasKey: true })
  })

  // ---------- 测试连接 ----------
  router.post('/api/ai/test', async (ctx: Ctx) => {
    const cfg = await services.loadCfg()
    await ensureLegacyMigration(cfg, services)
    const body = (await readJsonBody(ctx.req)) as Record<string, unknown>
    const providerId = String(body.providerId ?? '').trim()
    if (!providerId) throw apiError(400, 'VALIDATION', 'providerId 必填')
    const p = providerOf(cfg, providerId)
    const key = await apiKeyOf(p.id)
    if (!key) throw apiError(400, 'AI_CONFIG', `「${p.name}」未设置 API Key`)
    try {
      const reply = await testConnection(p, key)
      sendJson(ctx.res, 200, { ok: true, detail: reply })
    } catch (e) {
      throw apiError(502, 'AI_FAILED', (e as Error).message)
    }
  })

  // ---------- 日志润色（按生效供应商） ----------
  router.post('/api/ai/polish', async (ctx: Ctx) => {
    const body = (await readJsonBody(ctx.req)) as Record<string, unknown>
    const text = typeof body.text === 'string' ? body.text : ''
    if (!text.trim()) throw apiError(400, 'VALIDATION', 'text 必填')

    const cfg = await services.loadCfg()
    await ensureLegacyMigration(cfg, services)
    if (!cfg.ai.enabled) throw apiError(400, 'AI_DISABLED', 'AI 润色未启用（请在设置页开启）')
    const provider = activeProvider(cfg)
    if (!provider) throw apiError(400, 'AI_CONFIG', '未配置生效的 AI 供应商（请在设置页添加并设为当前）')
    const key = await apiKeyOf(provider.id)
    if (!key) throw apiError(400, 'AI_CONFIG', `「${provider.name}」未设置 API Key`)

    try {
      const content = await polishLog(provider, key, text)
      sendJson(ctx.res, 200, { ok: true, content, provider: provider.name })
    } catch (e) {
      throw apiError(502, 'AI_FAILED', `「${provider.name}」${(e as Error).message}`)
    }
  })

  router.post('/api/ai/commit-message', async (ctx: Ctx) => {
    const body = (await readJsonBody(ctx.req)) as { fileSummary?: string; diff?: string }
    const fileSummary = typeof body.fileSummary === 'string' ? body.fileSummary : ''
    const diff = typeof body.diff === 'string' ? body.diff : ''
    if (!fileSummary && !diff) throw apiError(400, 'VALIDATION', 'fileSummary/diff 至少一项必填')
    const cfg = await services.loadCfg()
    await ensureLegacyMigration(cfg, services)
    if (!cfg.ai.enabled) throw apiError(400, 'AI_DISABLED', 'AI 润色未启用（请在设置页开启）')
    const provider = activeProvider(cfg)
    if (!provider) throw apiError(400, 'AI_CONFIG', '未配置生效的 AI 供应商')
    const key = await apiKeyOf(provider.id)
    if (!key) throw apiError(400, 'AI_CONFIG', `「${provider.name}」未设置 API Key`)
    try {
      const out = await generateCommitMessage(provider, key, { fileSummary, diff: diff.slice(0, 60_000) })
      sendJson(ctx.res, 200, { ok: true, ...out, provider: provider.name })
    } catch (e) {
      throw apiError(502, 'AI_FAILED', `「${provider.name}」${(e as Error).message}`)
    }
  })

  router.post('/api/ai/explain-diff', async (ctx: Ctx) => {
    const body = (await readJsonBody(ctx.req)) as { filePath?: string; diff?: string }
    const filePath = typeof body.filePath === 'string' ? body.filePath : ''
    const diff = typeof body.diff === 'string' ? body.diff : ''
    if (!filePath || !diff) throw apiError(400, 'VALIDATION', 'filePath 与 diff 必填')
    const cfg = await services.loadCfg()
    await ensureLegacyMigration(cfg, services)
    if (!cfg.ai.enabled) throw apiError(400, 'AI_DISABLED', 'AI 润色未启用')
    const provider = activeProvider(cfg)
    if (!provider) throw apiError(400, 'AI_CONFIG', '未配置生效的 AI 供应商')
    const key = await apiKeyOf(provider.id)
    if (!key) throw apiError(400, 'AI_CONFIG', `「${provider.name}」未设置 API Key`)
    try {
      const out = await explainDiff(provider, key, { filePath, diff: diff.slice(0, 60_000) })
      sendJson(ctx.res, 200, { ok: true, ...out, provider: provider.name })
    } catch (e) {
      throw apiError(502, 'AI_FAILED', `「${provider.name}」${(e as Error).message}`)
    }
  })
}
