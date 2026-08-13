// apps/server/src/api/projects.ts
// 项目 CRUD（GET/POST /api/projects、PATCH/DELETE /api/projects/:id）

import type { AppConfig, ProjectDef } from '@bxverse/shared'
import { COMMIT_TYPES, DEFAULT_EXTERNAL_EXCLUDE } from '@bxverse/shared'
import { store } from '@bxverse/core'
import fs from 'node:fs'
import path from 'node:path'
import type { Ctx } from '../http/router'
import { apiError, readJsonBody, sendJson } from '../http/json'

export interface ProjectServices {
  loadCfg: () => Promise<AppConfig>
  saveCfg: (cfg: AppConfig) => Promise<void>
  lockedProjectId: () => string | null
}

const newId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 8)}`

export function register(router: import('../http/router').Router, services: ProjectServices): void {
  router.get('/api/projects', async (ctx: Ctx) => {
    const cfg = await services.loadCfg()
    sendJson(ctx.res, 200, cfg.projects)
  })

  router.post('/api/projects', async (ctx: Ctx) => {
    // 任一项目发布中：全局禁止新建（api.md §5.2 简化锁粒度）
    if (services.lockedProjectId()) throw apiError(409, 'PUBLISH_RUNNING', '有发布任务执行中，暂不能新建项目')
    const body = (await readJsonBody(ctx.req)) as Record<string, unknown>
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) throw apiError(400, 'VALIDATION', 'name 必填')
    const cfg = await services.loadCfg()
    if (cfg.projects.some(p => p.name === name)) throw apiError(400, 'VALIDATION', `项目重名: ${name}`)
    const project: ProjectDef = {
      id: newId('p'),
      name,
      description: typeof body.description === 'string' ? body.description : undefined,
      version: 'v0.1.0',
      bump: 'auto',
      repoVersionScheme: 'hybrid',
      externalExclude: [...DEFAULT_EXTERNAL_EXCLUDE],
      repos: [],
      createdAt: new Date().toISOString(),
    }
    cfg.projects.push(project)
    await services.saveCfg(cfg)
    sendJson(ctx.res, 201, project)
  })

  router.patch('/api/projects/:id', async (ctx: Ctx) => {
    if (services.lockedProjectId() === ctx.params.id) {
      throw apiError(409, 'PUBLISH_RUNNING', '该项目正在发布中，禁止修改项目定义')
    }
    const body = (await readJsonBody(ctx.req)) as Record<string, unknown>
    const cfg = await services.loadCfg()
    const project = cfg.projects.find(p => p.id === ctx.params.id)
    if (!project) throw apiError(404, 'NOT_FOUND', `项目不存在: ${ctx.params.id}`)

    if (body.name !== undefined) {
      const name = String(body.name).trim()
      if (!name) throw apiError(400, 'VALIDATION', 'name 不能为空')
      if (cfg.projects.some(p => p.name === name && p.id !== project.id)) {
        throw apiError(400, 'VALIDATION', `项目重名: ${name}`)
      }
      project.name = name
    }
    if (body.description !== undefined) project.description = String(body.description)
    if (body.bump !== undefined) {
      if (!['auto', 'manual'].includes(String(body.bump))) {
        throw apiError(400, 'VALIDATION', 'bump 必须为 auto/manual')
      }
      project.bump = body.bump as ProjectDef['bump']
    }
    if (body.repoVersionScheme !== undefined) {
      if (!['hybrid', 'timestamp'].includes(String(body.repoVersionScheme))) {
        throw apiError(400, 'VALIDATION', 'repoVersionScheme 必须为 hybrid/timestamp')
      }
      project.repoVersionScheme = body.repoVersionScheme as ProjectDef['repoVersionScheme']
    }
    if (body.externalExclude !== undefined) {
      const arr = body.externalExclude as unknown[]
      if (!Array.isArray(arr) || arr.some(t => !(COMMIT_TYPES as string[]).includes(String(t)))) {
        throw apiError(400, 'VALIDATION', `externalExclude 必须是提交类型子集（${COMMIT_TYPES.join('/')}）`)
      }
      project.externalExclude = arr as ProjectDef['externalExclude']
    }

    project.updatedAt = new Date().toISOString()
    await services.saveCfg(cfg)
    sendJson(ctx.res, 200, project)
  })

  router.delete('/api/projects/:id', async (ctx: Ctx) => {
    if (services.lockedProjectId() === ctx.params.id) {
      throw apiError(409, 'PUBLISH_RUNNING', '该项目正在发布中，禁止删除')
    }
    const cfg = await services.loadCfg()
    const idx = cfg.projects.findIndex(p => p.id === ctx.params.id)
    if (idx === -1) throw apiError(404, 'NOT_FOUND', `项目不存在: ${ctx.params.id}`)
    cfg.projects.splice(idx, 1)
    await services.saveCfg(cfg)

    const purge = ctx.query.get('purge') === 'true'
    let purged = false
    if (purge) {
      const cloneRoot = path.join(store.APP_DIR, 'repos', ctx.params.id)
      if (fs.existsSync(cloneRoot)) {
        fs.rmSync(cloneRoot, { recursive: true, force: true })
        purged = true
      }
    }
    sendJson(ctx.res, 200, { ok: true, purged })
  })
}
