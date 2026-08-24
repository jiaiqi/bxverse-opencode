// apps/server/src/api/repos.ts
// 仓库接入（本地路径 / git 克隆）、仓库定义更新、仓库状态

import fs from 'node:fs'
import path from 'node:path'
import type { AppConfig, CloneRequest, RepoDef } from '@bxverse/shared'
import { git, store } from '@bxverse/core'
import type { Ctx } from '../http/router'
import { apiError, readJsonBody, sendJson } from '../http/json'
import type { PollCache } from '../poll'
import type { WithCfg } from '../app'

export interface RepoServices {
  loadCfg: () => Promise<AppConfig>
  withCfg: WithCfg
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
      const result = await services.withCfg(async (cfg) => {
        const project = cfg.projects.find(p => p.id === ctx.params.id)
        if (!project) throw apiError(404, 'NOT_FOUND', `项目不存在: ${ctx.params.id}`)
        const existing = project.repos.find(r => path.resolve(r.path) === repoPath)
        if (existing) return { existing: true as const, repo: existing }
        const remote = await git.remoteUrl(repoPath)
        const repo: RepoDef = {
          id: newId('r'),
          name: typeof body.name === 'string' && body.name.trim() ? String(body.name).trim() : path.basename(repoPath),
          path: repoPath,
          remote: remote || undefined,
          updatePackageVersion: false,
          lastPublishCommit: null,
          createdAt: new Date().toISOString(),
        }
        project.repos.push(repo)
        return { existing: false as const, repo }
      })
      if (result.existing) {
        sendJson(ctx.res, 200, result.repo)
      } else {
        sendJson(ctx.res, 201, result.repo)
      }
      return
    }

    // 方式 B：git 地址克隆（M8 校验 + 120s 超时由 core git.clone 保证）
    const rawUrl = String(body.url).trim()
    if (!/^(https:\/\/|ssh:\/\/|git@)/.test(rawUrl)) {
      throw apiError(400, 'VALIDATION', 'url 仅允许 https://、ssh:// 或 git@ 前缀')
    }
    const cloneReq: CloneRequest = {
      url: rawUrl,
      name: typeof body.name === 'string' ? String(body.name).trim() : undefined,
      shallow: body.shallow === true,
    }
    // 预检查项目存在性（不持锁，正式写入前会在 withCfg 内二次校验）
    const preCfg = await services.loadCfg()
    const preProject = preCfg.projects.find(p => p.id === ctx.params.id)
    if (!preProject) throw apiError(404, 'NOT_FOUND', `项目不存在: ${ctx.params.id}`)
    const name = safeName(cloneReq.name ?? cloneReq.url)
    const target = path.join(store.APP_DIR, 'repos', ctx.params.id, name)
    try {
      await git.clone(cloneReq.url, target, { shallow: cloneReq.shallow })
    } catch (e) {
      throw apiError(400, 'CLONE_FAILED', `克隆失败: ${(e as Error).message.split('\n')[0]}`)
    }
    const repo = await services.withCfg(async (cfg) => {
      const project = cfg.projects.find(p => p.id === ctx.params.id)
      if (!project) throw apiError(404, 'NOT_FOUND', `项目不存在: ${ctx.params.id}`)
      const r: RepoDef = {
        id: newId('r'),
        name: cloneReq.name || name,
        path: target,
        remote: cloneReq.url,
        outputDir: 'public',
        writeVersionFile: true,
        lastPublishCommit: null,
        createdAt: new Date().toISOString(),
      }
      project.repos.push(r)
      return r
    })
    sendJson(ctx.res, 201, repo)
  })

  router.patch('/api/projects/:id/repos/:rid', async (ctx: Ctx) => {
    if (services.lockedProjectId() === ctx.params.id) {
      throw apiError(409, 'PUBLISH_RUNNING', '该项目正在发布中，禁止修改仓库')
    }
    const body = (await readJsonBody(ctx.req)) as Record<string, unknown>
    const repo = await services.withCfg(async (cfg) => {
      const project = cfg.projects.find(p => p.id === ctx.params.id)
      if (!project) throw apiError(404, 'NOT_FOUND', `项目不存在: ${ctx.params.id}`)
      const r = project.repos.find(x => x.id === ctx.params.rid)
      if (!r) throw apiError(404, 'NOT_FOUND', `仓库不存在: ${ctx.params.rid}`)

      if (body.name !== undefined) {
        const name = String(body.name).trim()
        if (!name) throw apiError(400, 'VALIDATION', 'name 不能为空')
        r.name = name
      }
      if (body.displayName !== undefined) {
        const displayName = String(body.displayName).trim()
        r.displayName = displayName || undefined
      }
      if (body.buildCommand !== undefined) r.buildCommand = String(body.buildCommand) || undefined
      if (body.outputDir !== undefined) r.outputDir = String(body.outputDir) || undefined
      if (body.updatePackageVersion !== undefined) {
        if (typeof body.updatePackageVersion !== 'boolean') throw apiError(400, 'VALIDATION', 'updatePackageVersion 必须为布尔')
        r.updatePackageVersion = body.updatePackageVersion
      }
      if (body.artifactDir !== undefined) {
        const dir = String(body.artifactDir).trim().replace(/\\/g, '/').replace(/^\/+/, '')
        if (dir.split('/').includes('..')) throw apiError(400, 'VALIDATION', 'artifactDir 必须是仓库内的相对目录（禁止 .. 越界）')
        r.artifactDir = dir || undefined
      }
      if (body.writeVersionFile !== undefined) {
        if (typeof body.writeVersionFile !== 'boolean') throw apiError(400, 'VALIDATION', 'writeVersionFile 必须为布尔')
        r.writeVersionFile = body.writeVersionFile
      }
      // 扩展 R26：仓库级构建流水线与 package.json 版本源
      if (body.versionSource !== undefined) {
        const v = String(body.versionSource)
        if (!['derived', 'packageJson'].includes(v)) throw apiError(400, 'VALIDATION', 'versionSource 必须为 derived/packageJson')
        r.versionSource = v as RepoDef['versionSource']
      }
      if (body.packageManager !== undefined) {
        const v = String(body.packageManager).trim()
        if (v === '') r.packageManager = undefined
        else {
          if (!['pnpm', 'npm', 'yarn', 'bun'].includes(v)) throw apiError(400, 'VALIDATION', 'packageManager 必须为 pnpm/npm/yarn/bun')
          r.packageManager = v as RepoDef['packageManager']
        }
      }
      if (body.installCommand !== undefined) {
        const v = String(body.installCommand)
        // 空字符串表示清除；skip 为显式跳过
        r.installCommand = v.trim() === '' ? undefined : v
      }
      if (body.preBuildCommand !== undefined) {
        const v = String(body.preBuildCommand)
        r.preBuildCommand = v.trim() === '' ? undefined : v
      }
      if (body.buildTimeoutMs !== undefined) {
        const n = Number(body.buildTimeoutMs)
        if (!Number.isInteger(n) || n < 1000 || n > 60 * 60 * 1000) throw apiError(400, 'VALIDATION', 'buildTimeoutMs 必须为 1000~3600000 的整数毫秒')
        r.buildTimeoutMs = n
      }
      if (body.versionSyncCommit !== undefined) {
        const v = String(body.versionSyncCommit)
        if (!['package', 'none'].includes(v)) throw apiError(400, 'VALIDATION', 'versionSyncCommit 必须为 package/none')
        r.versionSyncCommit = v as RepoDef['versionSyncCommit']
      }
      if (body.path !== undefined) {
        const repoPath = path.resolve(String(body.path))
        if (!fs.existsSync(repoPath) || !(await git.isRepo(repoPath))) {
          throw apiError(400, 'REPO_INVALID', `不是有效的 git 仓库: ${repoPath}`)
        }
        r.path = repoPath
        r.remote = (await git.remoteUrl(repoPath)) || undefined
      }
      return r
    })
    sendJson(ctx.res, 200, repo)
  })

  router.delete('/api/projects/:id/repos/:rid', async (ctx: Ctx) => {
    if (services.lockedProjectId() === ctx.params.id) {
      throw apiError(409, 'PUBLISH_RUNNING', '该项目正在发布中，禁止修改仓库')
    }
    const repo = await services.withCfg(async (cfg) => {
      const project = cfg.projects.find(p => p.id === ctx.params.id)
      if (!project) throw apiError(404, 'NOT_FOUND', `项目不存在: ${ctx.params.id}`)
      const idx = project.repos.findIndex(r => r.id === ctx.params.rid)
      if (idx === -1) throw apiError(404, 'NOT_FOUND', `仓库不存在: ${ctx.params.rid}`)
      const [r] = project.repos.splice(idx, 1)
      return r
    })

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
