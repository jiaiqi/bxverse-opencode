// apps/server/src/api/openapi.ts
// 暴露契约 spec，供前端/测试拉取做契约校验

import { openApiSpec } from '../openapi'
import type { Ctx } from '../http/router'
import { sendJson } from '../http/json'

export function register(router: import('../http/router').Router): void {
  router.get('/api/openapi.json', async (ctx: Ctx) => {
    sendJson(ctx.res, 200, openApiSpec)
  })
}
