// apps/server/test/server.test.ts
// 服务端集成测试：鉴权 / CRUD / 仓库接入 / 文件 / 发布全链路 / SSE / 日志编辑

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { commit, createClient, makeDir, makeRepo } from './helpers'
import type { ApiClient } from './helpers'
import type { PublishEvent } from '@bxverse/shared'

let app: Awaited<ReturnType<typeof startTestServer>>
let client: ApiClient

async function startTestServer() {
  const { createApp } = await import('../src/app')
  const instance = createApp()
  const port = await instance.start(0, '127.0.0.1')
  return { instance, base: `http://127.0.0.1:${port}` }
}

beforeAll(async () => {
  app = await startTestServer()
  client = await createClient(app.base)
})

afterAll(async () => {
  await app.instance.stop()
})

describe('鉴权与 CSRF（api.md §1.3）', () => {
  it('GET /api/config 免 token 返回 token + 配置', async () => {
    expect(client.token).toBeTruthy()
    const { status, body } = await client.get('/api/config')
    expect(status).toBe(200)
    expect((body as { token: string }).token).toBe(client.token)
    expect((body as { config: { pwa: { enabled: boolean } } }).config.pwa.enabled).toBe(true)
  })

  it('无 token 访问受保护端点 → 401', async () => {
    const res = await fetch(`${app.base}/api/overview`)
    expect(res.status).toBe(401)
    const body = (await res.json()) as { code: string }
    expect(body.code).toBe('UNAUTHORIZED')
  })

  it('伪造 Origin 的非 GET 请求 → 403', async () => {
    const { status, body } = await client.post('/api/projects', { name: 'evil' }, { origin: 'http://evil.example' })
    expect(status).toBe(403)
    expect((body as { code: string }).code).toBe('FORBIDDEN')
  })

  it('token 轮换后旧 token 失效', async () => {
    const { status, body } = await client.post('/api/auth/rotate')
    expect(status).toBe(200)
    const next = (body as { token: string }).token
    expect(next).not.toBe(client.token)
    // 旧 token 立即失效
    const res = await fetch(`${app.base}/api/projects`, { headers: { 'X-BX-Token': client.token } })
    expect(res.status).toBe(401)
    client.token = next
  })
})

describe('项目 CRUD（api.md §5）', () => {
  let projectId = ''

  it('创建项目（服务端生成默认值）', async () => {
    const { status, body } = await client.post('/api/projects', { name: '主产品线', description: '测试项目' })
    expect(status).toBe(201)
    const p = body as { id: string; version: string; repos: unknown[] }
    projectId = p.id
    expect(p.id.startsWith('p_')).toBe(true)
    expect(p.version).toBe('v0.1.0')
    expect(p.repos).toEqual([])
  })

  it('重名 → 400', async () => {
    const { status } = await client.post('/api/projects', { name: '主产品线' })
    expect(status).toBe(400)
  })

  it('PATCH 更新字段 + 非法枚举 → 400', async () => {
    const { status, body } = await client.patch(`/api/projects/${projectId}`, { description: '新描述', bump: 'manual' })
    expect(status).toBe(200)
    expect((body as { bump: string }).bump).toBe('manual')
    const bad = await client.patch(`/api/projects/${projectId}`, { bump: 'illegal' })
    expect(bad.status).toBe(400)
  })

  it('列表与删除', async () => {
    const { body } = await client.get('/api/projects')
    expect((body as unknown[]).length).toBe(1)
    const { status } = await client.del(`/api/projects/${projectId}`)
    expect(status).toBe(200)
    const after = await client.get('/api/projects')
    expect((after.body as unknown[]).length).toBe(0)
  })
})

