// packages/core/test/engine-since.test.ts
// R33 借鉴：engine.collectChanges since 模式契约
import { describe, expect, it } from 'vitest'
import type { RepoDef } from '@bxverse/shared'
import { collectChanges } from '../src/engine'
import { makeRepo, commit, tag } from './helpers/repo'

describe('R33 engine.collectChanges since 模式', () => {
  it('since="lastBuildTag" → 仅返回上次 build tag 以来的提交', async () => {
    const repo = makeRepo()
    commit(repo, 'feat: 1', { 'a.ts': 'a' })
    tag(repo, 'build/v1.0.0.000000000000', 'build 1')
    commit(repo, 'feat: 2', { 'a.ts': 'b' })
    const r = await collectChanges({ id: 'r1', name: 'r1', path: repo } as RepoDef, {
      since: 'lastBuildTag',
    })
    // classifyCommit 把 'feat: 2' 拆成 type='feat' + subject='2'，所以这里校验 type
    expect(r.commits.length).toBeGreaterThanOrEqual(1)
    expect(r.commits.some((c) => c.type === 'feat' && c.subject === '2')).toBe(true)
    // 第一条 commit (feat: 1) 在 build tag 之前，不会出现
    expect(r.commits.some((c) => c.subject === '1')).toBe(false)
  })

  it('since="all" → 返回所有提交（baseRef=null 不传 range）', async () => {
    const repo = makeRepo()
    commit(repo, 'feat: a', { 'a.ts': 'a' })
    commit(repo, 'feat: b', { 'b.ts': 'b' })
    commit(repo, 'feat: c', { 'c.ts': 'c' })
    const r = await collectChanges({ id: 'r1', name: 'r1', path: repo } as RepoDef, {
      since: 'all',
    })
    expect(r.commits.length).toBeGreaterThanOrEqual(3)
    const subjects = r.commits.map((c) => c.subject)
    expect(subjects).toContain('a')
    expect(subjects).toContain('b')
    expect(subjects).toContain('c')
  })
})
