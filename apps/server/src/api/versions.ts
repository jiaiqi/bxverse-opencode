// apps/server/src/api/versions.ts
// 项目版本清单（R18 MVP）：
//   GET  /api/projects/:id/versions        返回 JSON 数组 [{app,name,version}]
//   POST /api/projects/:id/versions/export 把生成的 JSON 文件写入项目下指定仓库的指定相对路径

import fs from 'node:fs'
import path from 'node:path'
import type { AppConfig, ProjectDef, RepoVersionItem } from '@bxverse/shared'
import type { Ctx } from '../http/router'
import { apiError, readJsonBody, sendJson } from '../http/json'
import type { PollCache } from '../poll'

export function register(
  router: import('../http/router').Router,
  services: { loadCfg: () => Promise<AppConfig>; poll: PollCache },
): void {
  router.get('/api/projects/:id/versions', async (ctx: Ctx) => {
    const cfg = await services.loadCfg()
    const project = cfg.projects.find(p => p.id === ctx.params.id)
    if (!project) throw apiError(404, 'NOT_FOUND', `项目不存在: ${ctx.params.id}`)
    sendJson(ctx.res, 200, await collectItems(project, services))
  })

  router.post('/api/projects/:id/versions/export', async (ctx: Ctx) => {
    const body = (await readJsonBody(ctx.req)) as Record<string, unknown>
    const repoId = String(body.repoId ?? '')
    const relPath = String(body.path ?? '').trim()
    if (!repoId) throw apiError(400, 'VALIDATION', 'repoId 必填（目标仓库）')
    if (!relPath) throw apiError(400, 'VALIDATION', 'path 必填（相对仓库根的 JSON 文件路径）')
    if (!relPath.toLowerCase().endsWith('.json')) {
      throw apiError(400, 'VALIDATION', 'path 必须以 .json 结尾')
    }
    // POSIX 下 path.isAbsolute 不识别 Windows 盘符（C:/）与 UNC（\\host），需显式拦截，
    // 否则这些路径会被当作仓库内相对路径写入（跨平台一致性要求，见 api.md §4.3）
    const hasDriveOrUnc = /^[A-Za-z]:[\\/]/.test(relPath) || relPath.startsWith('\\\\')
    if (path.isAbsolute(relPath) || hasDriveOrUnc || relPath.split(/[\\/]/).includes('..')) {
      throw apiError(400, 'VALIDATION', 'path 必须是仓库内的相对路径（禁止绝对路径与 .. 越界）')
    }

    const cfg = await services.loadCfg()
    const project = cfg.projects.find(p => p.id === ctx.params.id)
    if (!project) throw apiError(404, 'NOT_FOUND', `项目不存在: ${ctx.params.id}`)
    const repo = project.repos.find(r => r.id === repoId)
    if (!repo) throw apiError(404, 'NOT_FOUND', `仓库不存在或不属于该项目: ${repoId}`)
    if (!fs.existsSync(repo.path)) throw apiError(400, 'REPO_INVALID', `仓库路径不存在: ${repo.path}`)

    // 可选：直接使用调用方提供的清单内容（如发布历史快照）；否则实时采集当前版本
    let items: RepoVersionItem[]
    if (body.items !== undefined) {
      const raw = body.items as unknown[]
      if (!Array.isArray(raw) || raw.some(x =>
        typeof (x as Record<string, unknown>).app !== 'string'
        || typeof (x as Record<string, unknown>).name !== 'string'
        || typeof (x as Record<string, unknown>).version !== 'string',
      )) {
        throw apiError(400, 'VALIDATION', 'items 必须是 [{app,name,version}] 数组')
      }
      items = raw as RepoVersionItem[]
    } else {
      items = await collectItems(project, services)
    }

    const absTarget = path.resolve(repo.path, relPath)
    const repoRoot = path.resolve(repo.path)
    if (absTarget !== repoRoot && !absTarget.startsWith(repoRoot + path.sep)) {
      throw apiError(400, 'VALIDATION', 'path 越界（必须位于仓库目录内）')
    }
    fs.mkdirSync(path.dirname(absTarget), { recursive: true })
    fs.writeFileSync(absTarget, `${JSON.stringify(items, null, 2)}\n`, 'utf8')

    sendJson(ctx.res, 200, { ok: true, repoId, path: relPath.replace(/\\/g, '/'), fullPath: absTarget, items, count: items.length })
  })
}

/** 生成版本清单（fresh 实时读取业务仓库 version.json） */
async function collectItems(project: ProjectDef, services: { poll: PollCache }): Promise<RepoVersionItem[]> {
  const items: RepoVersionItem[] = []
  for (const repo of project.repos) {
    const status = await services.poll.get(repo, { fresh: true })
    items.push({
      app: repo.name,
      name: repo.displayName || repo.name,
      version: status.versionFile?.version || project.version,
    })
  }
  return items
}
