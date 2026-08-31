// packages/core/test/matrix.test.ts
// Version Matrix 矩阵聚合单测：零依赖、纯函数行为校验（getStatus + dataStore.listRecords mock）
import { describe, expect, it } from 'vitest'
import type {
  AppConfig,
  ProjectDef,
  RepoDef,
  RepoStatus,
  ReleaseRecord,
  CommitInfo,
} from '@bxverse/shared'
import { buildMatrix } from '../src/matrix'
import type { DataStore } from '../src/store'

// ============= 辅助：mock =============

/** mock DataStore：仅 listRecords 路径（其余方法 cast 为 never 不被调用） */
function mockDataStore(byScope: Record<string, ReleaseRecord[] | Error>): DataStore {
  return {
    listRecords: async (scopeId: string) => {
      const v = byScope[scopeId]
      if (v instanceof Error) throw v
      return v ?? []
    },
  } as unknown as DataStore
}

/** mock getStatus：按 repo.id 返回 RepoStatus 或 throw */
function mockGetStatus(
  byRepoId: Record<string, RepoStatus | Error>,
): (r: RepoDef) => Promise<RepoStatus> {
  return async (r: RepoDef) => {
    const v = byRepoId[r.id]
    if (v instanceof Error) throw v
    if (!v) throw new Error(`no mock for ${r.id}`)
    return v
  }
}

function repo(id: string, name: string, path: string, partial: Partial<RepoDef> = {}): RepoDef {
  return { id, name, path, ...partial }
}

function project(id: string, name: string, version: string, repos: RepoDef[]): ProjectDef {
  return {
    id,
    name,
    version,
    bump: 'auto',
    repoVersionScheme: 'hybrid',
    externalExclude: [],
    repos,
  }
}

function cfg(projects: ProjectDef[]): AppConfig {
  return { projects, pwa: { enabled: false } } as unknown as AppConfig
}

function makeStatus(repo: RepoDef, partial: Partial<RepoStatus> = {}): RepoStatus {
  return {
    id: repo.id,
    name: repo.name,
    path: repo.path,
    branch: 'master',
    head: 'abc12345',
    dirty: 0,
    hasRemote: false,
    remoteUrl: '',
    versionFile: { version: '1.0.0', build: '', buildTime: '' },
    buildTags: [],
    milestoneTag: null,
    changed: false,
    lastPublishCommit: null,
    commits: [],
    ...partial,
  }
}

function fakeCommit(subject: string): CommitInfo {
  return {
    hash: subject.slice(0, 7),
    fullHash: 'a'.repeat(40),
    author: 'tester',
    date: '2026-08-31',
    subject,
    type: 'feat',
    scope: null,
    breaking: false,
    files: [],
  }
}

function makeRecord(scopeId: string, version: string, date: string): ReleaseRecord {
  return {
    id: `rel_${scopeId}_${version}`,
    kind: 'project',
    scopeId,
    scopeName: scopeId,
    version,
    baseVersion: version,
    buildStamp: '',
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
    builtBy: 'test',
  }
}

// ============= 测试 =============

