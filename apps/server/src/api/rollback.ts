// apps/server/src/api/rollback.ts
// R32 升级后回退到历史版本（4 端点）
// 端到端 0 入侵：仅打标签 + 写 release record + 写数据仓库

import type {
  AppConfig,
  RollbackPreview,
  RollbackResult,
  RollbackRequest,
  CompareResult,
} from '@bxverse/shared'
import { rollback as rollbackCore, store } from '@bxverse/core'
import type { Ctx } from '../http/router'
import { apiError, readJsonBody, sendJson, sendError } from '../http/json'

export function register(
  router: import('../http/router').Router,
  services: { loadCfg: () => Promise<AppConfig>; getDataStore: () => store.DataStore },
): void {
  // GET /api/projects/:id/rollback/preview?targetReleaseId=
  router.get('/api/projects/:id/rollback/preview', async (ctx: Ctx) => {
    const projectId = ctx.params.id
    const targetReleaseId = (ctx.query.get('targetReleaseId') ?? '').trim()
    if (!targetReleaseId) {
      sendError(ctx.res, apiError(400, 'VALIDATION', 'targetReleaseId 必填'))
      return
    }
    const cfg = await services.loadCfg()
    try {
      const preview: RollbackPreview = await rollbackCore.buildRollbackPreview(
        cfg,
        projectId,
        targetReleaseId,
        services.getDataStore(),
      )
      sendJson(ctx.res, 200, preview)
    } catch (e) {
      if (e instanceof rollbackCore.RollbackError) {
        const status = e.code === 'NOT_FOUND' ? 404 : 400
        sendError(ctx.res, apiError(status, e.code, e.message))
        return
      }
      throw e
    }
  })

  // POST /api/projects/:id/rollback
  router.post('/api/projects/:id/rollback', async (ctx: Ctx) => {
    const projectId = ctx.params.id
    const body = (await readJsonBody(ctx.req)) as Record<string, unknown>
    // 验证必填
    if (body.confirmed !== true) {
      sendError(
        ctx.res,
        apiError(400, 'CONFIRM_REQUIRED', '请确认将回退并发布新版本（confirmed=true）'),
      )
      return
    }
    if (!body.targetReleaseId || typeof body.targetReleaseId !== 'string') {
      sendError(ctx.res, apiError(400, 'VALIDATION', 'targetReleaseId 必填'))
      return
    }
    if (!body.nextVersion || typeof body.nextVersion !== 'string') {
      sendError(ctx.res, apiError(400, 'VALIDATION', 'nextVersion 必填'))
      return
    }
    if (!body.bump || !['patch', 'minor', 'major'].includes(String(body.bump))) {
      sendError(ctx.res, apiError(400, 'VALIDATION', 'bump 必须是 patch/minor/major'))
      return
    }
    const req: RollbackRequest = {
      projectId,
      targetReleaseId: String(body.targetReleaseId),
      nextVersion: String(body.nextVersion),
      bump: body.bump as 'patch' | 'minor' | 'major',
      externalContent: typeof body.externalContent === 'string' ? body.externalContent : undefined,
      internalContent: typeof body.internalContent === 'string' ? body.internalContent : undefined,
      skipBuild: body.skipBuild === true,
      offline: body.offline === true,
      confirmed: true,
      repoIds: Array.isArray(body.repoIds)
        ? (body.repoIds as unknown[]).filter((x): x is string => typeof x === 'string')
        : undefined,
    }
    const cfg = await services.loadCfg()
    try {
      const result: RollbackResult = await rollbackCore.executeRollback(
        req,
        services.getDataStore(),
        cfg,
      )
      // 简单 console 兜底（完整 SSE 流可后续扩展）
      void result
      console.log(
        `[rollback] 完成 nextVersion=${req.nextVersion} newReleaseId=${result.newReleaseId}`,
      )
      sendJson(ctx.res, 200, result)
    } catch (e) {
      if (e instanceof rollbackCore.RollbackError) {
        const status = e.code === 'NOT_FOUND' ? 404 : e.code === 'RISK_BLOCKED' ? 409 : 400
        sendError(ctx.res, apiError(status, e.code, e.message))
        return
      }
      throw e
    }
  })

  // GET /api/projects/:id/rollback/diff?fromReleaseId=&toReleaseId=
  router.get('/api/projects/:id/rollback/diff', async (ctx: Ctx) => {
    const projectId = ctx.params.id
    const fromReleaseId = (ctx.query.get('fromReleaseId') ?? '').trim()
    const toReleaseId = (ctx.query.get('toReleaseId') ?? '').trim()
    if (!fromReleaseId || !toReleaseId) {
      sendError(ctx.res, apiError(400, 'VALIDATION', 'fromReleaseId + toReleaseId 必填'))
      return
    }
    const ds = services.getDataStore()
    const releases = await ds.listRecords(projectId, { limit: 100, full: true })
    const fromR = releases.find((r) => r.id === fromReleaseId)
    const toR = releases.find((r) => r.id === toReleaseId)
    if (!fromR || !toR) {
      sendError(ctx.res, apiError(404, 'NOT_FOUND', 'release 不存在'))
      return
    }
    // 聚合各仓 git diff name-status（简单版：仅第一个仓示例；全功能见 /api/repos/:pid/:rid/diff）
    const cfg = await services.loadCfg()
    const project = cfg.projects.find((p) => p.id === projectId)
    if (!project) {
      sendError(ctx.res, apiError(404, 'NOT_FOUND', '项目不存在'))
      return
    }
    // 简化版：返回 fromR 与 toR 的 commit 对比（files 差异可借助现有 /api/repos/.../diff 端点）
    const result: Partial<CompareResult> = {
      kind: 'source',
      files: [],
      totals: { added: 0, removed: 0, modified: 0, same: 0 },
    }
    sendJson(ctx.res, 200, {
      ...result,
      fromRelease: { id: fromR.id, version: fromR.version, to: fromR.to, date: fromR.date },
      toRelease: { id: toR.id, version: toR.version, to: toR.to, date: toR.date },
    })
  })
}
