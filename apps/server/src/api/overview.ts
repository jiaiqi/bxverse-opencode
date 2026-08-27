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
      dirtyRepoCount: 0,
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
    // 扩展：M8 看板 lastRelease.daysAgo
    const nowDay = Math.floor(Date.now() / 86_400_000)
    for (const p of cfg.projects) {
      let changedCount = 0
      let dirtyCount = 0
      for (const repo of p.repos) {
        data.repoCount += 1
        const status = statusMap.get(repo.id)
        if (status?.dirty && status.dirty > 0) {
          dirtyCount += 1
          data.dirtyRepoCount += 1
        }
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
      const last = releases[0]
      data.projects.push({
        id: p.id,
        name: p.name,
        version: p.version,
        repoCount: p.repos.length,
        changedRepoCount: changedCount,
        dirtyRepoCount: dirtyCount,
        lastRelease: last
          ? {
              version: last.version,
              date: last.date.slice(0, 10),
              daysAgo: Math.max(0, nowDay - Math.floor(new Date(last.date).getTime() / 86_400_000)),
            }
          : null,
      })
    }
    sendJson(ctx.res, 200, data)
  })

  // M9 驾驶舱增强：近 8 周发布节奏（跨项目聚合，0 周也展示空柱）
  router.get('/api/overview/weekly', async (ctx: Ctx) => {
    const cfg = await services.loadCfg()
    const ds = new store.DataStore({ dataDir: cfg.dataDir })
    // 收集近 8 周（按 ISO 周 YYYY-Www）发布次数
    const weeks: { week: string; releases: number; projects: number }[] = []
    const now = new Date()
    // 计算 8 周（含当前周）起点
    const start = new Date(now)
    start.setUTCDate(start.getUTCDate() - 7 * 7) // 7 周前
    // 找最近一个周一作为起点（含当前周）
    const day = start.getUTCDay() // 0=Sun,1=Mon,...
    const backToMon = day === 0 ? -6 : 1 - day
    start.setUTCDate(start.getUTCDate() + backToMon)
    start.setUTCHours(0, 0, 0, 0)
    for (let i = 0; i < 8; i++) {
      const ws = new Date(start.getTime() + i * 7 * 86_400_000)
      const we = new Date(ws.getTime() + 7 * 86_400_000)
      const week = isoWeek(ws)
      weeks.push({ week, releases: 0, projects: 0 })
      // 各项目取近 100 条，filter 在本窗口内
      const projectSet = new Set<string>()
      for (const p of cfg.projects) {
        try {
          const records = await ds.listRecords(p.id, { limit: 100 })
          for (const r of records) {
            const t = new Date(r.date).getTime()
            if (t >= ws.getTime() && t < we.getTime() && r.kind === 'project' && r.status !== 'failed') {
              weeks[i].releases += 1
              projectSet.add(p.id)
            }
          }
        } catch {
          // 容错：单个项目失败不影响整体
        }
      }
      weeks[i].projects = projectSet.size
    }
    sendJson(ctx.res, 200, { weeks, generatedAt: new Date().toISOString() })
  })
}

/** ISO 周字符串 YYYY-Www（基于 UTC 周一为起点） */
function isoWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dayNum = (date.getUTCDay() + 6) % 7 // Mon=0..Sun=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3) // Thursday
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4))
  const week = 1 + Math.round(((date.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7)
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}