describe('matrix：跨项目×跨工程版本矩阵聚合（R31）', () => {
  it('空配置 → 空矩阵', async () => {
    const r = await buildMatrix(cfg([]), mockGetStatus({}), mockDataStore({}))
    expect(r.projects).toEqual([])
    expect(r.columns).toEqual([])
    expect(r.driftColumns).toEqual([])
    expect(r.totals).toEqual({ projects: 0, repos: 0, changed: 0, driftColumns: 0 })
    expect(typeof r.generatedAt).toBe('string')
  })

  it('单项目单仓：version=1.0.0 + lastRelease=null + changed=false', async () => {
    const p = project('p1', '主产品线', '1.0.0', [repo('r1', 'l-pc-front', 'E:/r1')])
    const r = await buildMatrix(
      cfg([p]),
      mockGetStatus({ r1: makeStatus(p.repos[0]) }),
      mockDataStore({}),
    )
    expect(r.projects).toHaveLength(1)
    expect(r.columns).toHaveLength(1)
    expect(r.columns[0].app).toBe('l-pc-front')
    expect(r.columns[0].occurrences).toBe(1)
    expect(r.columns[0].displayName).toBe('l-pc-front') // 不带 · N 项目
    expect(r.projects[0].cells.r1.version).toBe('1.0.0')
    expect(r.projects[0].cells.r1.lastRelease).toBeNull()
    expect(r.projects[0].cells.r1.changed).toBe(false)
    expect(r.projects[0].cells.r1.pollFailed).toBeUndefined()
    expect(r.totals).toEqual({ projects: 1, repos: 1, changed: 0, driftColumns: 0 })
  })

  it('多项目同 path 仓库 → 同列 + occurrences=2 + displayName 含 · 2 项目', async () => {
    const r1 = repo('r_a', 'l-pc-front', 'E:/shared/pc') // 项目 A
    const r2 = repo('r_b', 'l-pc-front', 'E:\\shared\\pc') // 项目 B（同 path，不同 RepoDef.id；Windows 路径归一）
    const pA = project('pA', '主产品线', '1.0.0', [r1])
    const pB = project('pB', '灰度项目', '1.0.0', [r2])
    const r = await buildMatrix(
      cfg([pA, pB]),
      mockGetStatus({
        r_a: makeStatus(r1, { versionFile: { version: '1.0.0', build: '', buildTime: '' } }),
        r_b: makeStatus(r2, { versionFile: { version: '1.0.0', build: '', buildTime: '' } }),
      }),
      mockDataStore({}),
    )
    expect(r.columns).toHaveLength(1)
    expect(r.columns[0].app).toBe('l-pc-front')
    expect(r.columns[0].occurrences).toBe(2)
    expect(r.columns[0].displayName).toBe('l-pc-front · 2 项目')
    expect(r.projects).toHaveLength(2)
    expect(r.totals.repos).toBe(2)
    expect(r.driftColumns).toEqual([])
  })

  it('drift：同 path 跨项目 version 不一致 → driftColumns 含该 app', async () => {
    const r1 = repo('r_a', 'l-pc-front', 'E:/shared/pc')
    const r2 = repo('r_b', 'l-pc-front', 'E:/shared/pc')
    const pA = project('pA', '主产品线', '1.2.0', [r1])
    const pB = project('pB', '灰度项目', '1.0.0', [r2])
    const r = await buildMatrix(
      cfg([pA, pB]),
      mockGetStatus({
        r_a: makeStatus(r1, { versionFile: { version: '1.2.0', build: '', buildTime: '' } }),
        r_b: makeStatus(r2, { versionFile: { version: '1.0.0', build: '', buildTime: '' } }),
      }),
      mockDataStore({}),
    )
    expect(r.driftColumns).toContain('l-pc-front')
    expect(r.totals.driftColumns).toBe(1)
  })

  it('失败仓容错：getStatus 抛错 → cell.version="-" + pollFailed=true（不阻断其他仓）', async () => {
    const r1 = repo('r_ok', 'l-pc-front', 'E:/ok')
    const r2 = repo('r_fail', 'l-data-v', 'E:/fail')
    const p = project('p1', '主产品线', '1.0.0', [r1, r2])
    const r = await buildMatrix(
      cfg([p]),
      mockGetStatus({
        r_ok: makeStatus(r1),
        r_fail: new Error('路径不存在'),
      }),
      mockDataStore({}),
    )
    expect(r.projects[0].cells.r_ok.version).toBe('1.0.0')
    expect(r.projects[0].cells.r_ok.pollFailed).toBeUndefined()
    expect(r.projects[0].cells.r_fail.version).toBe('-')
    expect(r.projects[0].cells.r_fail.pollFailed).toBe(true)
    expect(r.projects[0].cells.r_fail.changed).toBe(false)
    // 失败仓不计入 changed/dirty
    expect(r.projects[0].changedCount).toBe(0)
    // 失败仓不应触发 drift（pollFailed=true 排除）
    expect(r.driftColumns).toEqual([])
  })

  it('lastRelease 失败容错：dataStore.listRecords 抛错 → cell.lastRelease=null（不阻断 status）', async () => {
    const r1 = repo('r1', 'l-pc-front', 'E:/r1')
    const p = project('p1', '主产品线', '1.0.0', [r1])
    const r = await buildMatrix(
      cfg([p]),
      mockGetStatus({ r1: makeStatus(r1) }),
      mockDataStore({ r1: new Error('IO 失败') }),
    )
    expect(r.projects[0].cells.r1.version).toBe('1.0.0')
    expect(r.projects[0].cells.r1.lastRelease).toBeNull()
    expect(r.projects[0].lastRelease).toBeNull()
  })

  it('drift 排除 -：同 app 但只有 1 个项目能成功读 version → 不算 drift', async () => {
    const r1 = repo('r_a', 'l-pc-front', 'E:/shared/pc')
    const r2 = repo('r_b', 'l-pc-front', 'E:/shared/pc')
    const pA = project('pA', '主产品线', '1.0.0', [r1])
    const pB = project('pB', '灰度项目', '1.0.0', [r2])
    const r = await buildMatrix(
      cfg([pA, pB]),
      mockGetStatus({
        r_a: makeStatus(r1, { versionFile: { version: '1.0.0', build: '', buildTime: '' } }),
        r_b: new Error('读失败'),
      }),
      mockDataStore({}),
    )
    // B 仓 pollFailed → '-' → 不进 drift 集合（只有 1 个有效 version）
    expect(r.driftColumns).toEqual([])
  })

  it('列排序：occurrences desc 优先，相同按 app asc', async () => {
    const rA = repo('rA', 'a-only', 'E:/a')
    const rB1 = repo('rB1', 'b-shared', 'E:/shared/b')
    const rB2 = repo('rB2', 'b-shared', 'E:/shared/b')
    const rC1 = repo('rC1', 'c-twice', 'E:/c')
    const rC2 = repo('rC2', 'c-twice', 'E:/c')
    const rC3 = repo('rC3', 'c-twice', 'E:/c')
    const p1 = project('p1', 'p1', '1.0.0', [rA, rB1, rC1])
    const p2 = project('p2', 'p2', '1.0.0', [rB2, rC2])
    const p3 = project('p3', 'p3', '1.0.0', [rC3])
    const r = await buildMatrix(
      cfg([p1, p2, p3]),
      mockGetStatus({
        rA: makeStatus(rA),
        rB1: makeStatus(rB1),
        rB2: makeStatus(rB2),
        rC1: makeStatus(rC1),
        rC2: makeStatus(rC2),
        rC3: makeStatus(rC3),
      }),
      mockDataStore({}),
    )
    expect(r.columns.map((c) => c.app)).toEqual(['c-twice', 'b-shared', 'a-only'])
    expect(r.columns[0].displayName).toBe('c-twice · 3 项目')
    expect(r.columns[1].displayName).toBe('b-shared · 2 项目')
    expect(r.columns[2].displayName).toBe('a-only')
  })

  it('changed 计数 + lastRelease 摘要聚合', async () => {
    const r1 = repo('r1', 'l-pc-front', 'E:/r1')
    const r2 = repo('r2', 'l-data-v', 'E:/r2')
    const p = project('p1', '主产品线', '1.0.0', [r1, r2])
    const r = await buildMatrix(
      cfg([p]),
      mockGetStatus({
        r1: makeStatus(r1, { changed: true, commits: [fakeCommit('feat: x')] }),
        r2: makeStatus(r2, { dirty: 2 }),
      }),
      mockDataStore({
        r1: [makeRecord('r1', '1.0.0', '2026-08-30T10:00:00Z')],
        p1: [makeRecord('p1', '1.0.0', '2026-08-29T10:00:00Z')],
      }),
    )
    expect(r.projects[0].changedCount).toBe(1)
    expect(r.projects[0].dirtyCount).toBe(1)
    expect(r.projects[0].cells.r1.commits).toBe(1)
    expect(r.projects[0].cells.r1.lastRelease?.version).toBe('1.0.0')
    expect(r.projects[0].lastRelease?.version).toBe('1.0.0')
    expect(r.totals.changed).toBe(1)
  })
})
