// apps/server/test/helpers.ts
// 测试夹具：临时 git 仓库 + HTTP 请求辅助

import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const gitEnv = { ...process.env, LC_ALL: 'C.UTF-8' }

export function makeRepo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'bxverse-srv-repo-'))
  const run = (args: string[]) => execFileSync('git', args, { cwd: dir, env: gitEnv })
  run(['init', '-b', 'master'])
  run(['config', 'user.name', 'tester'])
  run(['config', 'user.email', 'tester@bxverse.local'])
  return dir
}

export function commit(dir: string, message: string, files: Record<string, string>): string {
  for (const [f, content] of Object.entries(files)) {
    const p = path.join(dir, f)
    mkdirSync(path.dirname(p), { recursive: true })
    appendFileSync(p, content)
  }
  execFileSync('git', ['add', '-A'], { cwd: dir, env: gitEnv })
  execFileSync('git', ['commit', '-m', message], { cwd: dir, env: gitEnv })
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, env: gitEnv }).toString().trim()
}

export interface ApiClient {
  base: string
  token: string
  get: (p: string) => Promise<{ status: number; body: unknown }>
  post: (p: string, body?: unknown, opts?: { origin?: string; token?: string }) => Promise<{ status: number; body: unknown }>
  patch: (p: string, body?: unknown) => Promise<{ status: number; body: unknown }>
  del: (p: string) => Promise<{ status: number; body: unknown }>
}

export async function createClient(base: string): Promise<ApiClient> {
  const initRes = await fetch(`${base}/api/config`)
  const init = (await initRes.json()) as { token: string }
  let currentToken = init.token
  const req = async (method: string, p: string, body?: unknown, opts: { origin?: string; token?: string } = {}) => {
    const headers: Record<string, string> = {
      'X-BX-Token': opts.token ?? currentToken,
    }
    if (opts.origin) headers.Origin = opts.origin
    let payload: string | undefined
    if (method !== 'GET' && method !== 'HEAD') {
      // 非 GET 一律带 Content-Type（无 body 请求也需通过 CSRF 校验）
      headers['Content-Type'] = 'application/json'
      payload = body !== undefined ? JSON.stringify(body) : ''
    }
    const res = await fetch(`${base}${p}`, { method, headers, body: payload })
    let parsed: unknown = null
    try {
      parsed = await res.json()
    } catch {
      parsed = null
    }
    return { status: res.status, body: parsed }
  }
  return {
    base,
    get token() {
      return currentToken
    },
    set token(v: string) {
      currentToken = v
    },
    get: (p: string) => req('GET', p),
    post: (p: string, body?: unknown, opts?: { origin?: string; token?: string }) => req('POST', p, body, opts),
    patch: (p: string, body?: unknown) => req('PATCH', p, body),
    del: (p: string) => req('DELETE', p),
  }
}
