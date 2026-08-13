// apps/server/src/api/files.ts
// 目录树懒加载 / 文件内容读取

import type { AppConfig } from '@bxverse/shared'
import { files } from '@bxverse/core'
import type { Ctx } from '../http/router'
import { apiError, sendJson } from '../http/json'

export function register(router: import('../http/router').Router, services: { loadCfg: () => Promise<AppConfig> }): void {
  router.get('/api/repos/:pid/:rid/tree', async (ctx: Ctx) => {
    const repo = await findRepo(services, ctx.params.pid, ctx.params.rid)
    const dirPath = ctx.query.get('path') ?? ''
    try {
      sendJson(ctx.res, 200, files.listTree(repo.path, dirPath))
    } catch (e) {
      const msg = (e as Error).message
      if (msg.includes('越界')) throw apiError(400, 'VALIDATION', msg)
      if (msg.includes('不存在')) throw apiError(404, 'NOT_FOUND', msg)
      throw apiError(400, 'REPO_INVALID', msg)
    }
  })

  router.get('/api/repos/:pid/:rid/file', async (ctx: Ctx) => {
    const repo = await findRepo(services, ctx.params.pid, ctx.params.rid)
    const filePath = ctx.query.get('path')
    if (!filePath) throw apiError(400, 'VALIDATION', '缺少必填参数 path')
    try {
      sendJson(ctx.res, 200, files.readFileContent(repo.path, filePath))
    } catch (e) {
      const msg = (e as Error).message
      if (msg.includes('越界')) throw apiError(400, 'VALIDATION', msg)
      if (msg.includes('不存在') || msg.includes('是目录')) throw apiError(404, 'NOT_FOUND', msg)
      throw apiError(400, 'REPO_INVALID', msg)
    }
  })
}

async function findRepo(services: { loadCfg: () => Promise<AppConfig> }, pid: string, rid: string) {
  const cfg = await services.loadCfg()
  const project = cfg.projects.find(p => p.id === pid)
  if (!project) throw apiError(404, 'NOT_FOUND', `项目不存在: ${pid}`)
  const repo = project.repos.find(r => r.id === rid)
  if (!repo) throw apiError(404, 'NOT_FOUND', `仓库不存在: ${rid}`)
  return repo
}
