// apps/server/src/api/overview.ts
// GET /api/overview —— 首页聚合（项目卡片 + 变动仓库列表）

import type { AppConfig, OverviewData } from '@bxverse/shared'
import type { Ctx } from '../http/router'
import { sendJson } from '../http/json'
import type { PollCache } from '../poll'
import { store } from '@bxverse/core'

export function register(
  router: import('../http/router').Router,
  services: { loadCfg: () => Promise<AppConfig>; poll: PollCache; dataStore: store.DataStore },
): void {
  router.get('/api/overview', async (ctx: Ctx) => {
    const cfg = await services.loadCfg()
    const data: OverviewData = {
      projectCount: cfg.projects.length,
      repoCount: 0,
      changedRepoCount: 0,
      projects: [],
      changedRepos: [],
    }
    for (const p of cfg.projects) {
      let changedCount = 0
      for (const repo of p.repos) {
        data.repoCount += 1
        const status = await services.poll.get(repo)
        if (status.changed) {
          changedCount += 1
          data.changedRepoCount += 1
          data.changedRepos.push({
            projectId: p.id,
            projectName: p.name,
            repoId: repo.id,
            repoName: repo.name,
            head: status.head.slice(0, 7),
            commits: status.commits.length,
          })
        }
      }
      const releases = await services.dataStore.listRecords(p.id, 1)
      data.projects.push({
        id: p.id,
        name: p.name,
        version: p.version,
        repoCount: p.repos.length,
        changedRepoCount: changedCount,
        lastRelease: releases.length
          ? { version: releases[0].version, date: releases[0].date.slice(0, 10) }
          : null,
      })
    }
    sendJson(ctx.res, 200, data)
  })
}
