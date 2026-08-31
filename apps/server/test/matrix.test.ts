// apps/server/test/matrix.test.ts
// R31 · GET /api/matrix 端到端契约（端到端 0 入侵：仅调 core/buildMatrix）
// 隔离 BX_HOME 起 app（不复用 server.test.ts env），验证端点响应结构与 0 入侵特性

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Server } from 'node:http'
import type { AppConfig, VersionMatrix } from '@bxverse/shared'
import { store as coreStore, ensureDirs } from '@bxverse/core'
import { createApp } from '../src/app'

let home: string
let dataDir: string
let cfg: AppConfig
let server: Server
let port: number
let token: string

function makeRepo(
  id: string,
  name: string,
  p: string,
): AppConfig['projects'][number]['repos'][number] {
  return { id, name, path: p }
}

beforeAll(async () => {
  home = mkdtempSync(path.join(tmpdir(), 'bx-matrix-'))
  process.env.BX_HOME = home
  ensureDirs()
  dataDir = path.join(home, 'data')
  fs.mkdirSync(dataDir, { recursive: true })
  // 基于 default cfg 改 projects
  const base = await coreStore.loadAppConfig()
  cfg = {
    ...base,
    projects: [
      {
        id: 'p_A',
        name: '主产品线',
        version: '1.2.0',
        bump: 'auto',
        repoVersionScheme: 'hybrid',
        externalExclude: [],
        repos: [
          makeRepo('r_a', 'l-pc-front', path.join(home, 'no-such-a')),
          makeRepo('r_b', 'l-data-v', path.join(home, 'no-such-b')),
        ],
      },
      {
        id: 'p_B',
        name: '灰度项目',
        version: '1.0.0',
        bump: 'auto',
        repoVersionScheme: 'hybrid',
        externalExclude: [],
        repos: [makeRepo('r_c', 'l-pc-front', path.join(home, 'no-such-c'))],
      },
    ],
  }
  await coreStore.saveAppConfig(cfg)
  const app = createApp()
  await app.start(0, '127.0.0.1')
  server = app.server
  const addr = server.address()
  port = typeof addr === 'object' && addr ? addr.port : 0
  // 触发 ensureToken：先请求一次 /api/config（GET 免 token 下发），让 app 内的 token 初始化
  const cfgRes = await fetch(`http://127.0.0.1:${port}/api/config`)
  const cfgBody = (await cfgRes.json()) as { token: string }
  token = cfgBody.token
  expect(token.length).toBeGreaterThan(0)
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

describe('R31 · GET /api/matrix 端到端契约', () => {
  it('响应结构：generatedAt + columns + projects + driftColumns + totals', async () => {
    const m = await getJson<VersionMatrix>('/api/matrix')
    expect(typeof m.generatedAt).toBe('string')
    expect(Array.isArray(m.columns)).toBe(true)
    expect(Array.isArray(m.projects)).toBe(true)
    expect(Array.isArray(m.driftColumns)).toBe(true)
    expect(m.totals).toBeTypeOf('object')
    expect(m.totals.projects).toBe(2)
    expect(m.totals.repos).toBe(3)
  })

  it('列归一：同 path 跨项目合为一列，displayName 含 · N 项目', async () => {
    const m = await getJson<VersionMatrix>('/api/matrix')
    // 3 个仓库路径都不同（no-such-a / no-such-b / no-such-c）→ 3 列
    expect(m.columns).toHaveLength(3)
    // 没有两个项目同 path → 全部 occurrences=1
    for (const col of m.columns) {
      expect(col.occurrences).toBe(1)
      expect(col.displayName).toBe(col.app)
    }
  })

  it('项目行：每个项目下 cells 含其所有 repoId', async () => {
    const m = await getJson<VersionMatrix>('/api/matrix')
    const pA = m.projects.find((p) => p.id === 'p_A')
    const pB = m.projects.find((p) => p.id === 'p_B')
    expect(pA).toBeDefined()
    expect(pB).toBeDefined()
    expect(Object.keys(pA!.cells).sort()).toEqual(['r_a', 'r_b'])
    expect(Object.keys(pB!.cells)).toEqual(['r_c'])
  })

  it('路径不存在：version 走项目 fallback（engine 容错不抛错，cell 不标 pollFailed）', async () => {
    // 业务背景：core engine.collectChanges 路径不存在时静默返回空 RepoStatus（设计哲学：git 永不 throw）；
    // matrix 聚合时无 versionFile → fallback 到项目 version。`pollFailed=true` 路径由 core 单测覆盖（mock getStatus 抛错）。
    const m = await getJson<VersionMatrix>('/api/matrix')
    const cell = m.projects[0].cells.r_a
    expect(cell.version).toBe('1.2.0') // project.version fallback
    expect(cell.pollFailed).toBeFalsy()
    expect(cell.changed).toBe(false)
    expect(cell.commits).toBe(0)
  })

  it('无 token → 401（鉴权未跳过）', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/matrix`)
    expect(res.status).toBe(401)
  })
})
