// apps/server/test/rollback.test.ts
// R32 升级后回退端到端契约：GET preview + POST execute + 401
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Server } from 'node:http'
import type { AppConfig, ReleaseRecord, RollbackPreview, RollbackResult } from '@bxverse/shared'
import { store as coreStore, ensureDirs } from '@bxverse/core'
import { createApp } from '../src/app'

let home: string
let dataDir: string
let cfg: AppConfig
let server: Server
let port: number
let token: string

function makeRelease(
  scopeId: string,
  version: string,
  opts: {
    to?: string
    date?: string
  } = {},
): ReleaseRecord {
  return {
    id: `rel_${scopeId}_v${version.replace(/\./g, '_')}`,
    kind: 'project',
    scopeId,
    scopeName: scopeId,
    version,
    baseVersion: version,
    buildStamp: '000000000000',
    bump: 'patch',
    date: opts.date ?? '2026-08-31T10:00:00.000Z',
    to: opts.to,
    commits: [],
    stats: { commits: 0, filesChanged: 0, insertions: 0, deletions: 0, byType: {} as never },
    logs: {
      internal: { state: 'auto', content: '', autoDraft: '' },
      external: { state: 'auto', content: '', autoDraft: '' },
    },
    repos: [
      {
        repoId: 'r1',
        repoName: 'r1',
        version: '',
        commits: [
          {
            hash: (opts.to ?? '0000000').slice(0, 7),
            fullHash: opts.to ?? '0000000000000000000000000000000000000000',
            author: 'a',
            date: '2026-08-30',
            subject: 'init',
            type: 'feat' as const,
            scope: null,
            breaking: false,
            files: [],
          },
        ],
      },
    ],
    tags: {},
    pushed: true,
    builtBy: 'test',
  }
}

beforeAll(async () => {
  home = mkdtempSync(path.join(tmpdir(), 'bx-rollback-'))
  process.env.BX_HOME = home
  ensureDirs()
  dataDir = path.join(home, 'data')
  fs.mkdirSync(dataDir, { recursive: true })
  const base = await coreStore.loadAppConfig()
  cfg = {
    ...base,
    dataDir, // 关键：让 app 端 dataStore 用 BX_HOME 隔离路径
    projects: [
      {
        id: 'p_rb',
        name: 'rb-test',
        version: '1.0.0',
        bump: 'auto',
        repoVersionScheme: 'hybrid',
        externalExclude: [],
        repos: [{ id: 'r1', name: 'r1', path: path.join(home, 'no-such') }],
      },
    ],
  }
  await coreStore.saveAppConfig(cfg)
  const ds = new coreStore.DataStore({ home, dataDir })
  await ds.writeRecord(makeRelease('p_rb', '1.0.0', { to: 'a'.repeat(40) }))
  const app = createApp()
  await app.start(0, '127.0.0.1')
  server = app.server
  port = (server.address() as { port: number }).port
  const cfgRes = await fetch(`http://127.0.0.1:${port}/api/config`)
  const cfgBody = (await cfgRes.json()) as { token: string }
  token = cfgBody.token
}, 30_000)

afterAll(async () => {
  if (server) await new Promise<void>((r) => server.close(() => r()))
  delete process.env.BX_HOME
})

async function getJson<T>(p: string): Promise<T> {
  const res = await fetch(`http://127.0.0.1:${port}${p}`, { headers: { 'X-BX-Token': token } })
  expect(res.status).toBe(200)
  return (await res.json()) as T
}

describe('R32 rollback：端到端契约', () => {
  it('GET /api/projects/:id/rollback/preview 响应结构', async () => {
    const preview = await getJson<RollbackPreview>(
      '/api/projects/p_rb/rollback/preview?targetReleaseId=rel_p_rb_v1_0_0',
    )
    expect(preview.targetVersion).toBe('1.0.0')
    expect(preview.targetRelease.id).toBe('rel_p_rb_v1_0_0')
    expect(preview.currentRelease).toBeNull() // 单条 release，current 是 null
    expect(preview.repos[0].repoId).toBe('r1')
    expect(preview.riskLevel).toBe('ok') // path 不存在 → engine 容错返回 dirty=0
    expect(preview.nextVersionSuggestion).toBe('1.0.1')
  })

  it('POST /api/projects/:id/rollback confirmed=true → newReleaseId + deprecate 链 + tag', async () => {
    const result = await getJson<RollbackResult>('/api/projects/p_rb/rollback').catch(async () => {
      // GET 默认不是 POST，走真正的 POST
      const res = await fetch('http://127.0.0.1:' + port + '/api/projects/p_rb/rollback', {
        method: 'POST',
        headers: { 'X-BX-Token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetReleaseId: 'rel_p_rb_v1_0_0',
          nextVersion: '1.0.1',
          bump: 'patch',
          confirmed: true,
          offline: true,
        }),
      })
      expect(res.status).toBe(200)
      return (await res.json()) as RollbackResult
    })
    expect(result.newReleaseId).toMatch(/^rel_p_p_rb_1_0_1$/)
    expect(result.deprecatedReleaseIds.length).toBeGreaterThanOrEqual(1)
  })

  it('无 token → 401（鉴权未跳过）', async () => {
    const res = await fetch(
      `http://127.0.0.1:${port}/api/projects/p_rb/rollback/preview?targetReleaseId=rel_p_rb_v1_0_0`,
    )
    expect(res.status).toBe(401)
  })

  it('POST confirmed=false → 400 CONFIRM_REQUIRED', async () => {
    const res = await fetch('http://127.0.0.1:' + port + '/api/projects/p_rb/rollback', {
      method: 'POST',
      headers: { 'X-BX-Token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetReleaseId: 'rel_p_rb_v1_0_0',
        nextVersion: '1.0.1',
        bump: 'patch',
        confirmed: false, // 故意 false
      }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { code: string }
    expect(body.code).toBe('CONFIRM_REQUIRED')
  })
})
