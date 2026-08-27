// packages/core/test/doctor.test.ts
// 一致性体检单测：使用临时 BX_HOME + fixture 仓库，验证 read-only 体检结果与各档位
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { git } from '../src/git'
import { runDoctor } from '../src/doctor'
import { commit, makeRepo } from './helpers/repo'
import type { AppConfig, ProjectDef, RepoDef } from '@bxverse/shared'

function makeProject(repos: RepoDef[]): ProjectDef {
  return {
    id: 'p1',
    name: 'demo',
    version: '1.0.0',
    bump: 'auto',
    repoVersionScheme: 'hybrid',
    externalExclude: [],
    repos,
  }
}

function cfg(projects: ProjectDef[]): AppConfig {
  return { projects, pwa: { enabled: false } } as unknown as AppConfig
}

describe('doctor：一致性体检（Phase 2.1）', () => {
  it('空配置 → 整体 ok，counts 全 0', async () => {
    const r = await runDoctor(cfg([]), '/tmp/h')
    expect(r.overall).toBe('ok')
    expect(r.counts).toEqual({ ok: 0, warn: 0, error: 0 })
    expect(r.projects).toEqual([])
  })

  it('路径不存在 → error + 提示', async () => {
    const r = await runDoctor(
      cfg([makeProject([{ id: 'r1', name: 'r1', path: 'Z:/no/such/dir' }])]),
      process.env.BX_HOME!,
    )
    expect(r.overall).toBe('error')
    expect(r.counts.error).toBe(1)
    expect(r.projects[0].repos[0].hints.join('|')).toContain('路径不存在')
  })

  it('非 git 目录 → error', async () => {
    const dir = fs.mkdtempSync(path.join(process.env.BX_HOME!, 'doc-notgit-'))
    const r = await runDoctor(cfg([makeProject([{ id: 'r1', name: 'r1', path: dir }])]), process.env.BX_HOME!)
    expect(r.overall).toBe('error')
    expect(r.projects[0].repos[0].hints[0]).toContain('不是 git 仓库')
  })

  it('正常仓：lastPublishCommit == HEAD → ok + 「基准==HEAD」提示', async () => {
    const repoPath = makeRepo()
    commit(repoPath, 'feat: 初始', { 'src/a.ts': 'aaa' })
    const headRes = await git(['rev-parse', 'HEAD'], { cwd: repoPath })
    const head = headRes.ok ? headRes.stdout.trim() : ''
    const r = await runDoctor(
      cfg([makeProject([{ id: 'r1', name: 'r1', path: repoPath, lastPublishCommit: head }])]),
      process.env.BX_HOME!,
    )
    expect(r.overall).toBe('ok')
    expect(r.counts.ok).toBe(1)
    const probe = r.projects[0].repos[0]
    expect(probe.state).toBe('ok')
    expect(probe.hints.some((h) => h.includes('基准 == HEAD'))).toBe(true)
    expect(probe.ahead).toBe(0)
    expect(probe.baseAncestor).toBe(true)
  })

  it('有新提交：ahead>0，提示「基准落后 N 个提交」', async () => {
    const repoPath = makeRepo()
    commit(repoPath, 'feat: 初始', { 'src/a.ts': 'aaa' })
    const head1Res = await git(['rev-parse', 'HEAD'], { cwd: repoPath })
    const head1 = head1Res.ok ? head1Res.stdout.trim() : ''
    commit(repoPath, 'feat: 增量', { 'src/a.ts': 'bbb' })
    const r = await runDoctor(
      cfg([makeProject([{ id: 'r1', name: 'r1', path: repoPath, lastPublishCommit: head1 }])]),
      process.env.BX_HOME!,
    )
    const probe = r.projects[0].repos[0]
    expect(probe.ahead).toBe(1)
    expect(probe.hints.some((h) => h.includes('基准落后 1'))).toBe(true)
  })

  it('基准不可达（force-push 模拟） → warn', async () => {
    const repoPath = makeRepo()
    commit(repoPath, 'feat: 初始', { 'src/a.ts': 'aaa' })
    // 用一个绝对不存在的 commit 当 base
    const fakeBase = '0000000000000000000000000000000000000000'
    const r = await runDoctor(
      cfg([makeProject([{ id: 'r1', name: 'r1', path: repoPath, lastPublishCommit: fakeBase }])]),
      process.env.BX_HOME!,
    )
    const probe = r.projects[0].repos[0]
    expect(probe.state).toBe('warn')
    expect(probe.baseAncestor).toBe(false)
    expect(probe.hints.some((h) => h.includes('基准不可达'))).toBe(true)
  })

  it('从未发布：lastPublishCommit=null → 「从未发布」提示，state=ok', async () => {
    const repoPath = makeRepo()
    commit(repoPath, 'feat: 初始', { 'src/a.ts': 'aaa' })
    const r = await runDoctor(
      cfg([makeProject([{ id: 'r1', name: 'r1', path: repoPath, lastPublishCommit: null }])]),
      process.env.BX_HOME!,
    )
    const probe = r.projects[0].repos[0]
    expect(probe.state).toBe('ok')
    expect(probe.lastPublishCommit).toBeNull()
    expect(probe.hints.some((h) => h.includes('从未发布'))).toBe(true)
  })

  it('项目筛选：projectFilter 仅匹配一条', async () => {
    const repoA = makeRepo()
    const repoB = makeRepo()
    commit(repoA, 'feat: a', { 'a.ts': '1' })
    commit(repoB, 'feat: b', { 'b.ts': '2' })
    const projects: ProjectDef[] = [
      { id: 'p1', name: '业务一', version: '1.0.0', bump: 'auto', repoVersionScheme: 'hybrid', externalExclude: [], repos: [{ id: 'r1', name: 'r1', path: repoA }] },
      { id: 'p2', name: '业务二', version: '1.0.0', bump: 'auto', repoVersionScheme: 'hybrid', externalExclude: [], repos: [{ id: 'r2', name: 'r2', path: repoB }] },
    ]
    const r = await runDoctor(cfg(projects), process.env.BX_HOME!, { projectFilter: '业务二' })
    expect(r.projects).toHaveLength(1)
    expect(r.projects[0].projectName).toBe('业务二')
  })

  it('packageJson 模式透出最近 commit', async () => {
    const repoPath = makeRepo()
    commit(repoPath, 'feat: 初始', { 'package.json': '{"name":"x"}' })
    commit(repoPath, 'fix: bump', { 'package.json': '{"name":"x","version":"1.0.0"}' })
    const r = await runDoctor(
      cfg([
        makeProject([
          { id: 'r1', name: 'r1', path: repoPath, versionSource: 'packageJson', lastPublishCommit: null },
        ]),
      ]),
      process.env.BX_HOME!,
    )
    expect(r.projects[0].repos[0].packageJsonLastCommit).toBeTruthy()
  })
})