describe('仓库接入 / 状态 / 文件（api.md §6）', () => {
  let projectId = ''
  let repoId = ''

  it('本地路径接入（R3 方式 A）', async () => {
    const { body: p } = await client.post('/api/projects', { name: '仓库测试项目' })
    projectId = (p as { id: string }).id
    const dir = makeRepo()
    commit(dir, 'feat(a): 功能A', { 'src/a.ts': 'aaa' })
    commit(dir, 'fix: 修复B', { 'src/b.ts': 'bbb' })
    const { status, body } = await client.post(`/api/projects/${projectId}/repos`, { path: dir })
    expect(status).toBe(201)
    const repo = body as { id: string; name: string; path: string; lastPublishCommit: null }
    repoId = repo.id
    expect(repo.lastPublishCommit).toBeNull()
    // 幂等：同 path 再接入 → 200 已有
    const again = await client.post(`/api/projects/${projectId}/repos`, { path: dir })
    expect(again.status).toBe(200)
    expect((again.body as { id: string }).id).toBe(repoId)
    // 非 git 目录 → 400 REPO_INVALID（mkdtemp 保证跨平台成立，不依赖 Windows TEMP 环境变量）
    const bad = await client.post(`/api/projects/${projectId}/repos`, { path: makeDir() })
    expect(bad.status).toBe(400)
    expect((bad.body as { code: string }).code).toBe('REPO_INVALID')
  })

  it('仓库状态（fresh）', async () => {
    const { status, body } = await client.get(`/api/repos/${projectId}/${repoId}/status?fresh=true`)
    expect(status).toBe(200)
    const st = body as { changed: boolean; commits: unknown[]; head: string; branch: string }
    expect(st.changed).toBe(true)
    expect(st.commits.length).toBe(2)
    expect(st.head).toHaveLength(40)
    expect(st.branch).toBe('master')
  })

  it('目录树与文件读取（R4）', async () => {
    const tree = await client.get(`/api/repos/${projectId}/${repoId}/tree?path=`)
    expect(tree.status).toBe(200)
    expect((tree.body as { entries: { name: string }[] }).entries.map(e => e.name)).toContain('src')

    const file = await client.get(`/api/repos/${projectId}/${repoId}/file?path=src/a.ts`)
    expect(file.status).toBe(200)
    expect((file.body as { content: string }).content).toContain('aaa')

    const escape = await client.get(`/api/repos/${projectId}/${repoId}/tree?path=../../..`)
    expect(escape.status).toBe(400)
  })

  it('PATCH 仓库定义 + DELETE', async () => {
    const { status, body } = await client.patch(`/api/projects/${projectId}/repos/${repoId}`, {
      buildCommand: 'echo build',
      writeVersionFile: false,
    })
    expect(status).toBe(200)
    expect((body as { buildCommand: string }).buildCommand).toBe('echo build')
    const del = await client.del(`/api/projects/${projectId}/repos/${repoId}`)
    expect(del.status).toBe(200)
    // 重新接入以便后续发布测试使用同一项目
    const again = await client.post(`/api/projects/${projectId}/repos`, { path: (body as { path: string }).path })
    expect(again.status).toBe(201)
    repoId = (again.body as { id: string }).id
  })
})

