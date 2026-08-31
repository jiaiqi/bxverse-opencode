// apps/server/src/api/matrix.ts
// GET /api/matrix —— 多项目跨工程版本矩阵聚合（R31，0 入侵纯聚合）
// 端到端 0 入侵：只走 services.poll.get + dataStore.listRecords 两条只读路径

import type { AppConfig, VersionMatrix } from '@bxverse/shared'
import { matrix as matrixCore, store } from '@bxverse/core'
import type { Ctx } from '../http/router'
import { sendJson } from '../http/json'
import type { PollCache } from '../poll'

export function register(
  router: import('../http/router').Router,
  services: { loadCfg: () => Promise<AppConfig>; poll: PollCache; dataStore: store.DataStore },
): void {
  router.get('/api/matrix', async (ctx: Ctx) => {
    const cfg = await services.loadCfg()
    // 复用 overview/doctor 同款 runWithPool 6 仓并行；poll.get 内部走 TTL 缓存
    const result: VersionMatrix = await matrixCore.buildMatrix(
      cfg,
      (repo) => services.poll.get(repo),
      services.dataStore,
      { concurrency: 6 },
    )
    sendJson(ctx.res, 200, result)
  })
}
