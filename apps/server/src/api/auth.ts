// apps/server/src/api/auth.ts
// POST /api/auth/rotate：轮换会话 token（需携带当前有效 token）

import { store } from '@bxverse/core'
import type { Ctx } from '../http/router'
import { sendJson } from '../http/json'

export function register(
  router: import('../http/router').Router,
  services: { rotateToken: () => Promise<string> },
): void {
  router.post('/api/auth/rotate', async (ctx: Ctx) => {
    const token = await services.rotateToken()
    sendJson(ctx.res, 200, { token })
  })
}

/** 轮换实现：生成新 token、原子落盘、返回新值（旧 token 立即失效） */
export async function rotateToken(): Promise<string> {
  const cred = await store.loadCredentials()
  cred.token = store.generateToken()
  await store.saveCredentials(cred)
  return cred.token
}
