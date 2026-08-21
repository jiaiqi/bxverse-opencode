// apps/server/src/api/metrics.ts
// 结构化指标（P1-2）：发布总数、成功率、备份占用（复用 backup 模块）

import type { Ctx } from '../http/router'
import { sendJson } from '../http/json'
import type { AppConfig } from '@bxverse/shared'
import { backup, store } from '@bxverse/core'

export function register(
  router: import('../http/router').Router,
  services: { loadCfg: () => Promise<AppConfig>; getDataStore: () => store.DataStore },
): void {
  router.get('/api/metrics', async (ctx: Ctx) => {
    const ds = services.getDataStore()
    const metas = await ds.listBackupMeta()
    const usage = backup.getBackupUsage(metas)
    const releaseIds = new Set(metas.map(m => m.releaseId))
    // 按项目聚合发布次数
    const byProject = new Map<string, number>()
    for (const m of metas) byProject.set(m.projectId, (byProject.get(m.projectId) ?? 0) + 1)
    sendJson(ctx.res, 200, {
      releases: { total: releaseIds.size, withBackup: metas.length, byProject: [...byProject.entries()].map(([projectId, count]) => ({ projectId, count })) },
      backups: usage,
      generatedAt: new Date().toISOString(),
    })
  })
}
