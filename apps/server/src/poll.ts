// apps/server/src/poll.ts
// 仓库状态轮询缓存（TTL = AppConfig.pollInterval；fresh=true 绕过缓存实时查询）

import type { RepoDef, RepoStatus } from '@bxverse/shared'
import { engine, runWithPool } from '@bxverse/core'

interface CacheEntry {
  status: RepoStatus
  at: number
}

export class PollCache {
  private cache = new Map<string, CacheEntry>()

  constructor(private getTtl: () => number) {}

  async get(repo: RepoDef, opts: { fresh?: boolean } = {}): Promise<RepoStatus> {
    const now = Date.now()
    const hit = this.cache.get(repo.id)
    if (!opts.fresh && hit && now - hit.at < this.getTtl()) return hit.status
    const status = await engine.collectChanges(repo)
    this.cache.set(repo.id, { status, at: now })
    return status
  }

  set(repoId: string, status: RepoStatus): void {
    this.cache.set(repoId, { status, at: Date.now() })
  }

  /** 后台轮询刷新全部仓库（发布执行中的项目跳过，避免状态抖动） */
  async refreshAll(projects: { id: string; repos: RepoDef[] }[], skipProjectId?: string | null): Promise<void> {
    const items: RepoDef[] = []
    for (const p of projects) {
      if (skipProjectId && p.id === skipProjectId) continue
      for (const repo of p.repos) items.push(repo)
    }
    // limit 6 池调度，避免 N*8 git 进程并发（50 仓 = 400 进程 → 限 6）
    await runWithPool(items, 6, async (repo) => {
      try {
        const status = await engine.collectChanges(repo)
        this.set(repo.id, status)
      } catch {
        // 单仓失败不影响其余（allSettled 语义）
      }
    })
    // 清理已删除仓库的失效缓存
    const alive = new Set<string>()
    for (const p of projects) for (const repo of p.repos) alive.add(repo.id)
    for (const key of this.cache.keys()) {
      if (!alive.has(key)) this.cache.delete(key)
    }
  }
}