describe('发布全链路（api.md §8）', () => {
  let projectId = ''
  let repoPath = ''

  it('dry-run 计划', async () => {
    const { body: p } = await client.post('/api/projects', { name: '发布测试项目' })
    projectId = (p as { id: string }).id
    repoPath = makeRepo()
    commit(repoPath, 'feat(x): 新功能', { 'x.ts': '1' })
    commit(repoPath, 'fix: 修复', { 'y.ts': '2' })
    const { body: r } = await client.post(`/api/projects/${projectId}/repos`, { path: repoPath })
    expect((r as { id: string }).id.startsWith('r_')).toBe(true)

    const { status, body } = await client.post('/api/publish', { projectId, bump: 'auto', dryRun: true })
    expect(status).toBe(200)
    const plan = body as {
      projectVersion: string
      bump: string
      suggestedBump: string
      changed: unknown[]
      syncedOnly: unknown[]
      externalDraft: string
      internalDraft: string
      warnings: string[]
    }
    expect(plan.projectVersion).toBe('v0.2.0') // feat → minor
    expect(plan.suggestedBump).toBe('minor')
    expect(plan.changed.length).toBe(1)
    expect(plan.syncedOnly.length).toBe(0)
    expect(plan.externalDraft).toContain('## 新增')
    expect(plan.internalDraft).toContain('变更明细')
  })

  it('非法 bump → 400', async () => {
    const { status } = await client.post('/api/publish', { projectId, bump: 'xxx', dryRun: true })
    expect(status).toBe(400)
  })

  it('执行发布 + SSE 事件流', async () => {
    const { status, body } = await client.post('/api/publish', { projectId, bump: 'auto', offline: true })
    expect(status).toBe(202)
    const taskId = (body as { taskId: string }).taskId
    expect(taskId.startsWith('t_')).toBe(true)

    // 订阅 SSE（fetch 流式），重放缓冲 + 实时
    const events = await collectSse(app.base, client.token, taskId)
    expect(events.some(e => e.type === 'repo-start')).toBe(true)
    expect(events.some(e => e.type === 'repo-done')).toBe(true)
    expect(events.some(e => e.type === 'done')).toBe(true)
    const done = events.find(e => e.type === 'done')
    expect((done?.data as { releaseId: string }).releaseId).toBeTruthy()
  })

  it('发布后：历史/项目版本/基准/第二次 plan 无变动', async () => {
    const { body } = await client.get(`/api/projects/${projectId}/releases`)
    const releases = body as { version: string; kind: string; logs: { external: { state: string } } }[]
    expect(releases.length).toBe(1)
    expect(releases[0].version).toBe('v0.2.0')
    expect(releases[0].kind).toBe('project')

    const { body: projBody } = await client.get('/api/projects')
    const project = (projBody as { id: string; version: string; repos: { id: string; lastPublishCommit: string }[] }[]).find(p => p.id === projectId)!
    expect(project.version).toBe('v0.2.0')
    expect(project.repos[0].lastPublishCommit).toHaveLength(40)

    const plan2 = await client.post('/api/publish', { projectId, bump: 'auto', dryRun: true })
    const p2 = plan2.body as { changed: unknown[]; syncedOnly: unknown[] }
    expect(p2.changed.length).toBe(0)
    expect(p2.syncedOnly.length).toBe(1)

    // 版本文件已写入业务仓库
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const vf = JSON.parse(readFileSync(join(repoPath, 'public', 'version.json'), 'utf8'))
    expect(vf.version.startsWith('v0.2.0.')).toBe(true)
  })

  it('GET /api/releases/:id/versions 发布历史版本清单（R18）', async () => {
    const { body } = await client.get(`/api/projects/${projectId}/releases`)
    const projectRecord = (body as { id: string; kind: string }[])[0]
    const { status, body: items } = await client.get(`/api/releases/${projectRecord.id}/versions`)
    expect(status).toBe(200)
    const list = items as { app: string; name: string; version: string }[]
    expect(list).toHaveLength(1)
    expect(list[0].app).toBeTruthy()
    expect(list[0].version.startsWith('v0.2.0.')).toBe(true)

    // 仓库级记录不支持
    const { body: projBody2 } = await client.get('/api/projects')
    const p2 = (projBody2 as { id: string; repos: { id: string }[] }[]).find(p => p.id === projectId)!
    const scopeBody = await client.get(`/api/releases?scopeId=${p2.repos[0].id}`)
    const repoRecord = (scopeBody.body as { id: string; kind: string }[])[0]
    const bad = await client.get(`/api/releases/${repoRecord.id}/versions`)
    expect(bad.status).toBe(400)
  })

  it('GET /api/publish/current 恢复控制台', async () => {
    const { status, body } = await client.get('/api/publish/current')
    expect(status).toBe(200)
    const cur = body as { taskId: string; status: string }
    expect(cur.taskId).toBeTruthy()
    expect(['done', 'failed', 'running']).toContain(cur.status)
  })

  it('GET /api/projects/:id/versions 版本清单导出（R18）', async () => {
    // 设置中文名
    const { body: projectsBody } = await client.get('/api/projects')
    const project = (projectsBody as { id: string; repos: { id: string; name: string }[] }[]).find(p => p.id === projectId)!
    const repo = project.repos[0]
    const patched = await client.patch(`/api/projects/${projectId}/repos/${repo.id}`, { displayName: '测试前端' })
    expect(patched.status).toBe(200)

    const { status, body } = await client.get(`/api/projects/${projectId}/versions`)
    expect(status).toBe(200)
    const items = body as { app: string; name: string; version: string }[]
    expect(items).toHaveLength(1)
    expect(items[0].app).toBe(repo.name)
    expect(items[0].name).toBe('测试前端')
    expect(items[0].version.startsWith('v0.2.0.')).toBe(true) // 业务仓库 version.json 的混合版本

    // 未发布过版本文件的仓库 → 回退项目统一版本
    const { body: p2 } = await client.post('/api/projects', { name: '空项目' })
    const emptyProjectId = (p2 as { id: string }).id
    const emptyRepoPath = makeRepo()
    commit(emptyRepoPath, 'feat: init', { 'a.txt': '1' })
    await client.post(`/api/projects/${emptyProjectId}/repos`, { path: emptyRepoPath })
    const { body: v2 } = await client.get(`/api/projects/${emptyProjectId}/versions`)
    const items2 = v2 as { app: string; name: string; version: string }[]
    expect(items2).toHaveLength(1)
    expect(items2[0].version).toBe('v0.1.0') // 回退项目统一版本

    const notFound = await client.get('/api/projects/p_nonexistent/versions')
    expect(notFound.status).toBe(404)
  })

  it('POST /api/projects/:id/versions/export 写入指定仓库（R18）', async () => {
    const { body: projectsBody } = await client.get('/api/projects')
    const project = (projectsBody as { id: string; repos: { id: string; name: string }[] }[]).find(p => p.id === projectId)!
    const repo = project.repos[0]

    // 正常写入
    const { status, body } = await client.post(`/api/projects/${projectId}/versions/export`, {
      repoId: repo.id,
      path: 'deploy/versions.json',
    })
    expect(status).toBe(200)
    const result = body as { count: number; items: { app: string; version: string }[]; fullPath: string }
    expect(result.count).toBe(1)
    expect(result.items[0].app).toBe(repo.name)

    // 校验文件实际落盘
    const { readFileSync } = await import('node:fs')
    const written = JSON.parse(readFileSync(result.fullPath, 'utf8'))
    expect(written).toEqual(result.items)

    // 路径校验
    const noJson = await client.post(`/api/projects/${projectId}/versions/export`, { repoId: repo.id, path: 'versions.txt' })
    expect(noJson.status).toBe(400)
    const escape = await client.post(`/api/projects/${projectId}/versions/export`, { repoId: repo.id, path: '../../evil.json' })
    expect(escape.status).toBe(400)
    const abs = await client.post(`/api/projects/${projectId}/versions/export`, { repoId: repo.id, path: 'C:/evil.json' })
    expect(abs.status).toBe(400)
    const badRepo = await client.post(`/api/projects/${projectId}/versions/export`, { repoId: 'r_nonexistent', path: 'versions.json' })
    expect(badRepo.status).toBe(404)
  })
})

