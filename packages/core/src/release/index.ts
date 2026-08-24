// packages/core/src/release/index.ts
// R27 external 日志分发至 GitHub/Gitee Release（零依赖，node:https/http）
// 行为：幂等同步 external 日志为平台 Release 备注（同 tag 已存在则 PATCH）

import http from 'node:http'
import https from 'node:https'
import { URL } from 'node:url'
import { CoreError, CORE_ERROR_CODES } from '../errors'

// ---------------------------------------------------------------------
// 远程解析：owner/repo 提取（复用 git 远程解析逻辑的轻量版）
// 支持：
//   https://github.com/owner/repo.git
//   https://github.com/owner/repo
//   git@github.com:owner/repo.git
//   ssh://git@github.com/owner/repo.git
//   同理 gitee.com
// ---------------------------------------------------------------------

export interface ParsedRemote {
  provider: 'github' | 'gitee'
  owner: string
  repo: string
}

export function parseRemoteUrl(remote: string): ParsedRemote | null {
  const raw = String(remote ?? '').trim()
  if (!raw) return null
  let provider: 'github' | 'gitee' | null = null
  if (raw.includes('github.com')) provider = 'github'
  else if (raw.includes('gitee.com')) provider = 'gitee'
  else return null

  let pathPart = ''

  // scp-like: git@github.com:owner/repo.git
  if (raw.startsWith('git@') && raw.includes(':')) {
    const after = raw.slice(raw.indexOf(':') + 1)
    pathPart = after
  } else {
    // URL-like: 尝试用 URL 解析，ssh/git 协议先转 https 以便解析
    const normalized = raw.replace(/^ssh:\/\//i, 'https://').replace(/^git:\/\//i, 'https://')
    try {
      const u = new URL(normalized)
      pathPart = u.pathname // /owner/repo.git
    } catch {
      // 兜底：按 host 截取后段
      const host = provider === 'github' ? 'github.com' : 'gitee.com'
      const idx = raw.indexOf(host)
      if (idx !== -1) pathPart = raw.slice(idx + host.length)
    }
  }

  pathPart = pathPart.replace(/^\/+/, '').replace(/\.git\/?$/i, '').trim()
  // 去掉可能的前缀冒号残留
  pathPart = pathPart.replace(/^:+/, '')
  const parts = pathPart.split('/').filter(Boolean)
  if (parts.length < 2) return null
  const owner = parts[0]
  const repoName = parts[1]
  if (!owner || !repoName) return null
  return { provider, owner, repo: repoName }
}

// ---------------------------------------------------------------------
// 底层 HTTP JSON 请求（零依赖，支持 http/https，超时控制）
// ---------------------------------------------------------------------

interface HttpResult {
  status: number
  body: string
  json: unknown
  headers: Record<string, string>
}

function requestJson(
  method: string,
  urlStr: string,
  headers: Record<string, string>,
  bodyObj: unknown | null,
  timeoutMs = 15_000,
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr)
    const isHttps = u.protocol === 'https:'
    const lib: typeof http | typeof https = isHttps ? https : http
    const payload = bodyObj != null ? JSON.stringify(bodyObj) : null
    const hdrs: Record<string, string> = { ...headers }
    if (payload) {
      hdrs['Content-Type'] = hdrs['Content-Type'] ?? 'application/json'
      hdrs['Content-Length'] = String(Buffer.byteLength(payload, 'utf8'))
    }
    // mock 环境可能用 http 且 host 为 127.0.0.1，需保证 host 头正确
    const req = lib.request(
      {
        method,
        hostname: u.hostname,
        port: u.port ? Number(u.port) : isHttps ? 443 : 80,
        path: `${u.pathname}${u.search}`,
        headers: hdrs,
      },
      res => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8')
          let parsed: unknown = null
          const ct = String(res.headers['content-type'] ?? '')
          if (ct.includes('application/json') || body.trim().startsWith('{') || body.trim().startsWith('[')) {
            try {
              parsed = JSON.parse(body)
            } catch {
              parsed = null
            }
          }
          const headersOut: Record<string, string> = {}
          for (const [k, v] of Object.entries(res.headers)) {
            if (typeof v === 'string') headersOut[k.toLowerCase()] = v
            else if (Array.isArray(v)) headersOut[k.toLowerCase()] = v.join(', ')
          }
          resolve({ status: res.statusCode ?? 0, body, json: parsed, headers: headersOut })
        })
      },
    )
    req.on('error', (e: Error) => reject(e))
    const timer = setTimeout(() => {
      try {
        req.destroy(new Error(`请求超时（${timeoutMs}ms）: ${method} ${urlStr}`) as unknown as never)
      } catch {}
      reject(new CoreError(CORE_ERROR_CODES.GIT_TIMEOUT, `Release 接口超时（${timeoutMs}ms）`, { method, url: urlStr }))
    }, timeoutMs)
    req.on('close', () => clearTimeout(timer))
    // 写入 body
    if (payload) req.write(payload)
    req.end()
  })
}

