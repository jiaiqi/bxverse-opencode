// apps/server/src/api/publish.ts
// POST /api/publish（dry-run 预览 / 执行入队）+ GET /api/publish/current

import type { AppConfig, PublishRequest } from '@bxverse/shared'
import { engine } from '@bxverse/core'
import type { Ctx } from '../http/router'
import { apiError, readJsonBody, sendJson, sendJsonGzip } from '../http/json'
import type { PublishQueue } from '../queue'

export function register(
  router: import('../http/router').Router,
  services: { loadCfg: () => Promise<AppConfig>; queue: PublishQueue },
): void {
  router.post('/api/publish', async (ctx: Ctx) => {
    const body = (await readJsonBody(ctx.req)) as Record<string, unknown>
    const req = validateRequest(body)

    const cfg = await services.loadCfg()
    const project = cfg.projects.find(p => p.id === req.projectId)
    if (!project) throw apiError(404, 'NOT_FOUND', `项目不存在: ${req.projectId}`)

    if (req.dryRun) {
      try {
        const plan = await engine.planPublish(req)
        sendJsonGzip(ctx.res, 200, plan, ctx.req)
      } catch (e) {
        const msg = (e as Error).message
        // TODO(A1): 字符串嗅探分类待 CoreError 体系收敛（F2 范围内不改，仅加注释）
        if (msg.includes('仓库')) throw apiError(400, 'VALIDATION', msg)
        throw apiError(500, 'GIT_FAILED', `计划生成失败: ${msg}`)
      }
      return
    }

    try {
      const taskId = await services.queue.submit(req)
      sendJson(ctx.res, 202, { taskId, queued: true })
    } catch (e) {
      const err = e as { status?: number; code?: string; message?: string }
      if (err.status === 409) {
        sendJson(ctx.res, 409, { error: err.message, code: 'TASK_BUSY', queueLength: 1 })
        return
      }
      throw e
    }
  })

  router.get('/api/publish/current', async (ctx: Ctx) => {
    const cur = services.queue.current
    if (!cur) {
      sendJson(ctx.res, 200, { taskId: null })
      return
    }
    sendJson(ctx.res, 200, { taskId: cur.taskId, status: cur.status, projectId: cur.projectId })
  })
}

function validateRequest(body: Record<string, unknown>): PublishRequest {
  const projectId = String(body.projectId ?? '')
  if (!projectId) throw apiError(400, 'VALIDATION', 'projectId 必填')
  const bump = body.bump ?? 'auto'
  if (!['major', 'minor', 'patch', 'auto'].includes(String(bump))) {
    throw apiError(400, 'VALIDATION', 'bump 必须为 major/minor/patch/auto')
  }
  let repoIds: string[] | undefined
  if (body.repoIds !== undefined && body.repoIds !== null) {
    if (!Array.isArray(body.repoIds) || body.repoIds.some(x => typeof x !== 'string')) {
      throw apiError(400, 'VALIDATION', 'repoIds 必须为字符串数组')
    }
    repoIds = body.repoIds as string[]
  }
  let excludeCommits: Record<string, string[]> | undefined
  if (body.excludeCommits !== undefined && body.excludeCommits !== null) {
    const raw = body.excludeCommits as Record<string, unknown>
    if (typeof raw !== 'object' || Object.values(raw).some(v => !Array.isArray(v) || v.some(x => typeof x !== 'string'))) {
      throw apiError(400, 'VALIDATION', 'excludeCommits 必须为 { repoId: string[] }')
    }
    excludeCommits = raw as Record<string, string[]>
  }
  return {
    projectId,
    bump: bump as PublishRequest['bump'],
    repoIds,
    excludeCommits,
    skipBuild: body.skipBuild === true,
    offline: body.offline === true,
    dryRun: body.dryRun === true,
    backupSource: body.backupSource === true,
    backupArtifacts: body.backupArtifacts === true,
    externalContent: typeof body.externalContent === 'string' ? body.externalContent : undefined,
    internalContent: typeof body.internalContent === 'string' ? body.internalContent : undefined,
  }
}
