// R33 多对多 · loadAppConfig repoRefs 展开契约
// projects/ 目录为权威源（saveAppConfig 落盘）；repoRefs 命中 repoRegistry 优先物化；
// 未命中 repoRef 丢弃；resolved 空/无 registry 回退内嵌 repos；registry/repoRefs 落盘不丢失

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { loadAppConfig, saveAppConfig, APP_DIR } from '../src/store'
import type { AppConfig } from '@bxverse/shared'

beforeAll(() => {
  process.env.BX_HOME = mkdtempSync(path.join(tmpdir(), 'bx-store-registry-'))
})

afterAll(() => {
  delete process.env.BX_HOME
})

const legacyRepo = { id: 'r_legacy', name: 'legacy-app', path: '/tmp/legacy' }
const regA = { id: 'r_a', name: 'l-pc-front', path: '/repo/pc', displayName: '主站前端' }
const regB = { id: 'r_b', name: 'l-data-v', path: '/repo/dv' }

function baseProject(over: Record<string, unknown> = {}): AppConfig['projects'][number] {
  return {
    id: 'p_main',
    name: '主产品线',
    version: 'v1.0.0',
    bump: 'auto',
    repoVersionScheme: 'hybrid',
    externalExclude: [],
    repos: [legacyRepo],
    ...over,
  } as AppConfig['projects'][number]
}

describe('R33 · repoRefs 展开', () => {
  it('未启用注册表/无 repoRefs：内嵌 repos 原样保留', async () => {
    await saveAppConfig({
      ...({} as AppConfig),
      projects: [baseProject()],
    })
    const cfg = await loadAppConfig()
    expect(cfg.projects[0].repos).toEqual([legacyRepo])
  })

  it('repoRefs 命中注册表：repos 按引用展开且顺序一致', async () => {
    await saveAppConfig({
      ...({} as AppConfig),
      repoRegistry: [regA, regB],
      projects: [baseProject({ repoRefs: ['r_b', 'r_a'] })],
    })
    const cfg = await loadAppConfig()
    expect(cfg.projects[0].repos.map((r) => r.id)).toEqual(['r_b', 'r_a'])
    expect(cfg.projects[0].repos[0].name).toBe('l-data-v')
  })

  it('repoRefs 未命中条目被丢弃；全部未命中回退内嵌 repos', async () => {
    await saveAppConfig({
      ...({} as AppConfig),
      repoRegistry: [regA],
      projects: [
        baseProject({ id: 'p_p1', repoRefs: ['r_a', 'r_missing'] }),
        baseProject({ id: 'p_p2', repoRefs: ['r_ghost'] }),
      ],
    })
    const cfg = await loadAppConfig()
    expect(cfg.projects[0].repos.map((r) => r.id)).toEqual(['r_a'])
    expect(cfg.projects[1].repos).toEqual([legacyRepo])
  })

  it('展开为视图：saveAppConfig 往返后 registry 与 repoRefs 原样保留', async () => {
    await saveAppConfig({
      ...({} as AppConfig),
      repoRegistry: [regA, regB],
      projects: [baseProject({ repoRefs: ['r_a'] })],
    })
    const cfg = await loadAppConfig()
    cfg.projects[0].version = 'v1.1.0'
    await saveAppConfig(cfg)
    const raw = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'app.json'), 'utf8')) as AppConfig
    expect(raw.repoRegistry).toHaveLength(2)
    expect(raw.projects[0].repoRefs).toEqual(['r_a'])
    expect(raw.projects[0].version).toBe('v1.1.0')
  })
})
