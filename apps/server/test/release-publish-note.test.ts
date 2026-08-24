import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import http from 'node:http'
import { execFileSync } from 'node:child_process'
import { commit, createClient, makeRepo } from './helpers'

function createMockReleaseServer() {
  let nextId = 1
  const store = new Map<string, { id: number; tag_name: string; body: string }>()
  const byId = new Map<number, string>()
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c: Buffer) => (body += c.toString('utf8')))
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      let pathname = url.pathname
      if (pathname.startsWith('/api/v5')) pathname = pathname.slice('/api/v5'.length)
      const auth = String(req.headers['authorization'] ?? '')
      const qpToken = url.searchParams.get('access_token') ?? ''
      const token = qpToken || (auth.startsWith('token ') ? auth.slice(6).trim() : auth.replace(/^Bearer\s+/i, '').trim())
      // accept both tokens
      const valid = token === 'test-token-123' || token === 'gitee-token-456'
      if (pathname.includes('/repos/') && !valid) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ message: 'Bad credentials' }))
        return
      }
      const tagMatch = pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/releases\/tags\/([^/]+)$/)
      if (req.method === 'GET' && tagMatch) {
        const [, owner, repo, tagEnc] = tagMatch
        const tag = decodeURIComponent(tagEnc)
        const key = `${owner}/${repo}/${tag}`
        const found = store.get(key)
        if (found) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ id: found.id, tag_name: found.tag_name, body: found.body, html_url: `http://mock/${owner}/${repo}/releases/tag/${tag}` }))
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ message: 'Not Found' }))
        }
        return
      }
      const postMatch = pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/releases$/)
      if (req.method === 'POST' && postMatch) {
        const [, owner, repo] = postMatch
        let payload: Record<string, unknown> = {}
        try { payload = body ? JSON.parse(body) : {} } catch {}
        const tag = String(payload.tag_name ?? '').trim()
        const key = `${owner}/${repo}/${tag}`
        if (store.has(key)) {
          res.writeHead(422, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ message: 'already exists' }))
          return
        }
        const id = nextId++
        store.set(key, { id, tag_name: tag, body: String(payload.body ?? '') })
        byId.set(id, key)
        res.writeHead(201, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ id, tag_name: tag, body: String(payload.body ?? ''), html_url: `http://mock/${owner}/${repo}/releases/tag/${tag}` }))
        return
      }
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
        const rec = store.get(key)!
        if (!key.startsWith(`${owner}/${repo}/`)) {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ message: 'Not Found' }))
          return
        }
        let payload: Record<string, unknown> = {}
        try { payload = body ? JSON.parse(body) : {} } catch {}
        if (typeof payload.body === 'string') rec.body = payload.body
        store.set(key, rec)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ id: rec.id, tag_name: rec.tag_name, body: rec.body, html_url: `http://mock/${owner}/${repo}/releases/tag/${rec.tag_name}` }))
        return
      }
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ message: 'not matched' }))
    })
  })
  return server
}

let app: Awaited<ReturnType<typeof startTestServer>>
let client: Awaited<ReturnType<typeof createClient>>
let mock: http.Server
let mockBase: string
let projectId = ''
let repoId = ''
let releaseId = ''
let repoPath = ''

async function startTestServer() {
  const { createApp } = await import('../src/app')
  const instance = createApp()
  const port = await instance.start(0, '127.0.0.1')
  return { instance, base: `http://127.0.0.1:${port}` }
}

