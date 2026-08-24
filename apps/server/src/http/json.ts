// apps/server/src/http/json.ts
// 请求体读取 / JSON 响应 / 统一错误封装 / gzip 大响应

import type { IncomingMessage, ServerResponse } from 'node:http'
import zlib from 'node:zlib'
import { CoreError, logger } from '@bxverse/core'
import { statusForCode } from './errors'

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
    const chunks: Buffer[] = []
    let byteLen = 0
    let over = false
    req.on('data', (chunk: Buffer) => {
      if (over) return
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      chunks.push(buf)
      byteLen += buf.length
      if (byteLen > MAX_BODY) {
        over = true
        chunks.length = 0
        byteLen = 0
        req.resume()
      }
    })
    req.on('end', () => {
      if (over) {
        reject(apiError(400, 'VALIDATION', `请求体超过 ${Math.round(MAX_BODY / 1024 / 1024)}MB 上限`))
        return
      }
      const data = Buffer.concat(chunks).toString('utf8')
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
 * 大响应（>256KB，如发布计划 13MB）在本地回环带宽不是瓶颈，跳过同步压缩
 * 以避免 gzipSync 阻塞事件循环数百 ms 导致 SSE 心跳停摆。
 */
const GZIP_THRESHOLD = 256 * 1024

export function sendJsonGzip(res: ServerResponse, status: number, data: unknown, req?: IncomingMessage): void {
  const body = JSON.stringify(data)
  const byteLen = Buffer.byteLength(body)
  const accept = (req?.headers['accept-encoding'] as string) ?? ''
  if (byteLen > 4096 && byteLen < GZIP_THRESHOLD && accept.includes('gzip')) {
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
  let status: number
  let code: string
  let message: string
  let detail: Record<string, unknown> | undefined
  if (err instanceof CoreError) {
    status = statusForCode(err.code)
    // 若 CoreError 携带显式 status（如 apiError 转 CoreError），优先使用 detail.status
    const maybeStatus = (err.detail as { status?: number } | undefined)?.status
    if (typeof maybeStatus === 'number') status = maybeStatus
    code = err.code
    message = err.message
    detail = err.detail
  } else {
    const e = err as Partial<ApiError> & Error
    status = e.status ?? 500
    code = e.code ?? 'INTERNAL'
    message = e.message ?? '未预期错误'
  }
  const req = (res as unknown as { req?: IncomingMessage }).req
  const method = req?.method ?? '-'
  let path = '-'
  try {
    const rawUrl = req?.url ?? ''
    path = rawUrl ? new URL(rawUrl, 'http://127.0.0.1').pathname : '-'
  } catch {
    path = req?.url ?? '-'
  }
  try {
    const fields: Record<string, unknown> = { method, path, status, code, message }
    if (detail) fields.detail = detail
    if (err instanceof CoreError) fields.coreCode = code
    logger.structuredLog('error', message, fields)
  } catch {
    // ignore logger failure
  }
  if (res.headersSent || res.writableEnded) return
  try {
    sendJson(res, status, { error: message, code })
  } catch {
    try {
      res.destroy()
    } catch {
      // ignore
    }
  }
}
