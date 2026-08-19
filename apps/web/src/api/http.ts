// apps/web/src/api/http.ts
// HTTP 客户端：token 注入、401 引导、错误归一、SSE 流式订阅

export class ApiError extends Error {
  code: string
  status: number
  constructor(code: string, status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

const TOKEN_KEY = 'bxverse-token'
let token: string = sessionStorage.getItem(TOKEN_KEY) ?? ''

export const getToken = (): string => token
export const setToken = (t: string): void => {
  token = t
  sessionStorage.setItem(TOKEN_KEY, t)
}

/** 引导：GET /api/config 拿 token */
export async function bootstrap(): Promise<boolean> {
  try {
    const res = await fetch('/api/config', { cache: 'no-store' })
    if (!res.ok) return false
    const data = (await res.json()) as { token: string }
    setToken(data.token)
    return true
  } catch {
    return false
  }
}

interface RequestOptions {
  body?: unknown
  skipRetry?: boolean
}

async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {}
  if (token) headers['X-BX-Token'] = token
  if (method !== 'GET' && method !== 'HEAD') headers['Content-Type'] = 'application/json'
  const payload = opts.body === undefined ? undefined : JSON.stringify(opts.body)
  const res = await fetch(`/api${path}`, { method, headers, body: payload, cache: 'no-store' })
  if (res.status === 401 && !opts.skipRetry) {
    if (await bootstrap()) return request<T>(method, path, { ...opts, skipRetry: true })
    throw new ApiError('UNAUTHORIZED', 401, '会话失效，请刷新页面重试')
  }
  if (!res.ok) {
    let body: { error?: string; code?: string } | null = null
    try { body = await res.json() as { error?: string; code?: string } } catch { body = null }
    throw new ApiError(body?.code ?? 'INTERNAL', res.status, body?.error ?? `请求失败（${res.status}）`)
  }
  if (res.status === 204) return undefined as T
  return await res.json() as T
}

export const http = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, { body }),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body }),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body }),
  del: <T>(path: string) => request<T>('DELETE', path),
}

export async function download(path: string): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(`/api${path}`, { headers: token ? { 'X-BX-Token': token } : {}, cache: 'no-store' })
  if (!res.ok) throw new ApiError('DOWNLOAD_FAILED', res.status, `下载失败（${res.status}）`)
  const cd = res.headers.get('Content-Disposition') ?? ''
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd)
  const filename = star ? decodeURIComponent(star[1]) : (/\bfilename="([^"]+)"/i.exec(cd)?.[1] ?? 'download.bin')
  return { blob: await res.blob(), filename }
}

/**
 * SSE fetch 流：支持跨 chunk、CRLF、多行 data、尾帧 flush；调用返回 abort 函数。
 */
export function streamSse(
  path: string,
  onEvent: (event: { seq?: number; type: string; message: string; repoId?: string; data?: unknown }) => void,
  onError: (err: Error) => void,
): () => void {
  const controller = new AbortController()
  void (async () => {
    try {
      const res = await fetch(`/api${path}`, {
        headers: { 'X-BX-Token': token, Accept: 'text/event-stream' },
        signal: controller.signal,
      })
      if (!res.ok || !res.body) {
        onError(new ApiError('SSE_FAILED', res.status, `事件流连接失败（${res.status}）`))
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let dataLines: string[] = []
      const consumeFrame = (frame: string): void => {
        const lines = frame.split(/\r?\n/)
        for (const line of lines) {
          if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
          else if (line === '') {
            if (dataLines.length > 0) {
              try { onEvent(JSON.parse(dataLines.join('\n'))) } catch { /* 忽略坏帧 */ }
              dataLines = []
            }
          }
        }
      }
      while (!controller.signal.aborted) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const frames = buffer.split(/\r?\n\r?\n/)
        buffer = frames.pop() ?? ''
        for (const frame of frames) consumeFrame(`${frame}\n`)
      }
      buffer += decoder.decode()
      if (buffer.trim()) consumeFrame(`${buffer}\n\n`)
      // 正常关闭（服务端完成任务后主动关闭连接）不触发 onError，避免控制台误判为断线重连
    } catch (error) {
      if (!controller.signal.aborted) onError(error as Error)
    }
  })()
  return () => controller.abort()
}
