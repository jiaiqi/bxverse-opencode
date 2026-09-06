// apps/server/src/api/registry.ts
// R33 阶段 2 · 全局仓库注册表（GET/PUT /api/repos-registry）
// + 项目挂载 attach/detach（POST /api/projects/:id/repos/attach|detach）
// 首次挂载编辑时把项目内嵌仓库迁移进注册表（repoRefs 覆盖全部挂载），引擎语义零变化

import type { AppConfig, ProjectDef, RepoDef } from '@bxverse/shared'
import type { Ctx } from '../http/router'
import { apiError, readJsonBody, sendJson } from '../http/json'
import type { ProjectServices } from './projects'

const newId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 8)}`
const normPath = (p: string) => p.replaceAll('\\', '/')

/** 校验注册表条目（id/name/path 必填且 id 全局唯一） */
function validateRegistry(raw: unknown): RepoDef[] {
  if (!Array.isArray(raw)) throw apiError(400, 'VALIDATION', 'registry 必须为数组')
  const seen = new Set<string>()
  return raw.map((entry) => {
    const e = entry as Record<string, unknown>
    const id = typeof e.id === 'string' ? e.id.trim() : ''
    const name = typeof e.name === 'string' ? e.name.trim() : ''
    const p = typeof e.path === 'string' ? e.path.trim() : ''
    if (!id || !name || !p) throw apiError(400, 'VALIDATION', 'registry 条目需含 id/name/path')
    if (seen.has(id)) throw apiError(400, 'VALIDATION', `registry id 重复: ${id}`)
    seen.add(id)
    return { ...e, id, name, path: p } as RepoDef
  })
}

/** 规范化 path 便于跨平台归并 */
function normalizeRepo(r: RepoDef): RepoDef {
  return { ...r, path: normPath(r.path) }
}

/**
 * 首次挂载编辑时迁移：把项目内嵌 repos 全量注册进全局表（按 path 归并复用），
 * repoRefs 覆盖全部挂载；此后项目 repos 完全由 refs 展开。
 */
function ensureProjectRefs(cfg: AppConfig, project: ProjectDef): void {
  if (project.repoRefs) return
  const reg = cfg.repoRegistry ?? []
  const ids: string[] = []
  for (const r of project.repos) {
    const key = normPath(r.path)
    let hit = reg.find((x) => normPath(x.path) === key)
    if (!hit) {
      hit = normalizeRepo(r)
      reg.push(hit)
    }
    ids.push(hit.id)
  }
  cfg.repoRegistry = reg
  project.repoRefs = ids
}

function materialize(cfg: AppConfig, project: ProjectDef): void {
  const reg = cfg.repoRegistry ?? []
  project.repos = (project.repoRefs ?? [])
    .map((id) => reg.find((r) => r.id === id))
    .filter((r): r is RepoDef => !!r)
}

export function register(router: import('../http/router').Router, services: ProjectServices): void {
  router.get('/api/repos-registry', async (ctx: Ctx) => {
    const cfg = await services.loadCfg()
    sendJson(ctx.res, 200, { registry: cfg.repoRegistry ?? [] })
  })

  router.put('/api/repos-registry', async (ctx: Ctx) => {
    const body = (await readJsonBody(ctx.req)) as Record<string, unknown>
    const registry = validateRegistry(body.registry)
    const saved = await services.withCfg(async (cfg) => {
      cfg.repoRegistry = registry
      return cfg.repoRegistry
    })
    sendJson(ctx.res, 200, { registry: saved })
  })

  router.post('/api/projects/:id/repos/attach', async (ctx: Ctx) => {
    if (services.lockedProjectId() === ctx.params.id)
      throw apiError(409, 'PUBLISH_RUNNING', '该项目发布任务执行中，暂不能调整挂载')
    const body = (await readJsonBody(ctx.req)) as Record<string, unknown>
    const repoId = typeof body.repoId === 'string' ? body.repoId.trim() : ''
    const p = typeof body.path === 'string' ? body.path.trim() : ''
    if (!repoId && !p) throw apiError(400, 'VALIDATION', 'repoId 或 path 必填其一')
    const project = await services.withCfg(async (cfg) => {
      const proj = cfg.projects.find((x) => x.id === ctx.params.id)
      if (!proj) throw apiError(404, 'NOT_FOUND', `项目不存在: ${ctx.params.id}`)
      ensureProjectRefs(cfg, proj)
      const reg = (cfg.repoRegistry ??= [])
      let target = repoId ? reg.find((r) => r.id === repoId) : undefined
      if (!target && p) {
        // 按 path 归并：已存在复用；不存在注册新条目
        target = reg.find((r) => normPath(r.path) === normPath(p))
        if (!target) {
          target = {
            id: newId('r'),
            name:
              typeof body.name === 'string' && body.name.trim() ? body.name.trim() : pathBase(p),
            path: normPath(p),
          }
          reg.push(target)
        }
      }
      if (!target) throw apiError(404, 'NOT_FOUND', `注册表仓库不存在: ${repoId}`)
      if (!proj.repoRefs!.includes(target.id)) proj.repoRefs!.push(target.id)
      materialize(cfg, proj)
      return proj
    })
    sendJson(ctx.res, 200, project)
  })

  router.post('/api/projects/:id/repos/detach', async (ctx: Ctx) => {
    if (services.lockedProjectId() === ctx.params.id)
      throw apiError(409, 'PUBLISH_RUNNING', '该项目发布任务执行中，暂不能调整挂载')
    const body = (await readJsonBody(ctx.req)) as Record<string, unknown>
    const repoId = typeof body.repoId === 'string' ? body.repoId.trim() : ''
    const p = typeof body.path === 'string' ? body.path.trim() : ''
    if (!repoId && !p) throw apiError(400, 'VALIDATION', 'repoId 或 path 必填其一')
    const project = await services.withCfg(async (cfg) => {
      const proj = cfg.projects.find((x) => x.id === ctx.params.id)
      if (!proj) throw apiError(404, 'NOT_FOUND', `项目不存在: ${ctx.params.id}`)
      ensureProjectRefs(cfg, proj)
      const reg = cfg.repoRegistry ?? []
      const target = repoId
        ? reg.find((r) => r.id === repoId)
        : reg.find((r) => normPath(r.path) === normPath(p))
      if (!target) throw apiError(404, 'NOT_FOUND', '注册表中未找到该仓库')
      proj.repoRefs = proj.repoRefs!.filter((id) => id !== target.id)
      materialize(cfg, proj)
      return proj
    })
    sendJson(ctx.res, 200, project)
  })
}

function pathBase(p: string): string {
  const parts = normPath(p).split('/').filter(Boolean)
  return parts[parts.length - 1] ?? 'repo'
}
