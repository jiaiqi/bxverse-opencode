// packages/core/test/store.test.ts
// A2 · DataStore 索引增量化契约（optimization-plan A2）
// 覆盖：writeRecord 追加式维护 scope/global index + listRecords({limit, full}) 快速路径
//       + readRecord id→path 直接推导 + 性能断言 + 兼容性

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DataStore } from '../src/store'
import { ensureDirs, resolveHome } from '../src/home'
import type { ReleaseRecord } from '@bxverse/shared'

let home: string
let dataDir: string
let store: DataStore

function makeRecord(
  scopeId: string,
  version: string,
  opts: Partial<ReleaseRecord> = {},
): ReleaseRecord {
  const date = opts.date ?? new Date().toISOString()
  return {
    id: `rel_p_${scopeId}_v${version.replace(/\./g, '_')}`,
    kind: 'project',
    scopeId,
    scopeName: opts.scopeName ?? scopeId,
    version,
    baseVersion: version,
    buildStamp: opts.buildStamp ?? '0',
    bump: 'patch',
    date,
    commits: opts.commits ?? [],
    stats: opts.stats ?? {
      commits: 0,
      filesChanged: 0,
      insertions: 0,
      deletions: 0,
      byType: {} as never,
    },
    logs: {
      internal: { state: 'auto', content: `internal ${version}`, autoDraft: '' },
      external: { state: 'auto', content: `external ${version}`, autoDraft: '' },
    },
    tags: {},
    pushed: false,
    builtBy: '',
    ...opts,
  } as ReleaseRecord
}

beforeAll(() => {
  home = mkdtempSync(path.join(tmpdir(), 'bx-store-a2-'))
  process.env.BX_HOME = home
  // resolveHome 在 import 时已锁住 env，重新调用 ensureDirs 会读最新
  ensureDirs()
  dataDir = path.join(home, 'data')
  fs.mkdirSync(dataDir, { recursive: true })
  store = new DataStore({ home, dataDir })
})

afterAll(() => {
  // 清理临时 BX_HOME（不要污染全局）
  delete process.env.BX_HOME
  void resolveHome // 防止未使用警告
})

describe('A2 · DataStore 索引增量化', () => {
  it('A) writeRecord 追加式：scope index + global index 各插入一条，不重建', async () => {
    const r = makeRecord('p_alpha', '0.1.0')
    await store.writeRecord(r)

    const scopeIdx = JSON.parse(
      fs.readFileSync(path.join(dataDir, 'releases', 'p_alpha', 'index.json'), 'utf8'),
    ) as { releases: { id: string; version: string }[] }
    expect(scopeIdx.releases).toHaveLength(1)
    expect(scopeIdx.releases[0].id).toBe(r.id)

    const globalIdx = JSON.parse(fs.readFileSync(path.join(dataDir, 'index.json'), 'utf8')) as {
      releases: { id: string; scopeId: string }[]
    }
    expect(globalIdx.releases).toHaveLength(1)
    expect(globalIdx.releases[0].scopeId).toBe('p_alpha')
  })

  it('B) 写 200 条后，readRecord id→path 直接推导（命中已存在路径） < 5ms', async () => {
    const startScope = 'p_bench'
    const ids: string[] = []
    for (let i = 0; i < 200; i++) {
      const v = `0.${i + 1}.0`
      const r = makeRecord(startScope, v)
      await store.writeRecord(r)
      ids.push(r.id)
    }
    // 抽样 5 次 readRecord，断言 5ms 以内（本地 SSD 数量级）
    const sampleIds = [0, 50, 100, 150, 199].map((i) => ids[i]!)
    for (const id of sampleIds) {
      const t0 = performance.now()
      const rec = await store.readRecord(id)
      const dt = performance.now() - t0
      expect(rec, `readRecord(${id}) 不应返回 null`).toBeTruthy()
      expect(dt, `readRecord(${id}) 应 < 5ms，实际 ${dt.toFixed(2)}ms`).toBeLessThan(5)
    }
  })

  it('C) listRecords({ limit: 10, full: false }) 快速路径：不读 data.json（spy 验证）', async () => {
    const startScope = 'p_fastlist'
    for (let i = 0; i < 20; i++) {
      const v = `1.${i + 1}.0`
      await store.writeRecord(
        makeRecord(startScope, v, { date: new Date(Date.UTC(2026, 0, i + 1)).toISOString() }),
      )
    }
    // spy readFileSync：清点读取次数
    const original = fs.readFileSync
    let readCount = 0
    let indexReads = 0
    let dataJsonReads = 0
    fs.readFileSync = ((p: string | Buffer | URL, ...rest: unknown[]) => {
      const pathStr = typeof p === 'string' ? p : String(p)
      if (typeof pathStr === 'string' && pathStr.endsWith('index.json')) indexReads += 1
      else if (typeof pathStr === 'string' && pathStr.endsWith('data.json')) dataJsonReads += 1
      readCount += 1
      return original(p as string, ...(rest as []))
    }) as typeof fs.readFileSync
    try {
      const list = await store.listRecords(startScope, { limit: 10, full: false })
      expect(list).toHaveLength(10)
    } finally {
      fs.readFileSync = original
    }
    // full=false 模式：只读 1 次 index.json，0 次 data.json
    expect(indexReads, `index.json 读取次数应为 1，实际 ${indexReads}`).toBe(1)
    expect(dataJsonReads, `data.json 不应被读取，实际 ${dataJsonReads}`).toBe(0)
  })

  it('D) listRecords({ limit: 5, full: true }) 完整模式：按需读 5 个 data.json', async () => {
    const list = await store.listRecords('p_fastlist', { limit: 5, full: true })
    expect(list).toHaveLength(5)
    // 每条记录都有完整字段（commits/logs/stats 等非空）
    for (const rec of list) {
      expect(rec.commits).toBeDefined()
      expect(rec.logs).toBeDefined()
      expect(rec.stats).toBeDefined()
    }
  })

  it('E) readRecord 走 id→path：纯解析（不依赖索引）', async () => {
    const r = makeRecord('p_direct', '2.0.0')
    await store.writeRecord(r)
    // 直接读 data.json 路径推导版本号（不动用 index）
    const t0 = performance.now()
    const rec = await store.readRecord(r.id)
    const dt = performance.now() - t0
    expect(rec?.version).toBe('2.0.0')
    expect(dt).toBeLessThan(5)
  })

  it('F) 兼容性：旧 API listRecords(scopeId, 5) 仍返回完整 ReleaseRecord（默认 full=true）', async () => {
    const list = await store.listRecords('p_bench', 5)
    expect(list.length).toBeGreaterThan(0)
    expect(list.length).toBeLessThanOrEqual(5)
    // 完整字段
    for (const rec of list) {
      expect(rec.stats).toBeDefined()
      expect(rec.logs.internal).toBeDefined()
    }
  })

  it('G) 不存在的 scopeId → 空数组（不抛错）', async () => {
    const list = await store.listRecords('p_nonexistent_scope_xyz', { limit: 5, full: false })
    expect(list).toEqual([])
  })

  it('H) 索引未建（首次写）时回退到全扫（不抛错）', async () => {
    // 删掉 index.json，模拟冷启动
    const idxPath = path.join(dataDir, 'releases', 'p_bench', 'index.json')
    if (fs.existsSync(idxPath)) fs.unlinkSync(idxPath)
    const list = await store.listRecords('p_bench', { limit: 3, full: true })
    expect(list.length).toBeGreaterThan(0)
    expect(list.length).toBeLessThanOrEqual(3)
  })
})
