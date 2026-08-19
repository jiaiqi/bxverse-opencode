// apps/server/src/http/auth.ts
// 鉴权：X-BX-Token 恒时比对 + Origin 白名单 + Content-Type 校验（api.md §1.3）

import type { IncomingMessage } from 'node:http'
import { createHash, timingSafeEqual } from 'node:crypto'
import { apiError } from './json'

/** Origin 白名单：http://127.0.0.1:* 或 http://localhost:* */
const ORIGIN_RE = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/

export interface AuthContext {
  token: string
}

export function originAllowed(origin: string | undefined): boolean {
  if (!origin) return true
  return ORIGIN_RE.test(origin)
}

/**
 * 鉴权中间件。规则（api.md §1.3）：
 * - 所有请求（GET /api/config 除外）必须携带合法 X-BX-Token，否则 401
 * - 非 GET：Origin 存在时必须命中白名单；Content-Type 必须 application/json
 */
export function authenticate(
  req: IncomingMessage,
  auth: AuthContext,
  opts: { skipToken?: boolean } = {},
): void {
  const method = req.method ?? 'GET'
  const provided = req.headers['x-bx-token'] as string | undefined
  const origin = req.headers.origin as string | undefined

  // 1. token 校验
  const tokenOk = !!provided && !!auth.token && timingSafeCompare(provided, auth.token)
  if (!tokenOk && !opts.skipToken) {
    throw apiError(401, 'UNAUTHORIZED', '缺少或非法的 X-BX-Token')
  }

  // 2. 非 GET 的 Origin / Content-Type 双重校验
  if (method !== 'GET' && method !== 'HEAD') {
    if (!originAllowed(origin)) {
      throw apiError(403, 'FORBIDDEN', 'Origin 不在白名单内')
    }
    const ct = (req.headers['content-type'] ?? '').split(';')[0].trim()
    if (ct !== 'application/json') {
      throw apiError(403, 'FORBIDDEN', 'Content-Type 必须为 application/json')
    }
  }
}

/** 恒时字符串比较（长度差异恒时化） */
export function timingSafeCompare(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a, 'utf8').digest()
  const hb = createHash('sha256').update(b, 'utf8').digest()
  return timingSafeEqual(ha, hb)
}
