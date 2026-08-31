// apps/server/test/aggregate.test.ts
// D 方向 · GET /api/aggregate/{feed,timeline,export} 端到端契约
// 隔离 BX_HOME 起 app + 预置 release record（writeRecord），验证 3 端点行为

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Server } from 'node:http'
import type { AppConfig, ReleaseRecord } from '@bxverse/shared'
import { store as coreStore, ensureDirs } from '@bxverse/core'
import { createApp } from '../src/app'

let home: string
let cfg: AppConfig
let server: Server
let port: number
let token: string
let dataStore: coreStore.DataStore

function makeRecord(
  projectId: string,
  projectName: string,
  version: string,
  date: string,
  externalContent: string,
  opts: { deprecated?: boolean; repos?: Array<{ repoId: string; repoName: string }> } = {},
): ReleaseRecord {
  const repos = opts.repos ?? [{ repoId: 'r_app', repoName: 'web-app' }]
  return {
    id: `rel_${projectId}_${version.replace(/\./g, '_')}`,
    kind: 'project',
    scopeId: projectId,
    scopeName: projectName,
    version,
    baseVersion: '0.0.0',
    buildStamp: '0',
    bump: 'patch',
    date,
    commits: [],
    stats: {
      commits: 3,
      filesChanged: 0,
      insertions: 0,
      deletions: 0,
      byType: {
        feat: 3,
        fix: 0,
        chore: 0,
        refactor: 0,
        docs: 0,
        style: 0,
        perf: 0,
        test: 0,
        build: 0,
        ci: 0,
        revert: 0,
        other: 0,
      },
    },
    logs: {
      internal: { state: 'confirmed', content: '# internal', autoDraft: '# internal' },
      external: { state: 'confirmed', content: externalContent, autoDraft: externalContent },
    },
    repos: repos.map((r) => ({
      repoId: r.repoId,
      repoName: r.repoName,
      version,
      commits: [],
    })),
    tags: {},
    pushed: true,
    builtBy: 'test',
    deprecated: opts.deprecated,
  }
}

beforeAll(async () => {
  home = mkdtempSync(path.join(tmpdir(), 'bx-agg-'))
  process.env.BX_HOME = home
  ensureDirs()
  const dataDir = path.join(home, 'data')
  fs.mkdirSync(dataDir, { recursive: true })
  const base = await coreStore.loadAppConfig()
  cfg = {
    ...base,
    projects: [
      {
        id: 'p_alpha',
        name: '主产品线',
        version: '1.2.0',
        bump: 'auto',
        repoVersionScheme: 'hybrid',
        externalExclude: [],
        repos: [{ id: 'r_app', name: 'web-app', path: path.join(home, 'no-such-a') }],
      },
      {
        id: 'p_beta',
        name: 'data-platform',
        version: '1.0.0',
        bump: 'auto',
        repoVersionScheme: 'hybrid',
        externalExclude: [],
        repos: [{ id: 'r_etl', name: 'etl-worker', path: path.join(home, 'no-such-b') }],
      },
    ],
  }
  await coreStore.saveAppConfig(cfg)
  dataStore = new coreStore.DataStore({ dataDir: cfg.dataDir })

  // 预置跨项目 release
  await dataStore.writeRecord(
    makeRecord(
      'p_alpha',
      '主产品线',
      '1.2.0',
      '2026-08-20T10:00:00.000Z',
      '## 1.2.0\n- feat: web 改版',
    ),
  )
  await dataStore.writeRecord(
    makeRecord(
      'p_alpha',
      '主产品线',
      '1.1.0',
      '2026-08-15T10:00:00.000Z',
      '## 1.1.0\n- fix: API 鉴权',
    ),
  )
  await dataStore.writeRecord(
    makeRecord(
      'p_alpha',
      '主产品线',
      '1.0.0',
      '2026-08-01T10:00:00.000Z',
      '## 1.0.0\n- feat: 首版',
    ),
  )
  await dataStore.writeRecord(
    makeRecord(
      'p_beta',
      'data-platform',
      '1.0.0',
      '2026-08-18T10:00:00.000Z',
      '## ETL 1.0.0\n- feat: 增量同步',
      { deprecated: true },
    ),
  )

  const app = createApp()
  await app.start(0, '127.0.0.1')
  server = app.server
  const addr = server.address()
  port = typeof addr === 'object' && addr ? addr.port : 0
  const cfgRes = await fetch(`http://127.0.0.1:${port}/api/config`)
  const cfgBody = (await cfgRes.json()) as { token: string }
  token = cfgBody.token
}, 30_000)

afterAll(async () => {
  if (server) await new Promise<void>((r) => server.close(() => r()))
  delete process.env.BX_HOME
})

async function getJson<T>(p: string): Promise<{ status: number; body: T }> {
  const res = await fetch(`http://127.0.0.1:${port}${p}`, { headers: { 'X-BX-Token': token } })
  return { status: res.status, body: (await res.json()) as T }
}

async function getText(p: string): Promise<{ status: number; body: string; contentType: string }> {
  const res = await fetch(`http://127.0.0.1:${port}${p}`, { headers: { 'X-BX-Token': token } })
  return {
    status: res.status,
    body: await res.text(),
    contentType: res.headers.get('content-type') ?? '',
  }
}

