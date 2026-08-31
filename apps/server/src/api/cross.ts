// apps/server/src/api/cross.ts
// C 方向：跨项目搜索（按 commit hash / version / name 维度）
//
// 设计要点：
// - 三种 type 独立：commit（commit hash 前缀匹配） / version（精确匹配） / name（项目名/仓库名/displayName 子串匹配）
// - 全部基于既有 dataStore.listRecords + cfg.projects 聚合，无新增数据源
// - 零依赖、纯查询；不调用 git、不写记录；不影响发布队列
// - 限流：limit 默认 50，上限 200；q 长度 1-100
// - 错误码：VALIDATION（参数错）/ NOT_FOUND（项目不存在，留作未来按 projectId 过滤的扩展位）

import type { AppConfig, CrossSearchResult, CrossSearchType } from '@bxverse/shared'
import { store } from '@bxverse/core'
import type { Ctx } from '../http/router'
import { apiError, sendJson } from '../http/json'

export interface CrossServices {
  loadCfg: () => Promise<AppConfig>
  getDataStore: () => store.DataStore
}

const VALID_TYPES: readonly CrossSearchType[] = ['commit', 'version', 'name'] as const

export function register(router: import('../http/router').Router, services: CrossServices): void {
  // GET /api/cross/search?q=&type=commit|version|name&limit=50
  router.get('/api/cross/search', async (ctx: Ctx) => {
    const t0 = Date.now()
    const q = (ctx.query.get('q') ?? '').trim()
    const typeRaw = (ctx.query.get('type') ?? '').trim()
    if (!q) throw apiError(400, 'VALIDATION', 'q 必填')
    if (q.length > 100) throw apiError(400, 'VALIDATION', 'q 长度上限 100')
    if (!VALID_TYPES.includes(typeRaw as CrossSearchType)) {
      throw apiError(400, 'VALIDATION', `type 必须为 ${VALID_TYPES.join('|')}`)
    }
    const type = typeRaw as CrossSearchType
    const limitRaw = Number(ctx.query.get('limit') ?? 50)
    if (!Number.isInteger(limitRaw) || limitRaw < 1) {
      throw apiError(400, 'VALIDATION', 'limit 必须为正整数')
    }
    const limit = Math.min(limitRaw, 200)

    const cfg = await services.loadCfg()
    const results: CrossSearchResult[] = []
    const projectNameById = new Map<string, string>()
    for (const p of cfg.projects) projectNameById.set(p.id, p.name)

    if (type === 'commit') {
      // commit 命中：遍历所有项目的 release record.repos[].commits[].fullHash，前缀匹配
      const dataStore = services.getDataStore()
      for (const p of cfg.projects) {
        const records = await dataStore.listRecords(p.id, 100)
        for (const r of records) {
          if (!r.repos) continue
          for (const ref of r.repos) {
            for (const c of ref.commits ?? []) {
              const full = typeof c.fullHash === 'string' ? c.fullHash : c.hash
              if (typeof full !== 'string' || full.length < 7) continue
              if (full.toLowerCase().startsWith(q.toLowerCase())) {
                results.push({
                  type: 'commit',
                  projectId: p.id,
                  projectName: p.name,
                  repoId: ref.repoId,
                  repoName: ref.repoName,
                  commit: full,
                  shortCommit: full.slice(0, 7),
                  version: r.version,
                  hint: `${r.date.slice(0, 10)} 发布 · ${c.subject?.slice(0, 60) ?? ''}`,
                  score: 1,
                })
                if (results.length >= limit) break
                if (results.length >= limit) break
              }
            }
            if (results.length >= limit) break
          }
          if (results.length >= limit) break
        }
        if (results.length >= limit) break
      }
    } else if (type === 'version') {
      // version 命中：精确匹配 release.version（X.Y.Z）
      const dataStore = services.getDataStore()
      for (const p of cfg.projects) {
        const records = await dataStore.listRecords(p.id, 100)
        for (const r of records) {
          if (r.version === q || r.version === `v${q}` || r.version === `V${q}`) {
            results.push({
              type: 'version',
              projectId: p.id,
              projectName: p.name,
              version: r.version,
              hint: r.deprecated
                ? `${r.date.slice(0, 10)} 发布 · 已废弃${r.deprecateReason ? `（${r.deprecateReason}）` : ''}`
                : `${r.date.slice(0, 10)} 发布`,
              score: 1,
            })
            if (results.length >= limit) break
          }
        }
        if (results.length >= limit) break
      }
    } else {
      // name 命中：项目名/仓库名/displayName（仓库有，项目无）子串匹配
      const qLower = q.toLowerCase()
      for (const p of cfg.projects) {
        const projectHit = p.name.toLowerCase().includes(qLower)
        if (projectHit) {
          results.push({
            type: 'name',
            projectId: p.id,
            projectName: p.name,
            hint: p.description?.slice(0, 80),
            score: 0.9,
          })
        }
        for (const r of p.repos) {
          const repoHit =
            r.name.toLowerCase().includes(qLower) ||
            (r.displayName?.toLowerCase().includes(qLower) ?? false)
          if (repoHit) {
            results.push({
              type: 'name',
              projectId: p.id,
              projectName: p.name,
              repoId: r.id,
              repoName: r.name,
              hint: r.displayName ?? r.name,
              score: 0.7,
            })
          }
          if (results.length >= limit) break
        }
        if (results.length >= limit) break
      }
    }

    sendJson(ctx.res, 200, {
      query: q,
      type,
      total: results.length,
      results: results.slice(0, limit),
      tookMs: Date.now() - t0,
    })
  })
}
