// apps/server/src/api/config.ts
// GET /api/config（免 token 引导）/ POST /api/config（部分更新）

import type { AppConfig, BackupConfig } from '@bxverse/shared'
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

  const updateConfig = async (ctx: Ctx): Promise<void> => {
    const body = (await readJsonBody(ctx.req)) as Record<string, unknown>
    const cfg = await services.loadCfg()

    const allowed = ['theme', 'themeStyle', 'pwa', 'pollInterval', 'ai', 'backup']
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
    if (body.backup !== undefined) {
      const backup = body.backup as Record<string, unknown>
      if (typeof backup !== 'object' || backup === null) {
        throw apiError(400, 'VALIDATION', 'backup 必须为对象')
      }
      if (backup.enabled !== undefined && typeof backup.enabled !== 'boolean') {
        throw apiError(400, 'VALIDATION', 'backup.enabled 必须为布尔')
      }
      if (backup.dir !== undefined && backup.dir !== null && typeof backup.dir !== 'string') {
        throw apiError(400, 'VALIDATION', 'backup.dir 必须为字符串')
      }
      if (backup.source !== undefined && !['both', 'bundle', 'archive'].includes(String(backup.source))) {
        throw apiError(400, 'VALIDATION', 'backup.source 必须为 both/bundle/archive')
      }
      if (backup.onFailure !== undefined && !['warn', 'fail'].includes(String(backup.onFailure))) {
        throw apiError(400, 'VALIDATION', 'backup.onFailure 必须为 warn/fail')
      }
      cfg.backup = {
        enabled: typeof backup.enabled === 'boolean' ? backup.enabled : cfg.backup?.enabled ?? true,
        dir: typeof backup.dir === 'string' ? backup.dir : cfg.backup?.dir,
        source: (backup.source as BackupConfig['source'] | undefined) ?? cfg.backup?.source ?? 'both',
        onFailure: (backup.onFailure as BackupConfig['onFailure'] | undefined) ?? cfg.backup?.onFailure ?? 'warn',
      }
    }

    if (body.ai !== undefined) {
      const ai = body.ai as Record<string, unknown>
      if (typeof ai !== 'object' || ai === null) {
        throw apiError(400, 'VALIDATION', 'ai 必须为对象')
      }
      // 兼容旧调用方：保留旧字段，同时把配置同步到生效供应商。
      const baseUrl = typeof ai.baseUrl === 'string' ? ai.baseUrl.trim() : ''
      const model = typeof ai.model === 'string' ? ai.model.trim() : ''
      if (baseUrl) cfg.ai.baseUrl = baseUrl
      if (model) cfg.ai.model = model
      if (!(cfg.ai.providers?.length) && baseUrl) {
        cfg.ai.providers = [{
          id: 'legacy', name: '默认', kind: 'openai-compatible' as const,
          baseUrl, model: model || 'gpt-4o-mini', enabled: true,
        }]
        cfg.ai.activeProviderId = 'legacy'
      }
      const active = cfg.ai.providers?.find(p => p.id === cfg.ai.activeProviderId && p.enabled)
        ?? cfg.ai.providers?.find(p => p.enabled)
      if (active) {
        if (baseUrl) active.baseUrl = baseUrl
        if (model) active.model = model
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
  }
  router.post('/api/config', updateConfig)
  router.put('/api/config', updateConfig)
}
