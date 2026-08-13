// apps/server/src/api/versions.ts
// GET /api/projects/:id/versions —— 项目下所有仓库的版本清单（R18 MVP）

import type { AppConfig, RepoVersionItem } from '@bxverse/shared'
import type { Ctx } from '../http/router'
import { apiError, sendJson } from '../http/json'
import type { PollCache } from '../poll'

export function register(
  router: import('../http/router').Router,
  services: { loadCfg: () => Promise<AppConfig>; poll: PollCache },
): void {
  router.get('/api/projects/:id/versions', async (ctx: Ctx) => {
    const cfg = await services.loadCfg()
    const project = cfg.projects.find(p => p.id === ctx.params.id)
    if (!project) throw apiError(404, 'NOT_FOUND', `项目不存在: ${ctx.params.id}`)

    const items: RepoVersionItem[] = []
    for (const repo of project.repos) {
      // 显式导出动作 → fresh 实时读取版本文件
      const status = await services.poll.get(repo, { fresh: true })
      items.push({
        app: repo.name,
        name: repo.displayName || repo.name,
        version: status.versionFile?.version || project.version,
      })
    }
    sendJson(ctx.res, 200, items)
  })
}