beforeAll(async () => {
  mock = createMockReleaseServer()
  await new Promise<void>(resolve => mock.listen(0, '127.0.0.1', () => resolve()))
  const addr = mock.address() as { port: number }
  mockBase = `http://127.0.0.1:${addr.port}`
  // mock 同时支持 github 与 gitee（同端口，github 走根，gitee 走 /api/v5）
  process.env.BX_RELEASE_MOCK_BASE = mockBase
  process.env.BX_RELEASE_MOCK_GITHUB_BASE = mockBase
  process.env.BX_RELEASE_MOCK_GITEE_BASE = `${mockBase}/api/v5`

  app = await startTestServer()
  client = await createClient(app.base)

  // 写入 release token（credentials.json）
  const { store } = await import('@bxverse/core')
  const cred = await store.loadCredentials()
  cred.releaseTokens = { github: 'test-token-123', gitee: 'gitee-token-456' }
  await store.saveCredentials(cred)

  // 创建项目 + 仓库 + 发布
  const { body: p } = await client.post('/api/projects', { name: '发布分发测试项目' })
  projectId = (p as { id: string }).id
  repoPath = makeRepo()
  commit(repoPath, 'feat: init', { 'a.txt': '1' })
  // 让远端可解析为 testowner/testrepo（mock 不校验 host，只校验 owner/repo 对应 token）
  execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/testowner/testrepo.git'], { cwd: repoPath })
  const { body: r } = await client.post(`/api/projects/${projectId}/repos`, { path: repoPath })
  repoId = (r as { id: string }).id

  const { status } = await client.post('/api/publish', { projectId, bump: 'auto', offline: true })
  expect(status).toBe(202)
  const taskId = ((await client.post('/api/publish', { projectId, bump: 'auto', offline: true, dryRun: true })).body as { projectVersion: string }).projectVersion
  void taskId
  // 等待发布完成（轮询历史）
  for (let i = 0; i < 20; i++) {
    const { body } = await client.get(`/api/projects/${projectId}/releases`)
    const arr = body as { id: string }[]
    if (arr.length > 0) {
      releaseId = arr[0].id
      break
    }
    await new Promise(r => setTimeout(r, 300))
  }
  // 若仍未拿到 releaseId，尝试直接 publish 完成后的查询
  if (!releaseId) {
    // 发布是异步，等待 SSE 完成：简易轮询
    for (let i = 0; i < 20; i++) {
      const { body } = await client.get(`/api/projects/${projectId}/releases`)
      const arr = body as { id: string }[]
      if (arr.length > 0) { releaseId = arr[0].id; break }
      await new Promise(r => setTimeout(r, 500))
    }
  }
  expect(releaseId).toBeTruthy()
})

afterAll(async () => {
  await app.instance.stop()
  await new Promise<void>(resolve => mock.close(() => resolve()))
  delete process.env.BX_RELEASE_MOCK_BASE
  delete process.env.BX_RELEASE_MOCK_GITHUB_BASE
  delete process.env.BX_RELEASE_MOCK_GITEE_BASE
})

describe('POST /api/releases/:id/publish-note (R27)', () => {
  it('创建 github release（幂等前半）', async () => {
    const { status, body } = await client.post(`/api/releases/${releaseId}/publish-note`, {
      repoId,
      provider: 'github',
      body: '# v1.2.0 Test Release\nhello',
    })
    expect(status).toBe(200)
    expect((body as { action: string }).action).toBe('created')
    expect((body as { tag: string }).tag).toBeTruthy()
  })

  it('同 tag 二次提交 → PATCH 更新（幂等后半）', async () => {
    const { status, body } = await client.post(`/api/releases/${releaseId}/publish-note`, {
      repoId,
      provider: 'github',
      body: '# v1.2.0 UPDATED\nnew content',
    })
    expect(status).toBe(200)
    expect((body as { action: string }).action).toBe('updated')
  })

  it('未配置 token → 400 VALIDATION', async () => {
    // 清空 token 后尝试
    const { store } = await import('@bxverse/core')
    const cred = await store.loadCredentials()
    const saved = cred.releaseTokens?.github
    cred.releaseTokens = { ...cred.releaseTokens, github: '' } as Record<string, string>
    await store.saveCredentials(cred)
    const { status, body } = await client.post(`/api/releases/${releaseId}/publish-note`, {
      repoId,
      provider: 'github',
      body: 'body',
    })
    expect(status).toBe(400)
    expect((body as { code: string }).code).toBe('VALIDATION')
    // 恢复
    cred.releaseTokens = { ...cred.releaseTokens, github: saved as string }
    await store.saveCredentials(cred)
  })

  it('非法 provider → 400', async () => {
    const { status } = await client.post(`/api/releases/${releaseId}/publish-note`, {
      repoId,
      provider: 'gitlab' as never,
      body: 'body',
    })
    expect(status).toBe(400)
  })

  it('repoId 非法 → 404', async () => {
    const { status } = await client.post(`/api/releases/${releaseId}/publish-note`, {
      repoId: 'r_nonexistent',
      provider: 'github',
      body: 'body',
    })
    expect(status).toBe(404)
  })
})
