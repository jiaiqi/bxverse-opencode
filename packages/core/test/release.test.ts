import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import http from 'node:http'
import { parseRemoteUrl, publishReleaseNote } from '../src/release/index'

function createMockReleaseServer() {
  let nextId = 1
  const store = new Map<string, { id: number; tag_name: string; name: string; body: string; owner: string; repo: string }>()
  // reverse index id -> key
  const byId = new Map<number, string>()

  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c: Buffer) => (body += c.toString('utf8')))
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      // Normalize path: strip /api/v5 prefix for gitee
      let pathname = url.pathname
      if (pathname.startsWith('/api/v5')) pathname = pathname.slice('/api/v5'.length)
      // Auth check: expect "test-token-123" or "gitee-token-456"
      const auth = String(req.headers['authorization'] ?? '')
      const qpToken = url.searchParams.get('access_token') ?? ''
      const token = qpToken || (auth.startsWith('token ') ? auth.slice(6).trim() : auth.replace(/^Bearer\s+/i, '').trim())
      const validTokens = new Set(['test-token-123', 'gitee-token-456'])
      // allow empty path for health? But for releases, require valid token, otherwise 401
      const needsAuth = pathname.includes('/repos/')
      if (needsAuth && !validTokens.has(token)) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ message: 'Bad credentials' }))
        return
      }

      // GET /repos/:owner/:repo/releases/tags/:tag
      const tagMatch = pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/releases\/tags\/([^/]+)$/)
      if (req.method === 'GET' && tagMatch) {
        const [, owner, repo, tagEnc] = tagMatch
        const tag = decodeURIComponent(tagEnc)
        const key = `${owner}/${repo}/${tag}`
        const found = store.get(key)
        if (found) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              id: found.id,
              tag_name: found.tag_name,
              name: found.name,
              body: found.body,
              html_url: `http://127.0.0.1/mock/${owner}/${repo}/releases/tag/${tag}`,
            }),
          )
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ message: 'Not Found' }))
        }
        return
      }

      // POST /repos/:owner/:repo/releases
      const postMatch = pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/releases$/)
      if (req.method === 'POST' && postMatch) {
        const [, owner, repo] = postMatch
        let payload: Record<string, unknown> = {}
        try {
          payload = body ? JSON.parse(body) : {}
        } catch {
          payload = {}
        }
        const tag = String(payload.tag_name ?? '').trim()
        const key = `${owner}/${repo}/${tag}`
        if (store.has(key)) {
          res.writeHead(422, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ message: 'already exists' }))
          return
        }
        const id = nextId++
        const rec = { id, tag_name: tag, name: String(payload.name ?? tag), body: String(payload.body ?? ''), owner, repo }
        store.set(key, rec)
        byId.set(id, key)
        res.writeHead(201, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            id,
            tag_name: tag,
            name: rec.name,
            body: rec.body,
            html_url: `http://127.0.0.1/mock/${owner}/${repo}/releases/tag/${tag}`,
          }),
        )
        return
      }

      // PATCH /repos/:owner/:repo/releases/:id
      const patchMatch = pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/releases\/(\d+)$/)
      if (req.method === 'PATCH' && patchMatch) {
        const [, owner, repo, idStr] = patchMatch
        const id = Number(idStr)
        const key = byId.get(id)
        if (!key) {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ message: 'Not Found' }))
          return
        }
        const rec = store.get(key)
        if (!rec || rec.owner !== owner || rec.repo !== repo) {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ message: 'Not Found' }))
          return
        }
        let payload: Record<string, unknown> = {}
        try {
          payload = body ? JSON.parse(body) : {}
        } catch {
          payload = {}
        }
        if (typeof payload.body === 'string') rec.body = payload.body
        if (typeof payload.name === 'string') rec.name = payload.name
        store.set(key, rec)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            id: rec.id,
            tag_name: rec.tag_name,
            name: rec.name,
            body: rec.body,
            html_url: `http://127.0.0.1/mock/${owner}/${repo}/releases/tag/${rec.tag_name}`,
          }),
        )
        return
      }

      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ message: 'not matched' }))
    })
  })

  return { server, store }
}

