import { describe, expect, it } from 'vitest'
import { runPreflight } from '../src/preflight'
import type { PlannedRepo, ProjectDef, RepoDef } from '@bxverse/shared'
import { makeRepo, commit } from './helpers/repo'
import { writeFileSync } from 'node:fs'
import path from 'node:path'

function fixture() {
  const repoPath = makeRepo()
  commit(repoPath, 'feat: init', { 'src/a.ts': 'a' })
  return repoPath
}

const projectBase = (repoVersionFormat?: string): ProjectDef => ({
  id: 'p_pf',
  name: 'pf',
  version: 'v1.0.0',
  bump: 'auto',
  repoVersionScheme: 'hybrid',
  ...(repoVersionFormat ? { repoVersionFormat } as Pick<ProjectDef, 'repoVersionFormat'> : {}),
  externalExclude: [],
  repos: [],
})

function planned(version: string): PlannedRepo {
  return {
    repoId: 'r1',
    name: 'demo',
    changed: true,
    version,
    from: null,
    to: '',
    commits: [],
  }
}

describe('preflight 里程碑撞车检测（R26 双格式对齐）', () => {
  it('X.Y.Z 格式：检查无前缀里程碑（与 engine 打的 tag 一致）', async () => {
    const repoPath = fixture()
    // 模拟上次发布已打无前缀 tag 1.1.0
    writeFileSync(path.join(repoPath, 'src/b.ts'), 'b')
    const { execFileSync } = await import('node:child_process')
    execFileSync('git', ['add', '-A'], { cwd: repoPath })
    execFileSync('git', ['commit', '-m', 'feat: second'], { cwd: repoPath })
    execFileSync('git', ['tag', '-a', '1.1.0', '-m', 'x'], { cwd: repoPath })
    // 再提交，使 HEAD != tag 目标 → 同版本应阻断
    writeFileSync(path.join(repoPath, 'src/c.ts'), 'c')
    execFileSync('git', ['add', '-A'], { cwd: repoPath })
    execFileSync('git', ['commit', '-m', 'feat: third'], { cwd: repoPath })

    const repo: RepoDef = { id: 'r1', name: 'demo', path: repoPath }
    const pf = await runPreflight(repo, planned('1.1.0'), projectBase('X.Y.Z'))
    expect(pf.ok).toBe(false)
    expect(pf.blocked.join()).toContain('1.1.0 已存在且指向不同 commit')
  })

  it('legacy hybrid：检查带 v 前缀里程碑（行为不变）', async () => {
    const repoPath = fixture()
    const { execFileSync } = await import('node:child_process')
    execFileSync('git', ['tag', '-a', 'v1.1.0', '-m', 'x'], { cwd: repoPath })
    // 再提交使 HEAD 前移
    writeFileSync(path.join(repoPath, 'src/b.ts'), 'b')
    execFileSync('git', ['add', '-A'], { cwd: repoPath })
    execFileSync('git', ['commit', '-m', 'feat: second'], { cwd: repoPath })

    const repo: RepoDef = { id: 'r1', name: 'demo', path: repoPath }
    const pf = await runPreflight(repo, planned('v1.1.0.26082415'), projectBase(undefined))
    expect(pf.ok).toBe(false)
    expect(pf.blocked.join()).toContain('v1.1.0 已存在且指向不同 commit')
  })

  it('同版本同 commit：不阻断（幂等续跑安全）', async () => {
    const repoPath = fixture()
    const { execFileSync } = await import('node:child_process')
    execFileSync('git', ['tag', '-a', '1.1.0', '-m', 'x'], { cwd: repoPath })
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoPath }).toString().trim()

    const repo: RepoDef = { id: 'r1', name: 'demo', path: repoPath }
    const pf = await runPreflight(repo, { ...planned('1.1.0'), to: head }, projectBase('X.Y.Z'))
    expect(pf.ok).toBe(true)
  })
})