function resolveApiBase(provider: 'github' | 'gitee', explicit?: string): string {
  if (explicit) return explicit.replace(/\/$/, '')
  const envKey = `BX_RELEASE_MOCK_${provider.toUpperCase()}_BASE`
  const fromEnv = (process.env as Record<string, string | undefined>)[envKey]
  if (fromEnv) return String(fromEnv).replace(/\/$/, '')
  // 也支持通用 mock（任一 provider 走同一地址，便于单 mock 同时支持双协议）
  const generic = process.env.BX_RELEASE_MOCK_BASE
  if (generic) return String(generic).replace(/\/$/, '')
  return provider === 'github' ? 'https://api.github.com' : 'https://gitee.com/api/v5'
}

export interface PublishReleaseNoteOpts {
  owner: string
  repo: string
  tagName: string
  /** Release 标题，默认取 tagName */
  name?: string
  body: string
  token: string
  provider: 'github' | 'gitee'
  /** 测试用：覆盖 apiBase（如 http://127.0.0.1:1234 或 http://127.0.0.1:1234/api/v5） */
  apiBase?: string
  timeoutMs?: number
}

export interface PublishReleaseNoteResult {
  provider: 'github' | 'gitee'
  tag: string
  action: 'created' | 'updated'
  url?: string
  id?: number | string
}

/**
 * 幂等发布 Release 备注：
 * 1) GET /repos/{owner}/{repo}/releases/tags/{tag} 判断存在
 * 2) 存在 → PATCH /repos/{owner}/{repo}/releases/{id} { body, name }
 * 3) 不存在 → POST /repos/{owner}/{repo}/releases { tag_name, name, body }
 *
 * GitHub 与 Gitee 双协议复用同一流程：
 * - GitHub：Authorization: token <token>
 * - Gitee：?access_token=<token>（同时附 Header 兼容）
 */