describe('日志编辑（api.md §7.3）', () => {
  it('edit → edited → confirm → confirmed → reset → auto', async () => {
    // 复用发布测试项目：先查记录
    const { body: projectsBody } = await client.get('/api/projects')
    const project = (projectsBody as { id: string; name: string }[]).find(p => p.name === '发布测试项目')!
    const { body } = await client.get(`/api/projects/${project.id}/releases`)
    const record = (body as { id: string; logs: { external: { state: string; autoDraft: string } } }[])[0]

    const edited = await client.patch(`/api/releases/${record.id}/log`, {
      track: 'external',
      action: 'edit',
      content: '# 手工编辑的更新日志',
    })
    expect(edited.status).toBe(200)
    expect(((edited.body as { logs: { external: { state: string } } }).logs.external.state)).toBe('edited')

    const confirmed = await client.patch(`/api/releases/${record.id}/log`, { track: 'external', action: 'confirm' })
    expect(((confirmed.body as { logs: { external: { state: string } } }).logs.external.state)).toBe('confirmed')

    const reset = await client.patch(`/api/releases/${record.id}/log`, { track: 'external', action: 'reset' })
    const after = reset.body as { logs: { external: { state: string; content: string; autoDraft: string } } }
    expect(after.logs.external.state).toBe('auto')
    expect(after.logs.external.content).toBe(after.logs.external.autoDraft)

    const bad = await client.patch(`/api/releases/${record.id}/log`, { track: 'nope', action: 'edit' })
    expect(bad.status).toBe(400)
  })
})

