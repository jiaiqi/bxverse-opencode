// apps/server/test/cross.test.ts
// C 方向 · GET /api/cross/search 端到端契约
// 隔离 BX_HOME 起 app + 预置 release record（writeRecord），验证 commit/version/name 三种 type 命中 + 边界

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Server } from 'node:http'
import type { AppConfig, CrossSearchResponse, ReleaseRecord } from '@bxverse/shared'
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
  version: string,
  repos: Array<{
    repoId: string
    repoName: string
    commitHash: string
    subject: string
  }>,
  options: { deprecated?: boolean } = {},
): ReleaseRecord {
  const commitInfo = (hash: string, subject: string) => ({
    hash: hash.slice(0, 7),
    fullHash: hash,
    author: 'test',
    date: '2026-08-31',
    subject,
    type: 'feat' as const,
    scope: null,
    breaking: false,
    files: [],
  })
  return {
    id: `rel_${projectId}_${version.replace(/\./g, '_')}`,
    kind: 'project',
    scopeId: projectId,
    scopeName: projectId,
    version,
    baseVersion: '0.0.0',
    buildStamp: '0',
    bump: 'patch',
    date: '2026-08-31T10:00:00.000Z',
    commits: repos.map((r) => commitInfo(r.commitHash, r.subject)),
    stats: {
      commits: repos.length,
      filesChanged: 0,
      insertions: 0,
      deletions: 0,
      byType: {
        feat: repos.length,
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
      internal: { state: 'confirmed' as const, content: '# internal', autoDraft: '# internal' },
      external: { state: 'confirmed' as const, content: '# external', autoDraft: '# external' },
    },
    repos: repos.map((r) => ({
      repoId: r.repoId,
      repoName: r.repoName,
      version,
      commits: [commitInfo(r.commitHash, r.subject)],
    })),
    tags: {},
    pushed: true,
    builtBy: 'test',
    deprecated: options.deprecated,
    deprecateReason: options.deprecated ? '回退' : undefined,
  }
}

beforeAll(async () => {
  home = mkdtempSync(path.join(tmpdir(), 'bx-cross-'))
  process.env.BX_HOME = home
  ensureDirs()
  const dataDir = path.join(home, 'data')
  fs.mkdirSync(dataDir, { recursive: true })
  // core/store.ts 顶层 ensureDirs() 在 module load 时已锁定 APP_JSON 到 setup.ts 设的 BX_HOME
  // （store.ts:16 eager 求值），所以 loadAppConfig 拿到的 cfg.dataDir 始终是 setup 路径。
  // 因此 record 写到 setup 路径，与 app.start 后端用同一 dataStore。
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
        repos: [
          {
            id: 'r_app',
            name: 'web-app',
            path: path.join(home, 'no-such-a'),
            displayName: '前端 Web',
          },
          { id: 'r_api', name: 'api-server', path: path.join(home, 'no-such-b') },
        ],
      },
      {
        id: 'p_beta',
        name: 'data-platform',
        version: '1.0.0',
        bump: 'auto',
        repoVersionScheme: 'hybrid',
        externalExclude: [],
        repos: [{ id: 'r_etl', name: 'etl-worker', path: path.join(home, 'no-such-c') }],
      },
    ],
  }
  await coreStore.saveAppConfig(cfg)
  dataStore = new coreStore.DataStore({ dataDir: cfg.dataDir })

  // 预置 release records（写到 cfg.dataDir，与 app 端 listRecords 同一目录）
  await dataStore.writeRecord(
    makeRecord('p_alpha', '1.2.0', [
      {
        repoId: 'r_app',
        repoName: 'web-app',
        commitHash: 'abc1234567890abcdef0123456789abcdef0123',
        subject: 'feat: web 登录页改版',
      },
      {
        repoId: 'r_api',
        repoName: 'api-server',
        commitHash: 'def4567890abcdef1234567890abcdef01234567',
        subject: 'fix: API 鉴权空指针',
      },
    ]),
  )
  await dataStore.writeRecord(
    makeRecord('p_alpha', '1.1.0', [
      {
        repoId: 'r_app',
        repoName: 'web-app',
        commitHash: '111222333444555666777888999000aaabbbccdd',
        subject: 'feat: 列表虚拟滚动',
      },
    ]),
  )
  await dataStore.writeRecord(
    makeRecord(
      'p_beta',
      '1.0.0',
      [
        {
          repoId: 'r_etl',
          repoName: 'etl-worker',
          commitHash: 'abc9876543210fedcba9876543210fedcba98765',
          subject: 'feat: ETL 增量同步',
        },
      ],
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

describe('C 方向 · GET /api/cross/search 端到端契约', () => {
  it('type=commit 前缀命中（abc1 → p_alpha 两条 web-app + p_beta 一条 etl 都被 7 字符前缀命中）', async () => {
    const { status, body } = await getJson<CrossSearchResponse>(
      '/api/cross/search?q=abc1234&type=commit&limit=10',
    )
    expect(status).toBe(200)
    expect(body.type).toBe('commit')
    expect(body.total).toBe(1)
    expect(body.results[0]?.projectId).toBe('p_alpha')
    expect(body.results[0]?.shortCommit).toBe('abc1234')
    expect(body.results[0]?.commit).toBe('abc1234567890abcdef0123456789abcdef0123')
    expect(body.results[0]?.repoName).toBe('web-app')
    expect(body.results[0]?.version).toBe('1.2.0')
  })

  it('type=commit 短前缀（abc 命中 2 条跨项目：web-app + etl-worker）', async () => {
    const { body } = await getJson<CrossSearchResponse>(
      '/api/cross/search?q=abc&type=commit&limit=10',
    )
    expect(body.type).toBe('commit')
    // abc12345... 与 abc98765... 两条 commit 都以 abc 开头
    const repoNames = body.results.map((r) => r.repoName).sort()
    expect(repoNames).toEqual(['etl-worker', 'web-app'])
  })

  it('type=version 精确匹配（1.2.0 命中 p_alpha 一次；不带 v 前缀也命中）', async () => {
    const { body } = await getJson<CrossSearchResponse>('/api/cross/search?q=1.2.0&type=version')
    expect(body.total).toBe(1)
    expect(body.results[0]?.projectId).toBe('p_alpha')
    expect(body.results[0]?.version).toBe('1.2.0')
    expect(body.results[0]?.hint?.includes('发布')).toBe(true)
  })

  it('type=version 命中 deprecated release（1.0.0 → p_beta 标 已废弃）', async () => {
    const { body } = await getJson<CrossSearchResponse>('/api/cross/search?q=1.0.0&type=version')
    expect(body.total).toBe(1)
    expect(body.results[0]?.projectId).toBe('p_beta')
    expect(body.results[0]?.hint).toContain('已废弃')
  })

  it('type=name 命中项目名（产品 → 主产品线；子串匹配）', async () => {
    const { body } = await getJson<CrossSearchResponse>('/api/cross/search?q=产品&type=name')
    expect(body.total).toBe(1)
    expect(body.results[0]?.projectId).toBe('p_alpha')
    expect(body.results[0]?.projectName).toBe('主产品线')
  })

  it('type=name 命中仓库名（etl → p_beta/r_etl）', async () => {
    const { body } = await getJson<CrossSearchResponse>('/api/cross/search?q=etl&type=name')
    expect(body.total).toBe(1)
    expect(body.results[0]?.repoName).toBe('etl-worker')
    expect(body.results[0]?.repoId).toBe('r_etl')
  })

  it('type=name 命中 displayName（前端 → r_app）', async () => {
    const { body } = await getJson<CrossSearchResponse>('/api/cross/search?q=前端&type=name')
    expect(body.total).toBe(1)
    expect(body.results[0]?.repoId).toBe('r_app')
  })

  it('空命中（xxx 在所有项目都不存在）', async () => {
    const { body } = await getJson<CrossSearchResponse>(
      '/api/cross/search?q=xxxnomatchxxx&type=name',
    )
    expect(body.total).toBe(0)
    expect(body.results).toEqual([])
  })

  it('q 必填：缺失返回 400 VALIDATION', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/cross/search?type=commit`, {
      headers: { 'X-BX-Token': token },
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { code: string }
    expect(body.code).toBe('VALIDATION')
  })

  it('type 必填且枚举校验：非法返回 400', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/cross/search?q=abc&type=invalid`, {
      headers: { 'X-BX-Token': token },
    })
    expect(res.status).toBe(400)
  })

  it('limit 上限 200：超过截断', async () => {
    const { body } = await getJson<CrossSearchResponse>('/api/cross/search?q=a&type=name&limit=999')
    // limit > 200 自动截断到 200；不影响结果
    expect(body.results.length).toBeLessThanOrEqual(200)
  })

  it('无 token 返回 401', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/cross/search?q=abc&type=commit`)
    expect(res.status).toBe(401)
  })
})
