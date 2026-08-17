// apps/server/src/http/json.ts
// 请求体读取 / JSON 响应 / 统一错误封装 / gzip 大响应

import type { IncomingMessage, ServerResponse } from 'node:http'
import zlib from 'node:zlib'

const MAX_BODY = 32 * 1024 * 1024

export interface ApiError extends Error {
  status: number
  code: string
}

export function apiError(status: number, code: string, message: string): ApiError {
  const err = new Error(message) as ApiError
  err.status = status
  err.code = code
  return err
}

/** 读取 JSON 请求体（32MB 上限；非 JSON 或超限抛 400 VALIDATION）
 *  注意：超限时不得 req.destroy()——强关连接会让客户端收到 Failed to fetch；
 *  须 resume() 排空剩余流，待 end 后再 reject，由统一错误处理返回 400 JSON。 */
export function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = ''
    let over = false
    req.on('data', (chunk: Buffer) => {
      if (over) return
      data += chunk.toString('utf8')
      if (data.length > MAX_BODY) {
        over = true
        data = ''
        req.resume()
      }
    })
    req.on('end', () => {
      if (over) {
        reject(apiError(400, 'VALIDATION', `请求体超过 ${Math.round(MAX_BODY / 1024 / 1024)}MB 上限`))
        return
      }
      if (!data.trim()) {
        resolve({})
        return
      }
      try {
        const parsed = JSON.parse(data)
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          reject(apiError(400, 'VALIDATION', '请求体必须是 JSON 对象'))
          return
        }
        resolve(parsed)
      } catch {
        reject(apiError(400, 'VALIDATION', '请求体不是合法 JSON'))
      }
    })
    req.on('error', (e) => reject(apiError(400, 'VALIDATION', e.message)))
  })
}

export function sendJson(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  })
  res.end(body)
}

/**
 * gzip 版 sendJson：客户端支持 gzip 且响应体 > 4KB 时自动压缩。
 * 用于大响应（如发布计划 13MB→~1.5MB），其余小响应走 sendJson 即可。
 */
export function sendJsonGzip(res: ServerResponse, status: number, data: unknown, req?: IncomingMessage): void {
  const body = JSON.stringify(data)
  const byteLen = Buffer.byteLength(body)
  const accept = (req?.headers['accept-encoding'] as string) ?? ''
  if (byteLen > 4096 && accept.includes('gzip')) {
    const compressed = zlib.gzipSync(body, { level: 6 })
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': compressed.length,
      'Content-Encoding': 'gzip',
      'Cache-Control': 'no-store',
    })
    res.end(compressed)
  } else {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': byteLen,
      'Cache-Control': 'no-store',
    })
    res.end(body)
  }
}

/** 统一错误响应 { error, code }（api.md §1.2） */
export function sendError(res: ServerResponse, err: unknown): void {
  const e = err as Partial<ApiError> & Error
  const status = e.status ?? 500
  const code = e.code ?? 'INTERNAL'
  const message = e.message ?? '未预期错误'
  sendJson(res, status, { error: message, code })
}
