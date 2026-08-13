// apps/server/src/api/sync.ts
// POST /api/sync —— 数据仓库 pull/push/commit/status/set-remote

import { git, store } from '@bxverse/core'
import type { Ctx } from '../http/router'
import { apiError, readJsonBody, sendJson } from '../http/json'

export function register(
  router: import('../http/router').Router,
  services: { dataStore: store.DataStore },
): void {
  router.post('/api/sync', async (ctx: Ctx) => {
    const body = (await readJsonBody(ctx.req)) as Record<string, unknown>
    const action = String(body.action ?? '')
    const ds = services.dataStore

    if (action === 'set-remote') {
      const url = body.url === null || body.url === undefined ? null : String(body.url)
      if (url && !['https://', 'ssh://', 'git@'].some(p => url.startsWith(p))) {
        throw apiError(400, 'VALIDATION', 'url 仅支持 https://、ssh://、git@ 协议')
      }
      const cred = await store.loadCredentials()
      cred.dataRemote = url
      await store.saveCredentials(cred)
      // 同步到 data/ 仓库的 git remote 配置
      const has = (await git.git(['remote', 'get-url', 'origin'], { cwd: ds.dataDir })).ok
      if (url && !has) {
        git.ensureOk(await git.git(['remote', 'add', 'origin', url], { cwd: ds.dataDir }))
      } else if (url && has) {
        git.ensureOk(await git.git(['remote', 'set-url', 'origin', url], { cwd: ds.dataDir }))
      } else if (!url && has) {
        git.ensureOk(await git.git(['remote', 'remove', 'origin'], { cwd: ds.dataDir }))
      }
      sendJson(ctx.res, 200, { ok: true, action: 'set-remote', remote: url })
      return
    }

    if (!['pull', 'push', 'commit', 'status'].includes(action)) {
      throw apiError(400, 'VALIDATION', 'action 必须为 pull/push/commit/status/set-remote')
    }

    try {
      if (action === 'commit') {
        const hash = await ds.commitRecords(typeof body.message === 'string' ? body.message : 'chore: manual commit')
        sendJson(ctx.res, 200, { ok: true, action, hash })
        return
      }
      const result = await ds.syncDataRepo(action as 'pull' | 'push' | 'status')
      if (action === 'pull' && !result.ok && /non-fast-forward|refusing/i.test(result.message ?? '')) {
        throw apiError(409, 'SYNC_CONFLICT', `拉取冲突：请人工解决数据仓库的分叉后重试（${result.message}）`)
      }
      sendJson(ctx.res, 200, { ...result })
    } catch (e) {
      const err = e as { status?: number; code?: string; message?: string }
      if (err.status) throw e
      throw apiError(500, 'GIT_FAILED', `同步失败: ${err.message ?? String(e)}`)
    }
  })
}
