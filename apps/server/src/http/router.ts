// apps/server/src/http/router.ts
// 轻量路由：方法 + 路径模式（:param）注册与分发

import type { IncomingMessage, ServerResponse } from 'node:http'
import { sendError } from './json'

export interface Ctx {
  req: IncomingMessage
  res: ServerResponse
  /** 路径参数（如 :id） */
  params: Record<string, string>
  query: URLSearchParams
  body: unknown
}

type Handler = (ctx: Ctx) => Promise<void> | void

interface Route {
  method: string
  segments: string[]
  handler: Handler
}

export class Router {
  private routes: Route[] = []

  add(method: string, pattern: string, handler: Handler): void {
    this.routes.push({ method, segments: pattern.split('/').filter(Boolean), handler })
  }

  get(pattern: string, handler: Handler): void {
    this.add('GET', pattern, handler)
  }

  post(pattern: string, handler: Handler): void {
    this.add('POST', pattern, handler)
  }

  patch(pattern: string, handler: Handler): void {
    this.add('PATCH', pattern, handler)
  }

  put(pattern: string, handler: Handler): void {
    this.add('PUT', pattern, handler)
  }

  delete(pattern: string, handler: Handler): void {
    this.add('DELETE', pattern, handler)
  }

  /** 匹配路由；无匹配返回 { methodMismatch } 供 404/405 区分 */
  match(method: string, pathname: string): { route?: Route; params?: Record<string, string>; methodMismatch: boolean } {
    const segments = pathname.split('/').filter(Boolean)
    let methodMismatch = false
    for (const route of this.routes) {
      if (route.segments.length !== segments.length) continue
      const params: Record<string, string> = {}
      let ok = true
      for (let i = 0; i < segments.length; i++) {
        const rs = route.segments[i]
        if (rs.startsWith(':')) {
          params[rs.slice(1)] = decodeURIComponent(segments[i])
        } else if (rs !== segments[i]) {
          ok = false
          break
        }
      }
      if (!ok) continue
      if (route.method !== method) {
        methodMismatch = true
        continue
      }
      return { route, params, methodMismatch: false }
    }
    return { methodMismatch }
  }

  /** 分发请求；命中路由则由 handler 处理，否则 404/405 */
  async dispatch(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<boolean> {
    const { route, params, methodMismatch } = this.match(req.method ?? 'GET', pathname)
    if (!route) {
      if (methodMismatch) {
        res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8', Allow: 'GET, POST, PATCH, DELETE' })
        res.end(JSON.stringify({ error: '方法不允许', code: 'METHOD_NOT_ALLOWED' }))
      } else {
        sendError(res, Object.assign(new Error('接口不存在'), { status: 404, code: 'NOT_FOUND' }))
      }
      return false
    }
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const ctx: Ctx = { req, res, params: params ?? {}, query: url.searchParams, body: undefined }
    await route.handler(ctx)
    return true
  }
}