describe('D 方向 · GET /api/aggregate/feed 端到端契约', () => {
  it('响应：total + items + tookMs + until', async () => {
    const { body } = await getJson<{
      until: string
      total: number
      items: unknown[]
      tookMs: number
    }>('/api/aggregate/feed?since=2026-08-01&until=2026-08-31')
    expect(typeof body.until).toBe('string')
    expect(body.total).toBe(4)
    expect(Array.isArray(body.items)).toBe(true)
    expect(typeof body.tookMs).toBe('number')
  })

  it('按时间倒序（最新在前）', async () => {
    const { body } = await getJson<{
      items: Array<{ date: string; projectName: string; version: string }>
    }>('/api/aggregate/feed?since=2026-08-01&until=2026-08-31')
    expect(body.items[0]?.date).toBe('2026-08-20T10:00:00.000Z') // p_alpha 1.2.0
    expect(body.items[0]?.projectName).toBe('主产品线')
    expect(body.items[0]?.version).toBe('1.2.0')
  })

  it('projectId 过滤：只取 p_alpha', async () => {
    const { body } = await getJson<{ total: number; items: Array<{ projectId: string }> }>(
      '/api/aggregate/feed?since=2026-08-01&until=2026-08-31&projectId=p_alpha',
    )
    expect(body.total).toBe(3)
    expect(body.items.every((i) => i.projectId === 'p_alpha')).toBe(true)
  })

  it('limit 截断', async () => {
    const { body } = await getJson<{ items: unknown[] }>(
      '/api/aggregate/feed?since=2026-08-01&until=2026-08-31&limit=2',
    )
    expect(body.items.length).toBe(2)
  })

  it('externalContent 字段包含 markdown 原文', async () => {
    const { body } = await getJson<{ items: Array<{ externalContent: string; version: string }> }>(
      '/api/aggregate/feed?since=2026-08-01&until=2026-08-31&projectId=p_beta',
    )
    const item = body.items[0]
    expect(item?.externalContent).toContain('ETL 1.0.0')
    expect(item?.externalContent).toContain('增量同步')
  })

  it('since 非法 → 400 VALIDATION', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/aggregate/feed?since=invalid`, {
      headers: { 'X-BX-Token': token },
    })
    expect(res.status).toBe(400)
  })

  it('until < since → 400 VALIDATION', async () => {
    const res = await fetch(
      `http://127.0.0.1:${port}/api/aggregate/feed?since=2026-08-20&until=2026-08-01`,
      { headers: { 'X-BX-Token': token } },
    )
    expect(res.status).toBe(400)
  })

  it('limit 超上限 200 自动截断', async () => {
    const { body } = await getJson<{ items: unknown[] }>(
      '/api/aggregate/feed?since=2026-08-01&until=2026-08-31&limit=999',
    )
    expect(body.items.length).toBeLessThanOrEqual(200)
  })
})

describe('D 方向 · GET /api/aggregate/timeline 端到端契约', () => {
  it('granularity=day 分桶：2026-08 命中 4 个不同日期', async () => {
    const { body } = await getJson<{
      granularity: string
      buckets: Array<{ key: string; count: number }>
      total: number
    }>('/api/aggregate/timeline?granularity=day&days=60')
    expect(body.granularity).toBe('day')
    expect(body.total).toBe(4)
    // 不同日期去重：2026-08-01/15/18/20 → 4 个 bucket
    const nonEmpty = body.buckets.filter((b) => b.count > 0)
    expect(nonEmpty.length).toBe(4)
  })

  it('granularity=month 分桶：全部归到 2026-08 一个 bucket', async () => {
    const { body } = await getJson<{
      buckets: Array<{ key: string; count: number }>
    }>('/api/aggregate/timeline?granularity=month&days=60')
    const aug = body.buckets.find((b) => b.key === '2026-08')
    expect(aug?.count).toBe(4)
  })

  it('granularity=week 分桶：周键格式 YYYY-Www', async () => {
    const { body } = await getJson<{ buckets: Array<{ key: string }> }>(
      '/api/aggregate/timeline?granularity=week&days=60',
    )
    const nonEmpty = body.buckets.filter((b) => b.key)
    expect(nonEmpty.length).toBeGreaterThan(0)
    expect(nonEmpty[0]?.key).toMatch(/^\d{4}-W\d{2}$/)
  })

  it('projectId 过滤影响 projectCount', async () => {
    const { body } = await getJson<{ projectCount: number }>(
      '/api/aggregate/timeline?granularity=day&days=60&projectId=p_beta',
    )
    expect(body.projectCount).toBe(1)
  })

  it('granularity 非法 → 400', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/aggregate/timeline?granularity=invalid`, {
      headers: { 'X-BX-Token': token },
    })
    expect(res.status).toBe(400)
  })
})

describe('D 方向 · GET /api/aggregate/export 端到端契约', () => {
  it('format=md 返回 markdown 文本 + Content-Disposition 头', async () => {
    const { status, body, contentType } = await getText(
      '/api/aggregate/export?since=2026-08-01&until=2026-08-31&format=md',
    )
    expect(status).toBe(200)
    expect(contentType).toContain('text/markdown')
    expect(body).toContain('# 升级日志聚合')
    expect(body).toContain('## 主产品线')
    expect(body).toContain('### 1.2.0')
    expect(body).toContain('feat: web 改版') // 嵌入 external content
  })

  it('format=json 返回 JSON 字符串', async () => {
    const { status, body, contentType } = await getText(
      '/api/aggregate/export?since=2026-08-01&until=2026-08-31&format=json',
    )
    expect(status).toBe(200)
    expect(contentType).toContain('application/json')
    const parsed = JSON.parse(body) as { items: Array<{ version: string }> }
    expect(parsed.items.length).toBe(4)
  })

  it('format 非法 → 400', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/aggregate/export?format=html`, {
      headers: { 'X-BX-Token': token },
    })
    expect(res.status).toBe(400)
  })

  it('无 token → 401', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/aggregate/feed`)
    expect(res.status).toBe(401)
  })
})