export async function publishReleaseNote(opts: PublishReleaseNoteOpts): Promise<PublishReleaseNoteResult> {
  const provider = opts.provider
  if (!['github', 'gitee'].includes(provider)) {
    throw new CoreError(CORE_ERROR_CODES.VALIDATION, `不支持的 provider: ${provider}`, { provider })
  }
  const owner = String(opts.owner ?? '').trim()
  const repoName = String(opts.repo ?? '').trim()
  const tagName = String(opts.tagName ?? '').trim()
  const body = String(opts.body ?? '')
  const token = String(opts.token ?? '').trim()
  if (!owner || !repoName) throw new CoreError(CORE_ERROR_CODES.VALIDATION, 'owner/repo 必填', { owner, repo: repoName })
  if (!tagName) throw new CoreError(CORE_ERROR_CODES.VALIDATION, 'tagName 必填', { tagName })
  if (!body.trim()) throw new CoreError(CORE_ERROR_CODES.VALIDATION, 'body 不能为空', { body })
  if (!token) throw new CoreError(CORE_ERROR_CODES.VALIDATION, `未配置 ${provider} token`, { provider })

  const base = resolveApiBase(provider, opts.apiBase)
  const timeoutMs = opts.timeoutMs ?? 15_000
  const name = opts.name ?? tagName

  // 公共 headers
  const commonHeaders: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'bxverse-release',
  }
  if (provider === 'github') {
    // GitHub：token 走 Authorization
    commonHeaders['Authorization'] = `token ${token}`
  } else {
    // Gitee：同时带头与 query 双重承载（兼容旧 Token 头）
    commonHeaders['Authorization'] = `token ${token}`
  }

  // 1) 尝试 GET 判断存在
  const tagEnc = encodeURIComponent(tagName)
  let getUrl = `${base}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/releases/tags/${tagEnc}`
  if (provider === 'gitee') getUrl += `?access_token=${encodeURIComponent(token)}`

  let existingId: number | string | null = null
  let getStatus = 0
  try {
    const getRes = await requestJson('GET', getUrl, commonHeaders, null, timeoutMs)
    getStatus = getRes.status
    if (getRes.status === 200 && getRes.json && typeof getRes.json === 'object') {
      const j = getRes.json as Record<string, unknown>
      const id = (j.id as number | string | undefined) ?? (j.release as Record<string, unknown> | undefined)?.id as number | string | undefined
      if (id != null) existingId = id
      else if (typeof (j as { tag_name?: string }).tag_name === 'string') {
        // Gitee 可能返回单对象含 id
        const maybeId = (j as { id?: number }).id
        if (maybeId != null) existingId = maybeId
        else existingId = tagName as unknown as string // fallback：用 tag 占位，仍走 PATCH
      }
    } else if (getRes.status === 404) {
      existingId = null
    } else if (getRes.status >= 400 && getRes.status !== 404) {
      // 非 404 的错误：若为 401/403 直接抛，以免误创建
      if (getRes.status === 401 || getRes.status === 403) {
        throw new CoreError(CORE_ERROR_CODES.UNAUTHORIZED, `Release 查询鉴权失败（${getRes.status}）`, {
          provider,
          status: getRes.status,
          body: getRes.body.slice(0, 2000),
        })
      }
      // 其他错误按不存在处理（随后 POST，可能得到更明确错误）
      if (getRes.status !== 404) {
        // 记为不存在，继续 POST 分支
        existingId = null
      }
    }
  } catch (e) {
    if (e instanceof CoreError) throw e
    // 网络错误直接抛
    throw new CoreError(CORE_ERROR_CODES.GIT_FAILED, `查询 Release 失败: ${(e as Error).message}`, {
      provider,
      cause: (e as Error).message,
    })
  }

  // 2) 若已存在 → PATCH
  if (existingId != null && getStatus === 200) {
    let patchUrl = `${base}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/releases/${encodeURIComponent(String(existingId))}`
    if (provider === 'gitee') patchUrl += `?access_token=${encodeURIComponent(token)}`
    const patchBody: Record<string, unknown> = { body, name }
    // Gitee PATCH 也接受 tag_name，但不改
    const patchRes = await requestJson('PATCH', patchUrl, commonHeaders, patchBody, timeoutMs)
    if (patchRes.status === 200 || patchRes.status === 201) {
      const j = (patchRes.json ?? {}) as Record<string, unknown>
      const url = (j.html_url as string | undefined) ?? (j.url as string | undefined) ?? undefined
      return { provider, tag: tagName, action: 'updated', url, id: existingId }
    }
    if (patchRes.status === 404) {
      // 竞态：GET 时存在 PATCH 时已删 → 回退创建
    } else {
      throw new CoreError(CORE_ERROR_CODES.GIT_FAILED, `更新 Release 失败（${patchRes.status}）`, {
        provider,
        status: patchRes.status,
        body: patchRes.body.slice(0, 4000),
      })
    }
  }

  // 3) 创建 → POST
  let postUrl = `${base}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/releases`
  if (provider === 'gitee') postUrl += `?access_token=${encodeURIComponent(token)}`
  const postBody: Record<string, unknown> = { tag_name: tagName, name, body, draft: false, prerelease: false }
  const postRes = await requestJson('POST', postUrl, commonHeaders, postBody, timeoutMs)
  if (postRes.status === 200 || postRes.status === 201) {
    const j = (postRes.json ?? {}) as Record<string, unknown>
    const url = (j.html_url as string | undefined) ?? (j.url as string | undefined) ?? undefined
    const id = (j.id as number | string | undefined) ?? undefined
    return { provider, tag: tagName, action: 'created', url, id }
  }
  // Gitee 可能返回 201 带单对象
  // 若已存在（422/409）则回退 PATCH 已存在 id（若拿不到 id 则按更新语义返回）
  if (postRes.status === 422 || postRes.status === 409) {
    // 尝试重新 GET 后 PATCH
    if (existingId != null) {
      let patchUrl = `${base}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/releases/${encodeURIComponent(String(existingId))}`
      if (provider === 'gitee') patchUrl += `?access_token=${encodeURIComponent(token)}`
      const patchRes2 = await requestJson('PATCH', patchUrl, commonHeaders, { body, name }, timeoutMs)
      if (patchRes2.status === 200 || patchRes2.status === 201) {
        const j = (patchRes2.json ?? {}) as Record<string, unknown>
        return { provider, tag: tagName, action: 'updated', url: (j.html_url as string | undefined), id: existingId }
      }
    }
    throw new CoreError(CORE_ERROR_CODES.GIT_FAILED, `创建 Release 冲突（${postRes.status}）`, {
      provider,
      status: postRes.status,
      body: postRes.body.slice(0, 4000),
    })
  }
  if (postRes.status === 401 || postRes.status === 403) {
    throw new CoreError(CORE_ERROR_CODES.UNAUTHORIZED, `创建 Release 鉴权失败（${postRes.status}）`, {
      provider,
      status: postRes.status,
      body: postRes.body.slice(0, 2000),
    })
  }
  throw new CoreError(CORE_ERROR_CODES.GIT_FAILED, `创建 Release 失败（${postRes.status}）`, {
    provider,
    status: postRes.status,
    body: postRes.body.slice(0, 4000),
  })
}
