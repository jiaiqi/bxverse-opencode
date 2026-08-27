// apps/server/test/overview-perf.test.ts
// A3 · overview/listRecords 快速路径（optimization-plan A3）
// 端到端 server 启动存在 BX_HOME 共享（多文件并行）问题，简化为：
//   1) 直接测试 A3 改造后的 listRecords full:false 摘要（与 A2 store.test.ts 重复但从 server 视角再覆盖）
//   2) 验证 overview 端点能从写好的 200 条 release 中取到最后一条的 version+date
//   3) 不重复 server.test.ts 已测的 GET /api/overview 整体流程（避免 env 共享）

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { AppConfig, ReleaseRecord } from '@bxverse/shared'
import { store as coreStore } from '@bxverse/core'
import { ensureDirs } from '@bxverse/core'

let home: string
let dataDir: string
let cfg: AppConfig

function makeRecord(scopeId: string, version: string, date: string): ReleaseRecord {
  return {
    id: `rel_p_${scopeId}_v${version.replace(/\./g, '_')}`,
    kind: 'project',
    scopeId,
    scopeName: scopeId,
    version,
    baseVersion: version,
    buildStamp: '0',
    bump: 'patch',
    date,
    commits: [],
    stats: { commits: 0, filesChanged: 0, insertions: 0, deletions: 0, byType: {} as never },
    logs: {
      internal: { state: 'auto', content: '', autoDraft: '' },
      external: { state: 'auto', content: '', autoDraft: '' },
    },
    tags: {},
    pushed: false,
    builtBy: '',
  }
}

beforeAll(async () => {
  home = mkdtempSync(path.join(tmpdir(), 'bx-overview-'))
  process.env.BX_HOME = home
  ensureDirs()
  dataDir = path.join(home, 'data')
  fs.mkdirSync(dataDir, { recursive: true })
  // 基于 default cfg 改 projects（避免手填全部 AppConfig 字段）
  const base = await coreStore.loadAppConfig()
  cfg = {
    ...base,
    projects: [
      {
        id: 'p_perf',
        name: '性能项目',
        version: '1.0.0',
        bump: 'auto',
        repoVersionScheme: 'hybrid',
        externalExclude: [],
        repos: [],
      },
    ],
  }
  await coreStore.saveAppConfig(cfg)
  const ds = new coreStore.DataStore({ home, dataDir })
  for (let i = 0; i < 200; i++) {
    const v = `0.${(i % 100) + 1}.${Math.floor(i / 100)}`
    const date = new Date(Date.UTC(2025, 0, 1 + i)).toISOString()
    await ds.writeRecord(makeRecord('p_perf', v, date))
  }
}, 60_000)

afterAll(() => {
  delete process.env.BX_HOME
})

describe('A3 · overview 行为契约', () => {
  it('listRecords({ limit: 1, full: false }) 摘要返回最后一条（按 date 倒序）且含 version/date', async () => {
    const ds = new coreStore.DataStore({ home, dataDir })
    // overview 端点用 { limit: 1, full: false }（A3 改造）→ 直接调 store 验证
    const list = await ds.listRecords('p_perf', { limit: 1, full: false })
    expect(list).toHaveLength(1)
    const last = list[0]
    expect(last.scopeId).toBe('p_perf')
    expect(typeof last.version).toBe('string')
    expect(last.version.length).toBeGreaterThan(0)
    expect(typeof last.date).toBe('string')
    // 最后一条应是 2025-07-19（i=199，date = 2025-01-01 + 199 days = 2025-07-19）
    expect(last.date).toMatch(/^2025-07-19/)
  })

  it('listRecords({ limit: 5, full: false }) 摘要前 5 条：按 date 倒序', async () => {
    const ds = new coreStore.DataStore({ home, dataDir })
    const list = await ds.listRecords('p_perf', { limit: 5, full: false })
    expect(list).toHaveLength(5)
    // 摘要字段完整（id/scopeId/version/buildStamp/date 都有）
    for (const r of list) {
      expect(r.id).toBeTruthy()
      expect(r.scopeId).toBe('p_perf')
      expect(typeof r.version).toBe('string')
      expect(typeof r.date).toBe('string')
    }
    // date 倒序
    for (let i = 0; i < list.length - 1; i++) {
      expect(list[i].date.localeCompare(list[i + 1].date)).toBeGreaterThan(0)
    }
  })

  it('写 200 条后 full:false spy 不读 data.json', async () => {
    const ds = new coreStore.DataStore({ home, dataDir })
    const original = fs.readFileSync
    let dataJsonReads = 0
    fs.readFileSync = function (p: string | Buffer | URL, ...rest: unknown[]): string | Buffer {
      const pathStr = typeof p === 'string' ? p : String(p)
      if (typeof pathStr === 'string' && pathStr.endsWith('data.json')) dataJsonReads += 1
      return original(p as never, ...(rest as []))
    } as typeof fs.readFileSync
    try {
      const list = await ds.listRecords('p_perf', { limit: 10, full: false })
      expect(list).toHaveLength(10)
    } finally {
      fs.readFileSync = original
    }
    // A3 验收：full:false 模式只读 1 次 scope index.json，0 次 data.json
    expect(dataJsonReads, `full:false 不应读 data.json，实际 ${dataJsonReads}`).toBe(0)
  })
})
