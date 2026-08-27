// apps/server/src/api/publish.ts
// POST /api/publish（dry-run 预览 / 执行入队）+ GET /api/publish/current
// GET /api/publish/:taskId/failure —— M11 结构化失败诊断
// POST /api/publish/:taskId/rollback —— M11 回滚（仅删 bxverse 自产副作用）

import type { AppConfig, PublishRequest, FailedRepoReport } from '@bxverse/shared'
import { PRERELEASE_RE } from '@bxverse/shared'
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
      const plan = await engine.planPublish(req)
      sendJsonGzip(ctx.res, 200, plan, ctx.req)
      return
    }

    const taskId = await services.queue.submit(req)
    sendJson(ctx.res, 202, { taskId, queued: true })
  })

  router.get('/api/publish/current', async (ctx: Ctx) => {
    const cur = services.queue.current
    if (!cur) {
      sendJson(ctx.res, 200, { taskId: null })
      return
    }
    sendJson(ctx.res, 200, { taskId: cur.taskId, status: cur.status, projectId: cur.projectId })
  })

  // M11：失败结构化诊断
  router.get('/api/publish/:taskId/failure', async (ctx: Ctx) => {
    const taskId = ctx.params.taskId
    const task = services.queue.getTask(taskId)
    if (!task) throw apiError(404, 'NOT_FOUND', `任务不存在: ${taskId}`)
    // 优先：内存 task.events 中最后一次 error/repo-error 携带的 code/detail
    const failureEvents = task.events.filter(
      (e) => e.type === 'error' || e.type === 'repo-error',
    )
    const reports: FailedRepoReport[] = []
    const seen = new Set<string>()
    for (const e of failureEvents) {
      if (e.type !== 'repo-error' || !e.repoId) continue
      if (seen.has(e.repoId)) continue
      seen.add(e.repoId)
      reports.push({
        repoId: e.repoId,
        repoName: '', // 由前端从 projectsStore 反查
        code: e.code ?? 'BUILD_FAILED',
        message: e.message,
        head: e.detail?.head ?? '',
        target: e.detail?.target ?? '',
        lastPublishCommit: e.detail?.lastPublishCommit ?? null,
        tag: e.detail?.tag,
        tagTarget: e.detail?.tagTarget,
        tagSource: e.detail?.tagSource,
        suggestions: e.detail?.suggestions ?? [],
      })
    }
    // 兜底：若内存已无（任务滚动淘汰），从 dataStore 历史最近失败 release 重建
    if (reports.length === 0) {
      const cfg = await services.loadCfg()
      const project = cfg.projects.find((p) => p.id === task.projectId)
      if (project && task.failedRepos.length > 0) {
        for (const repoId of task.failedRepos) {
          reports.push({
            repoId,
            repoName: project.repos.find((x) => x.id === repoId)?.name ?? repoId,
            code: 'UNKNOWN',
            message: '历史失败记录，无法回溯结构化诊断',
            head: '',
            target: '',
            lastPublishCommit: null,
            suggestions: ['打开该项目历史发布审计核对', '可重发或人工介入'],
          })
        }
      }
    }
    sendJson(ctx.res, 200, {
      taskId,
      projectId: task.projectId,
      status: task.status,
      failedRepos: task.failedRepos,
      reports,
    })
  })

  // M11：回滚
  router.post('/api/publish/:taskId/rollback', async (ctx: Ctx) => {
    const taskId = ctx.params.taskId
    const task = services.queue.getTask(taskId)
    if (!task) throw apiError(404, 'NOT_FOUND', `任务不存在: ${taskId}`)
    if (task.status !== 'failed') {
      throw apiError(400, 'VALIDATION', `仅失败任务可回滚，当前状态: ${task.status}`)
    }
    const body = ((await readJsonBody(ctx.req)) ?? {}) as { repoIds?: string[] }
    const result = await engine.rollbackFailedPublish(task.projectId, taskId, {
      repoIds: Array.isArray(body.repoIds) ? body.repoIds : undefined,
    })
    sendJson(ctx.res, 200, { ok: true, ...result })
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
  let prerelease: string | undefined
  if (body.prerelease !== undefined && body.prerelease !== null) {
    const raw = String(body.prerelease).trim()
    if (raw !== '') {
      if (!PRERELEASE_RE.test(raw)) throw apiError(400, 'VALIDATION', `非法 prerelease: ${raw}`)
      prerelease = raw
    }
  }
  return {
    projectId,
    bump: bump as PublishRequest['bump'],
    prerelease,
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
