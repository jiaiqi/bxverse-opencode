// apps/server/src/api/repos.ts
// 仓库接入（本地路径 / git 克隆）、仓库定义更新、仓库状态

import fs from 'node:fs'
import path from 'node:path'
import type { AppConfig, CloneRequest, RepoDef } from '@bxverse/shared'
import { git, store } from '@bxverse/core'
import type { Ctx } from '../http/router'
import { apiError, readJsonBody, sendJson } from '../http/json'
import type { PollCache } from '../poll'

export interface RepoServices {
  loadCfg: () => Promise<AppConfig>
  saveCfg: (cfg: AppConfig) => Promise<void>
  lockedProjectId: () => string | null
  poll: PollCache
}

const newId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 8)}`

/** 克隆目录安全名（过滤路径分隔符与 ..） */
function safeName(raw: string): string {
  const base = path.basename(raw.replace(/\\/g, '/')).replace(/\.git$/, '')
  const cleaned = base.replace(/[^0-9a-zA-Z._-]/g, '_')
  return cleaned || 'repo'
}

export function register(router: import('../http/router').Router, services: RepoServices): void {
  router.post('/api/projects/:id/repos', async (ctx: Ctx) => {
    if (services.lockedProjectId() === ctx.params.id) {
      throw apiError(409, 'PUBLISH_RUNNING', '该项目正在发布中，禁止修改仓库')
    }
    const body = (await readJsonBody(ctx.req)) as Record<string, unknown>
    const cfg = await services.loadCfg()
    const project = cfg.projects.find(p => p.id === ctx.params.id)
    if (!project) throw apiError(404, 'NOT_FOUND', `项目不存在: ${ctx.params.id}`)

    const hasPath = typeof body.path === 'string' && body.path.trim() !== ''
    const hasUrl = typeof body.url === 'string' && body.url.trim() !== ''
    if (hasPath === hasUrl) {
      throw apiError(400, 'VALIDATION', '必须且只能提供 path（本地路径）或 url（git 地址克隆）之一')
    }

    if (hasPath) {
      // 方式 A：本地路径
      const repoPath = path.resolve(String(body.path))
      if (!fs.existsSync(repoPath) || !fs.statSync(repoPath).isDirectory()) {
        throw apiError(400, 'REPO_INVALID', `路径不存在或不是目录: ${repoPath}`)
      }
      if (!(await git.isRepo(repoPath))) {
        throw apiError(400, 'REPO_INVALID', `不是有效的 git 仓库（缺少 .git）: ${repoPath}`)
      }
      const existing = project.repos.find(r => path.resolve(r.path) === repoPath)
      if (existing) {
        sendJson(ctx.res, 200, existing) // 幂等接入
        return
      }
      const remote = await git.remoteUrl(repoPath)
      const repo: RepoDef = {
        id: newId('r'),
        name: typeof body.name === 'string' && body.name.trim() ? String(body.name).trim() : path.basename(repoPath),
        path: repoPath,
        remote: remote || undefined,
        outputDir: 'public',
        writeVersionFile: true,
        lastPublishCommit: null,
        createdAt: new Date().toISOString(),
      }
      project.repos.push(repo)
      await services.saveCfg(cfg)
      sendJson(ctx.res, 201, repo)
      return
    }

    // 方式 B：git 地址克隆
    const cloneReq: CloneRequest = {
      url: String(body.url),
      name: typeof body.name === 'string' ? String(body.name).trim() : undefined,
      shallow: body.shallow === true,
    }
    const name = safeName(cloneReq.name ?? cloneReq.url)
    const target = path.join(store.APP_DIR, 'repos', project.id, name)
    try {
      await git.clone(cloneReq.url, target, { shallow: cloneReq.shallow })
    } catch (e) {
      throw apiError(400, 'CLONE_FAILED', `克隆失败: ${(e as Error).message.split('\n')[0]}`)
    }
    const repo: RepoDef = {
      id: newId('r'),
      name: cloneReq.name || name,
      path: target,
      remote: cloneReq.url,
      outputDir: 'public',
      writeVersionFile: true,
      lastPublishCommit: null,
      createdAt: new Date().toISOString(),
    }
    project.repos.push(repo)
    await services.saveCfg(cfg)
    sendJson(ctx.res, 201, repo)
  })

  router.patch('/api/projects/:id/repos/:rid', async (ctx: Ctx) => {
    if (services.lockedProjectId() === ctx.params.id) {
      throw apiError(409, 'PUBLISH_RUNNING', '该项目正在发布中，禁止修改仓库')
    }
    const body = (await readJsonBody(ctx.req)) as Record<string, unknown>
    const cfg = await services.loadCfg()
    const project = cfg.projects.find(p => p.id === ctx.params.id)
    if (!project) throw apiError(404, 'NOT_FOUND', `项目不存在: ${ctx.params.id}`)
    const repo = project.repos.find(r => r.id === ctx.params.rid)
    if (!repo) throw apiError(404, 'NOT_FOUND', `仓库不存在: ${ctx.params.rid}`)

    if (body.name !== undefined) {
      const name = String(body.name).trim()
      if (!name) throw apiError(400, 'VALIDATION', 'name 不能为空')
      repo.name = name
    }
    if (body.buildCommand !== undefined) repo.buildCommand = String(body.buildCommand) || undefined
    if (body.outputDir !== undefined) repo.outputDir = String(body.outputDir) || 'public'
    if (body.writeVersionFile !== undefined) {
      if (typeof body.writeVersionFile !== 'boolean') throw apiError(400, 'VALIDATION', 'writeVersionFile 必须为布尔')
      repo.writeVersionFile = body.writeVersionFile
    }
    if (body.path !== undefined) {
      const repoPath = path.resolve(String(body.path))
      if (!fs.existsSync(repoPath) || !(await git.isRepo(repoPath))) {
        throw apiError(400, 'REPO_INVALID', `不是有效的 git 仓库: ${repoPath}`)
      }
      repo.path = repoPath
      repo.remote = (await git.remoteUrl(repoPath)) || undefined
    }
    await services.saveCfg(cfg)
    sendJson(ctx.res, 200, repo)
  })

  router.delete('/api/projects/:id/repos/:rid', async (ctx: Ctx) => {
    if (services.lockedProjectId() === ctx.params.id) {
      throw apiError(409, 'PUBLISH_RUNNING', '该项目正在发布中，禁止修改仓库')
    }
    const cfg = await services.loadCfg()
    const project = cfg.projects.find(p => p.id === ctx.params.id)
    if (!project) throw apiError(404, 'NOT_FOUND', `项目不存在: ${ctx.params.id}`)
    const idx = project.repos.findIndex(r => r.id === ctx.params.rid)
    if (idx === -1) throw apiError(404, 'NOT_FOUND', `仓库不存在: ${ctx.params.rid}`)
    const [repo] = project.repos.splice(idx, 1)
    await services.saveCfg(cfg)

    const purge = ctx.query.get('purge') === 'true'
    let purged = false
    const cloneRoot = path.resolve(store.APP_DIR, 'repos')
    if (purge && path.resolve(repo.path).startsWith(cloneRoot + path.sep)) {
      fs.rmSync(repo.path, { recursive: true, force: true })
      purged = true
    }
    sendJson(ctx.res, 200, { ok: true, purged })
  })

  router.get('/api/repos/:pid/:rid/status', async (ctx: Ctx) => {
    const cfg = await services.loadCfg()
    const project = cfg.projects.find(p => p.id === ctx.params.pid)
    if (!project) throw apiError(404, 'NOT_FOUND', `项目不存在: ${ctx.params.pid}`)
    const repo = project.repos.find(r => r.id === ctx.params.rid)
    if (!repo) throw apiError(404, 'NOT_FOUND', `仓库不存在: ${ctx.params.rid}`)
    const fresh = ctx.query.get('fresh') === 'true'
    try {
      const status = await services.poll.get(repo, { fresh })
      sendJson(ctx.res, 200, status)
    } catch (e) {
      throw apiError(400, 'REPO_INVALID', `仓库状态读取失败: ${(e as Error).message}`)
    }
  })
}
