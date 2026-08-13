// apps/web/src/api/http.ts
// HTTP 客户端：token 注入（sessionStorage 持久）、401 自动重新引导、错误归一、SSE 流式订阅

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

/** 引导：GET /api/config 拿 token（唯一免 token 端点） */
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
  let payload: string | undefined
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(opts.body)
  }
  const res = await fetch(`/api${path}`, { method, headers, body: payload, cache: 'no-store' })
  if (res.status === 401 && !opts.skipRetry) {
    // 会话失效：重新引导一次后重试
    if (await bootstrap()) {
      return request<T>(method, path, { ...opts, skipRetry: true })
    }
    throw new ApiError('UNAUTHORIZED', 401, '会话失效，请刷新页面重试')
  }
  if (!res.ok) {
    let body: { error?: string; code?: string } | null = null
    try {
      body = await res.json()
    } catch {
      body = null
    }
    throw new ApiError(body?.code ?? 'INTERNAL', res.status, body?.error ?? `请求失败（${res.status}）`)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const http = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, { body }),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body }),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body }),
  del: <T>(path: string) => request<T>('DELETE', path),
}

/**
 * SSE 流式订阅（fetch + ReadableStream；EventSource 无法携带自定义头）。
 * onEvent 每帧回调；onError 连接失败回调；返回取消函数。
 */
export function streamSse(
  path: string,
  onEvent: (event: { type: string; message: string; repoId?: string; data?: unknown }) => void,
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
      let buf = ''
      while (!controller.signal.aborted) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            onEvent(JSON.parse(line.slice(6)))
          } catch {
            // 忽略坏帧
          }
        }
      }
    } catch (e) {
      if (!controller.signal.aborted) onError(e as Error)
    }
  })()
  return () => controller.abort()
}
