// apps/server/src/api/git.ts
// R22 仓库内 Git 面板：status / diff / 暂存 / 撤销暂存 / 提交 / 推送 / 拉取
// 路径强制在 repos/{projectId}/{repoId} 之下（防 ../）

import fs from 'node:fs'
import { git as gitNs } from '@bxverse/core'
import type { AppConfig, GitFileDiff, GitStatus } from '@bxverse/shared'
import type { Ctx } from '../http/router'
import { apiError, readJsonBody, sendJson } from '../http/json'

export interface GitServices {
  loadCfg: () => Promise<AppConfig>
}

async function resolveRepoDir(services: GitServices, projectId: string, repoId: string): Promise<string> {
  const cfg = await services.loadCfg()
  const p = cfg.projects.find(x => x.id === projectId)
  if (!p) throw apiError(404, 'PROJECT_NOT_FOUND', `项目不存在: ${projectId}`)
  const r = p.repos.find(x => x.id === repoId)
  if (!r) throw apiError(404, 'REPO_NOT_FOUND', `仓库不存在: ${repoId}`)
  if (!fs.existsSync(r.path)) throw apiError(404, 'REPO_DIR_MISSING', `仓库目录不存在: ${r.path}`)
  return r.path
}

export function register(router: import('../http/router').Router, services: GitServices): void {
  router.get('/api/repos/:pid/:rid/git/status', async (ctx: Ctx) => {
    const repoDir = await resolveRepoDir(services, ctx.params.pid, ctx.params.rid)
    const r = await gitNs.gitStatus(repoDir)
    const status: GitStatus = {
      branch: r.branch,
      hasRemote: r.hasRemote,
      remoteUrl: r.remoteUrl,
      head: r.head,
      ahead: r.ahead,
      behind: r.behind,
      files: r.files.map(f => ({
        indexStatus: f.indexStatus,
        workStatus: f.workStatus,
        path: f.path,
        staged: f.staged,
        untracked: f.untracked,
      })),
      summary: {
        staged: r.files.filter(f => f.staged).length,
        unstaged: r.files.filter(f => !f.staged && !f.untracked).length,
        untracked: r.files.filter(f => f.untracked).length,
      },
    }
    sendJson(ctx.res, 200, status)
  })

  router.get('/api/repos/:pid/:rid/git/diff', async (ctx: Ctx) => {
    const filePath = ctx.query.get('path') ?? ''
    const range = (ctx.query.get('range') ?? 'unstaged') as 'staged' | 'unstaged' | 'untracked'
    if (!filePath) throw apiError(400, 'VALIDATION', 'path 必填')
    if (!['staged', 'unstaged', 'untracked'].includes(range)) {
      throw apiError(400, 'VALIDATION', 'range 必须为 staged/unstaged/untracked')
    }
    const repoDir = await resolveRepoDir(services, ctx.params.pid, ctx.params.rid)
    const r = await gitNs.gitFileDiff(repoDir, filePath, range)
    const out: GitFileDiff = { path: filePath, range, patch: r.patch, truncated: r.truncated }
    sendJson(ctx.res, 200, out)
  })

  router.post('/api/repos/:pid/:rid/git/stage', async (ctx: Ctx) => {
    const body = (await readJsonBody(ctx.req)) as { all?: boolean; paths?: string[] }
    const repoDir = await resolveRepoDir(services, ctx.params.pid, ctx.params.rid)
    const paths = body.all ? 'all' : (body.paths ?? [])
    if (paths !== 'all' && paths.length === 0) throw apiError(400, 'VALIDATION', 'paths 或 all 必填')
    try {
      await gitNs.gitAdd(repoDir, paths)
      sendJson(ctx.res, 200, { ok: true })
    } catch (e) {
      if (e instanceof gitNs.GitError) throw apiError(400, 'GIT', (e as Error).message)
      throw e as Error
    }
  })

  router.post('/api/repos/:pid/:rid/git/unstage', async (ctx: Ctx) => {
    const body = (await readJsonBody(ctx.req)) as { all?: boolean; paths?: string[] }
    const repoDir = await resolveRepoDir(services, ctx.params.pid, ctx.params.rid)
    const paths = body.all ? 'all' : (body.paths ?? [])
    if (paths !== 'all' && paths.length === 0) throw apiError(400, 'VALIDATION', 'paths 或 all 必填')
    try {
      await gitNs.gitReset(repoDir, paths)
      sendJson(ctx.res, 200, { ok: true })
    } catch (e) {
      if (e instanceof gitNs.GitError) throw apiError(400, 'GIT', (e as Error).message)
      throw e as Error
    }
  })

  router.post('/api/repos/:pid/:rid/git/commit', async (ctx: Ctx) => {
    const body = (await readJsonBody(ctx.req)) as { subject?: string; body?: string; allowEmpty?: boolean }
    const subject = typeof body.subject === 'string' ? body.subject : ''
    if (!subject.trim()) throw apiError(400, 'VALIDATION', 'subject 必填')
    const repoDir = await resolveRepoDir(services, ctx.params.pid, ctx.params.rid)
    try {
      const r = await gitNs.gitCommit(repoDir, { subject, body: body.body, allowEmpty: body.allowEmpty })
      sendJson(ctx.res, 200, { ok: true, hash: r.hash })
    } catch (e) {
      if (e instanceof gitNs.GitError) throw apiError(400, 'GIT', (e as Error).message)
      throw e as Error
    }
  })

  router.post('/api/repos/:pid/:rid/git/push', async (ctx: Ctx) => {
    const repoDir = await resolveRepoDir(services, ctx.params.pid, ctx.params.rid)
    try {
      const r = await gitNs.gitPush(repoDir)
      sendJson(ctx.res, 200, { ok: true, output: r.output })
    } catch (e) {
      if (e instanceof gitNs.GitError) throw apiError(502, 'GIT', (e as Error).message)
      throw e as Error
    }
  })

  router.post('/api/repos/:pid/:rid/git/pull', async (ctx: Ctx) => {
    const repoDir = await resolveRepoDir(services, ctx.params.pid, ctx.params.rid)
    try {
      const r = await gitNs.gitPull(repoDir)
      sendJson(ctx.res, 200, { ok: true, output: r.output })
    } catch (e) {
      if (e instanceof gitNs.GitError) throw apiError(502, 'GIT', (e as Error).message)
      throw e as Error
    }
  })
}
