// apps/server/src/api/doctor.ts
// GET /api/ops/doctor —— 系统健康页：调用 core/doctor 跑一致性体检（同 CLI 同源）
// 只读：不动任何数据，可重入。

import type { AppConfig } from '@bxverse/shared'
import { doctor, store } from '@bxverse/core'
import type { Ctx } from '../http/router'
import { sendJson } from '../http/json'

export function register(
  router: import('../http/router').Router,
  services: { loadCfg: () => Promise<AppConfig> },
): void {
  router.get('/api/ops/doctor', async (ctx: Ctx) => {
    const projectFilter = ctx.query.get('project')?.trim() || undefined
    const cfg = await services.loadCfg()
    const home = store.resolveHome().root
    const report = await doctor.runDoctor(cfg, home, { projectFilter })
    sendJson(ctx.res, 200, report)
  })
}
