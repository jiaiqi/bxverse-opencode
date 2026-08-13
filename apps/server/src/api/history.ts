// apps/server/src/api/history.ts
// 发布历史查询 + 双轨日志编辑（PATCH /api/releases/:id/log，state 流转）

import type { AppConfig } from '@bxverse/shared'
import { store } from '@bxverse/core'
import type { Ctx } from '../http/router'
import { apiError, readJsonBody, sendJson } from '../http/json'

export interface HistoryServices {
  loadCfg: () => Promise<AppConfig>
  lockedProjectId: () => string | null
  dataStore: store.DataStore
}

export function register(router: import('../http/router').Router, services: HistoryServices): void {
  router.get('/api/projects/:id/releases', async (ctx: Ctx) => {
    const cfg = await services.loadCfg()
    if (!cfg.projects.some(p => p.id === ctx.params.id)) {
      throw apiError(404, 'NOT_FOUND', `项目不存在: ${ctx.params.id}`)
    }
    const n = Number(ctx.query.get('n') ?? 20)
    if (!Number.isInteger(n) || n < 1) throw apiError(400, 'VALIDATION', 'n 必须为正整数')
    sendJson(ctx.res, 200, await services.dataStore.listRecords(ctx.params.id, Math.min(n, 100)))
  })

  router.get('/api/releases', async (ctx: Ctx) => {
    const scopeId = ctx.query.get('scopeId')
    if (!scopeId) throw apiError(400, 'VALIDATION', '缺少必填参数 scopeId')
    const version = ctx.query.get('version')
    const records = await services.dataStore.listRecords(scopeId, 100)
    if (version) {
      const hit = records.find(r => r.version === version)
      if (!hit) throw apiError(404, 'NOT_FOUND', `未找到 ${scopeId} 的 ${version} 发布记录`)
      sendJson(ctx.res, 200, hit)
      return
    }
    sendJson(ctx.res, 200, records)
  })

  // PATCH /api/releases/:id/log —— 双轨日志人工编辑（api.md §7.3）
  router.patch('/api/releases/:id/log', async (ctx: Ctx) => {
    const body = (await readJsonBody(ctx.req)) as Record<string, unknown>
    const track = String(body.track ?? '')
    const action = String(body.action ?? '')
    if (!['internal', 'external'].includes(track)) {
      throw apiError(400, 'VALIDATION', 'track 必须为 internal/external')
    }
    if (!['edit', 'confirm', 'reset'].includes(action)) {
      throw apiError(400, 'VALIDATION', 'action 必须为 edit/confirm/reset')
    }

    const record = await services.dataStore.readRecord(ctx.params.id)
    if (!record) throw apiError(404, 'NOT_FOUND', `发布记录不存在: ${ctx.params.id}`)

    // 该记录所属 scope 正在发布中 → 409
    const scopeProjectId = record.kind === 'project' ? record.scopeId : null
    const locked = services.lockedProjectId()
    if (scopeProjectId && locked === scopeProjectId) {
      throw apiError(409, 'PUBLISH_RUNNING', '该记录所属项目正在发布中')
    }

    const log = record.logs[track as 'internal' | 'external']
    const prevState = log.state
    if (action === 'edit') {
      if (typeof body.content !== 'string') throw apiError(400, 'VALIDATION', 'edit 必须提供 content')
      log.content = body.content
      log.state = 'edited'
    } else if (action === 'confirm') {
      if (prevState === 'edited') log.state = 'confirmed'
      // auto/confirmed 状态下 confirm 幂等无变化
    } else {
      log.content = log.autoDraft
      log.state = 'auto'
    }

    await services.dataStore.updateRecord(record)
    await services.dataStore.commitRecords(`chore: manual log edit (${ctx.params.id}, ${track}:${action})`)
    sendJson(ctx.res, 200, record)
  })
}
