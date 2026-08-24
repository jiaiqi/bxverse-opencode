// apps/server/src/api/overview.ts
// GET /api/overview —— 首页聚合（项目卡片 + 变动仓库列表）

import type { AppConfig, OverviewData, RepoStatus } from '@bxverse/shared'
import type { Ctx } from '../http/router'
import { sendJson } from '../http/json'
import type { PollCache } from '../poll'
import { runWithPool, store } from '@bxverse/core'

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
    // 并行化：poll.get 用 runWithPool limit 6，listRecords(limit=1) 仅取头部一条（索引快速路径）
    const allRepos = cfg.projects.flatMap(p => p.repos)
    const statusMap = new Map<string, RepoStatus>()
    await runWithPool(allRepos, 6, async (repo) => {
      try {
        const s = await services.poll.get(repo)
        statusMap.set(repo.id, s)
      } catch {
        // 单仓失败视为未变动，不阻断首页
      }
    })
    const releasesMap = new Map<string, import('@bxverse/shared').ReleaseRecord[]>()
    await Promise.all(
      cfg.projects.map(async p => {
        const releases = await services.dataStore.listRecords(p.id, { limit: 1 })
        releasesMap.set(p.id, releases)
      }),
    )
    for (const p of cfg.projects) {
      let changedCount = 0
      for (const repo of p.repos) {
        data.repoCount += 1
        const status = statusMap.get(repo.id)
        if (status?.changed) {
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
      const releases = releasesMap.get(p.id) ?? []
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
