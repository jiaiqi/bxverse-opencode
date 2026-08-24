// apps/server/src/api/history.ts
// 发布历史查询 + 双轨日志编辑（PATCH /api/releases/:id/log，state 流转）

import type { AppConfig, RepoVersionItem } from '@bxverse/shared'
import { git, store } from '@bxverse/core'
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

  // GET /api/releases/:id/versions —— 该次发布的项目版本清单（R18 与发布历史绑定）
  router.get('/api/releases/:id/versions', async (ctx: Ctx) => {
    const record = await services.dataStore.readRecord(ctx.params.id)
    if (!record) throw apiError(404, 'NOT_FOUND', `发布记录不存在: ${ctx.params.id}`)
    if (record.kind !== 'project' || !record.repos) {
      throw apiError(400, 'VALIDATION', '仅项目级发布记录包含版本清单')
    }
    const items: RepoVersionItem[] = record.repos.map(r => ({
      app: r.repoName,
      name: r.displayName || r.repoName,
      version: r.version,
    }))
    sendJson(ctx.res, 200, items)
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

  // POST /api/releases/:id/deprecate —— 标为废弃与纠偏撤销 Tag (R24)
  router.post('/api/releases/:id/deprecate', async (ctx: Ctx) => {
    const body = (await readJsonBody(ctx.req)) as { reason?: string; cleanupTags?: boolean }
    const reason = String(body.reason ?? '').trim()
    const cleanupTags = body.cleanupTags === true
    const cfg = await services.loadCfg()

    // 1. 废弃记录更新
    const updated = await services.dataStore.deprecateRecord(ctx.params.id, reason)

    // 2. 若勾选撤销标签，遍历关联工程安全清理
    // 修正：不再只读 project 记录的 tags（仅 milestone，build 永不清理），改为从 projectRecord.repos 反查各 repo 最新 record，取其 tags.build/tags.milestone 组装待删清单
    let removed: string[] = []
    let failed: { repoId: string; tag: string; reason: string }[] = []
    if (cleanupTags && updated.kind === 'project' && updated.repos?.length) {
      const project = cfg.projects.find(p => p.id === updated.scopeId)
      if (project) {
        for (const rRef of updated.repos) {
          const repoDef = project.repos.find(r => r.id === rRef.repoId)
          if (!repoDef) continue
          // 反查该仓最新 record（优先精确匹配 rRef.version，fallback 最新一条）
          let repoRecord: import('@bxverse/shared').ReleaseRecord | null = null
          try {
            const candidates = await services.dataStore.listRecords(rRef.repoId, 20)
            repoRecord = candidates.find(r => r.version === rRef.version) ?? candidates[0] ?? null
            if (!repoRecord) {
              const rid = services.dataStore.nextReleaseId('repo', rRef.repoId, rRef.version)
              repoRecord = await services.dataStore.readRecord(rid)
            }
          } catch {
            repoRecord = null
          }
          if (!repoRecord) continue
          const tagsToDelete = [repoRecord.tags.build, repoRecord.tags.milestone].filter(Boolean) as string[]
          const uniqTags = [...new Set(tagsToDelete)]
          for (const tag of uniqTags) {
            try {
              await git.deleteTag(repoDef.path, tag, { remote: true })
              removed.push(tag)
            } catch (e) {
              failed.push({ repoId: rRef.repoId, tag, reason: (e as Error).message })
            }
          }
        }
      }
    } else if (cleanupTags && updated.kind === 'repo') {
      // 仓库级废弃：直接清理自身 tags
      const cfgProject = cfg.projects.find(p => p.repos.some(r => r.id === updated.scopeId))
      const repoDef = cfgProject?.repos.find(r => r.id === updated.scopeId)
      if (repoDef) {
        const tagsToDelete = [updated.tags.build, updated.tags.milestone].filter(Boolean) as string[]
        for (const tag of [...new Set(tagsToDelete)]) {
          try {
            await git.deleteTag(repoDef.path, tag, { remote: true })
            removed.push(tag)
          } catch (e) {
            failed.push({ repoId: updated.scopeId, tag, reason: (e as Error).message })
          }
        }
      }
    }

    if (failed.length > 0) {
      const warnings = failed.map(f => `${f.repoId} 清理标签 ${f.tag} 失败: ${f.reason}`)
      // 部分成功：HTTP 200 + warnings
      sendJson(ctx.res, 200, { ...updated, removed, failed, warnings })
      return
    }
    // 全部成功或无需清理：附加 removed/failed 便于审计，warnings 仅在部分成功时返回
    sendJson(ctx.res, 200, { ...updated, removed, failed })
  })
}
