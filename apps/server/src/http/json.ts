// apps/server/src/http/json.ts
// 请求体读取 / JSON 响应 / 统一错误封装

import type { IncomingMessage, ServerResponse } from 'node:http'

const MAX_BODY = 1024 * 1024

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

/** 读取 JSON 请求体（1MB 上限；非 JSON 或超限抛 400 VALIDATION） */
export function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = ''
    let over = false
    req.on('data', (chunk: Buffer) => {
      data += chunk.toString('utf8')
      if (data.length > MAX_BODY) {
        over = true
        req.destroy()
        reject(apiError(400, 'VALIDATION', '请求体超过 1MB 上限'))
      }
    })
    req.on('end', () => {
      if (over) return
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

/** 统一错误响应 { error, code }（api.md §1.2） */
export function sendError(res: ServerResponse, err: unknown): void {
  const e = err as Partial<ApiError> & Error
  const status = e.status ?? 500
  const code = e.code ?? 'INTERNAL'
  const message = e.message ?? '未预期错误'
  sendJson(res, status, { error: message, code })
}