describe('release: parseRemoteUrl', () => {
  it('github https', () => {
    expect(parseRemoteUrl('https://github.com/octocat/hello.git')).toEqual({ provider: 'github', owner: 'octocat', repo: 'hello' })
  })
  it('github scp', () => {
    expect(parseRemoteUrl('git@github.com:octocat/hello.git')).toEqual({ provider: 'github', owner: 'octocat', repo: 'hello' })
  })
  it('gitee https', () => {
    expect(parseRemoteUrl('https://gitee.com/acme/app.git')).toEqual({ provider: 'gitee', owner: 'acme', repo: 'app' })
  })
  it('gitee scp', () => {
    expect(parseRemoteUrl('git@gitee.com:acme/app.git')).toEqual({ provider: 'gitee', owner: 'acme', repo: 'app' })
  })
  it('unknown host returns null', () => {
    expect(parseRemoteUrl('https://example.com/a/b.git')).toBeNull()
  })
})

describe('release: publishReleaseNote (mock server)', () => {
  let srv: http.Server
  let base: string
  let giteeBase: string

  beforeEach(async () => {
    const { server } = createMockReleaseServer()
    srv = server
    await new Promise<void>(resolve => {
      server.listen(0, '127.0.0.1', () => resolve())
    })
    const addr = server.address() as { port: number }
    base = `http://127.0.0.1:${addr.port}`
    giteeBase = `http://127.0.0.1:${addr.port}/api/v5`
  })

  afterEach(async () => {
    await new Promise<void>(resolve => srv.close(() => resolve()))
  })

  it('creates github release', async () => {
    const res = await publishReleaseNote({
      owner: 'octocat',
      repo: 'hello',
      tagName: 'v1.2.0',
      body: '# v1.2.0\nhello',
      token: 'test-token-123',
      provider: 'github',
      apiBase: base,
    })
    expect(res.action).toBe('created')
    expect(res.tag).toBe('v1.2.0')
  })

  it('idempotent PATCH on second publish with same tag different body', async () => {
    const first = await publishReleaseNote({
      owner: 'octocat',
      repo: 'hello',
      tagName: 'v1.2.1',
      body: 'first body',
      token: 'test-token-123',
      provider: 'github',
      apiBase: base,
    })
    expect(first.action).toBe('created')
    const second = await publishReleaseNote({
      owner: 'octocat',
      repo: 'hello',
      tagName: 'v1.2.1',
      body: 'updated body',
      token: 'test-token-123',
      provider: 'github',
      apiBase: base,
    })
    expect(second.action).toBe('updated')
    expect(second.tag).toBe('v1.2.1')
  })

  it('creates gitee release via query token', async () => {
    const res = await publishReleaseNote({
      owner: 'acme',
      repo: 'app',
      tagName: 'v2.0.0',
      body: 'gitee body',
      token: 'gitee-token-456',
      provider: 'gitee',
      apiBase: giteeBase,
    })
    expect(res.action).toBe('created')
  })

  it('gitee idempotent PATCH', async () => {
    await publishReleaseNote({
      owner: 'acme',
      repo: 'app2',
      tagName: 'v2.0.1',
      body: 'first',
      token: 'gitee-token-456',
      provider: 'gitee',
      apiBase: giteeBase,
    })
    const second = await publishReleaseNote({
      owner: 'acme',
      repo: 'app2',
      tagName: 'v2.0.1',
      body: 'second',
      token: 'gitee-token-456',
      provider: 'gitee',
      apiBase: giteeBase,
    })
    expect(second.action).toBe('updated')
  })

  it('fails with bad token', async () => {
    await expect(
      publishReleaseNote({
        owner: 'octocat',
        repo: 'hello',
        tagName: 'v9.9.9',
        body: 'body',
        token: 'bad-token',
        provider: 'github',
        apiBase: base,
      }),
    ).rejects.toBeDefined()
  })
})
