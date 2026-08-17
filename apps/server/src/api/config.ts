// apps/server/src/api/config.ts
// GET /api/config（免 token 引导）/ POST /api/config（部分更新）

import type { AppConfig } from '@bxverse/shared'
import type { Ctx } from '../http/router'
import { apiError, readJsonBody, sendJson } from '../http/json'
import { ensureLegacyMigration } from './ai'

export interface AppServices {
  loadCfg: () => Promise<AppConfig>
  saveCfg: (cfg: AppConfig) => Promise<void>
  getToken: () => string
}

/** 项目概要（api.md §3.1） */
function projectSummaries(cfg: AppConfig): { id: string; name: string; version: string; repoCount: number }[] {
  return cfg.projects.map(p => ({ id: p.id, name: p.name, version: p.version, repoCount: p.repos.length }))
}

export function register(router: import('../http/router').Router, services: AppServices): void {
  router.get('/api/config', async (ctx: Ctx) => {
    const cfg = await services.loadCfg()
    // AI：惰性迁移旧单表单配置 → providers；apiKey 永不回显（write-only）
    await ensureLegacyMigration(cfg, services)
    cfg.ai.apiKey = ''
    sendJson(ctx.res, 200, {
      token: services.getToken(),
      config: { ...cfg, projects: projectSummaries(cfg) },
    })
  })

  router.post('/api/config', async (ctx: Ctx) => {
    const body = (await readJsonBody(ctx.req)) as Record<string, unknown>
    const cfg = await services.loadCfg()

    const allowed = ['theme', 'themeStyle', 'pwa', 'pollInterval', 'ai']
    for (const key of Object.keys(body)) {
      if (!allowed.includes(key)) {
        throw apiError(400, 'VALIDATION', `字段不支持在线修改: ${key}（仅支持 ${allowed.join('/')}）`)
      }
    }

    if (body.theme !== undefined) {
      if (!['light', 'dark', 'system'].includes(String(body.theme))) {
        throw apiError(400, 'VALIDATION', 'theme 必须为 light/dark/system')
      }
      cfg.theme = body.theme as AppConfig['theme']
    }
    if (body.themeStyle !== undefined) {
      if (!['indigo', 'wenxi'].includes(String(body.themeStyle))) {
        throw apiError(400, 'VALIDATION', 'themeStyle 必须为 indigo/wenxi')
      }
      cfg.themeStyle = body.themeStyle as AppConfig['themeStyle']
    }
    if (body.pwa !== undefined) {
      const pwa = body.pwa as Record<string, unknown>
      if (typeof pwa !== 'object' || pwa === null || typeof pwa.enabled !== 'boolean') {
        throw apiError(400, 'VALIDATION', 'pwa 必须为 { enabled: boolean }')
      }
      cfg.pwa = { enabled: pwa.enabled }
    }
    if (body.pollInterval !== undefined) {
      const v = Number(body.pollInterval)
      if (!Number.isInteger(v) || v < 5000 || v > 3_600_000) {
        throw apiError(400, 'VALIDATION', 'pollInterval 必须为 [5000, 3600000] 的整数（毫秒）')
      }
      cfg.pollInterval = v
    }
    if (body.ai !== undefined) {
      const ai = body.ai as Record<string, unknown>
      if (typeof ai !== 'object' || ai === null) {
        throw apiError(400, 'VALIDATION', 'ai 必须为对象')
      }
      // 兼容旧调用方：baseUrl/model/apiKey 同步到生效供应商（无供应商时自动创建 legacy）
      if (cfg.ai.providers?.length === 0 && (typeof ai.baseUrl === 'string' && ai.baseUrl)) {
        cfg.ai.providers = [{
          id: 'legacy', name: '默认', kind: 'openai-compatible' as const,
          baseUrl: ai.baseUrl, model: String(ai.model ?? '') || 'gpt-4o-mini', enabled: true,
        }]
        cfg.ai.activeProviderId = 'legacy'
      }
      const active = cfg.ai.providers?.find(p => p.id === cfg.ai.activeProviderId && p.enabled)
        ?? cfg.ai.providers?.find(p => p.enabled)
      if (active) {
        if (typeof ai.baseUrl === 'string' && ai.baseUrl.trim()) active.baseUrl = ai.baseUrl.trim()
        if (typeof ai.model === 'string' && ai.model.trim()) active.model = ai.model.trim()
      }
      if (typeof ai.apiKey === 'string' && ai.apiKey.trim()) {
        // write-only：key 迁入 credentials.json.aiKeys，app.json 不存明文
        const target = active ?? cfg.ai.providers?.[0]
        if (target) {
          const { loadCredentials, saveCredentials } = await import('@bxverse/core').then(m => m.store)
          const cred = await loadCredentials()
          cred.aiKeys = { ...(cred.aiKeys ?? {}), [target.id]: ai.apiKey.trim() }
          await saveCredentials(cred)
        }
        cfg.ai.apiKey = ''
      }
      cfg.ai.enabled = typeof ai.enabled === 'boolean' ? ai.enabled : cfg.ai.enabled
      if (Array.isArray(ai.providers)) {
        for (const p of ai.providers as Record<string, unknown>[]) {
          if (typeof p !== 'object' || p === null) throw apiError(400, 'VALIDATION', 'providers 元素必须为对象')
        }
        cfg.ai.providers = ai.providers as AppConfig['ai']['providers']
      }
      if (typeof ai.activeProviderId === 'string') {
        if (!cfg.ai.providers?.some(p => p.id === ai.activeProviderId)) {
          throw apiError(400, 'VALIDATION', 'activeProviderId 不存在于 providers')
        }
        cfg.ai.activeProviderId = ai.activeProviderId
      }
    }

    await services.saveCfg(cfg)
    sendJson(ctx.res, 200, { config: { ...cfg, projects: projectSummaries(cfg) } })
  })
}