describe('总览与同步（api.md §4/§9）', () => {
  it('overview 聚合', async () => {
    const { status, body } = await client.get('/api/overview')
    expect(status).toBe(200)
    const o = body as { projectCount: number; repoCount: number; changedRepoCount: number }
    expect(o.projectCount).toBeGreaterThan(0)
    expect(o.repoCount).toBeGreaterThan(0)
  })

  it('sync status / push（无远程降级）', async () => {
    const { status, body } = await client.post('/api/sync', { action: 'status' })
    expect(status).toBe(200)
    const s = body as { ok: boolean; action: string }
    expect(s.action).toBe('status')
    const push = await client.post('/api/sync', { action: 'push' })
    expect(push.status).toBe(200)
    expect((push.body as { ok: boolean }).ok).toBe(false) // 未配置远程
    const bad = await client.post('/api/sync', { action: 'nope' })
    expect(bad.status).toBe(400)
  })
})

/** fetch 流式订阅 SSE，直到 done/error 终帧或超时 */
async function collectSse(base: string, token: string, taskId: string): Promise<PublishEvent[]> {
  const res = await fetch(`${base}/api/events?task=${taskId}`, {
    headers: { 'X-BX-Token': token, Accept: 'text/event-stream' },
  })
  expect(res.status).toBe(200)
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  const events: PublishEvent[] = []
  let buf = ''
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const e = JSON.parse(line.slice(6)) as PublishEvent
      events.push(e)
      if (e.type === 'done' || e.type === 'error') {
        reader.cancel().catch(() => {})
        return events
      }
    }
  }
  return events
}
describe('AI 日志润色（/api/ai/polish）', () => {
  let stub: import('node:http').Server | null = null

  afterAll(async () => {
    stub?.close()
    // 恢复默认配置，不影响其它用例
    await client.post('/api/config', { ai: { enabled: false, baseUrl: '', model: '', apiKey: '' } })
  })

  it('未启用 → 400 AI_DISABLED（不静默返回原文）', async () => {
    await client.post('/api/config', { ai: { enabled: false, baseUrl: 'http://127.0.0.1:9', model: 'x', apiKey: '' } })
    const { status, body } = await client.post('/api/ai/polish', { text: 'hello world' })
    expect(status).toBe(400)
    expect((body as { code: string }).code).toBe('AI_DISABLED')
  })

  it('启用后调用 OpenAI 兼容接口，返回去代码块包裹的润色结果', async () => {
    const { createServer } = await import('node:http')
    await new Promise<void>((resolve) => {
      stub = createServer((req, res) => {
        let data = ''
        req.on('data', (c: Buffer) => { data += c.toString('utf8') })
        req.on('end', () => {
          const payload = JSON.parse(data) as { model: string; messages: { role: string; content: string }[] }
          expect(payload.model).toBe('stub-model')
          expect(payload.messages[0].role).toBe('system')
          expect(payload.messages[1].content).toBe('hello world')
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ choices: [{ message: { content: '```markdown\n润色后的对外日志\n```' } }] }))
        })
      })
      stub.listen(0, '127.0.0.1', () => {
        const addr = stub!.address() as { port: number }
        const base = `http://127.0.0.1:${addr.port}`
        void client.post('/api/config', { ai: { enabled: true, baseUrl: base, model: 'stub-model', apiKey: '' } })
          .then(async () => {
            const providers = await client.get('/api/ai/providers')
            const provider = (providers.body as { id: string }[])[0]
            await client.post(`/api/ai/providers/${provider.id}/credential`, { apiKey: 'test-key' })
            resolve()
          })
      })
    })
    const { status, body } = await client.post('/api/ai/polish', { text: 'hello world' })
    expect(status).toBe(200)
    expect((body as { content: string }).content).toBe('润色后的对外日志')
  })

  it('AI 服务异常 → 502 AI_FAILED（失败显式呈现，不静默回退原文）', async () => {
    await client.post('/api/config', { ai: { enabled: true, baseUrl: 'http://127.0.0.1:9', model: 'x', apiKey: '' } })
    const { status, body } = await client.post('/api/ai/polish', { text: 'hello world' })
    expect(status).toBe(502)
    expect((body as { code: string }).code).toBe('AI_FAILED')
  })
})

