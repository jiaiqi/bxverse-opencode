import { afterEach, describe, expect, it } from 'vitest'
import * as git from '../src/git'
import { commit, makeRepo, tag } from './helpers/repo'

const dirs: string[] = []
afterEach(() => {
  // 临时目录由系统回收，无需清理
  void dirs
})

describe('git 基础封装（fixture 仓库）', () => {
  it('isRepo / head / currentBranch / dirtyCount', async () => {
    const dir = makeRepo()
    dirs.push(dir)
    expect(await git.isRepo(dir)).toBe(true)
    expect(await git.isRepo(dir + '-missing')).toBe(false)

    const h1 = commit(dir, 'init', { 'a.txt': '1' })
    expect(await git.head(dir)).toBe(h1)
    expect(await git.currentBranch(dir)).toBe('master')
    expect(await git.dirtyCount(dir)).toBe(0)
  })

  it('空仓库 head 抛 EMPTY_REPO', async () => {
    const dir = makeRepo()
    dirs.push(dir)
    await expect(git.head(dir)).rejects.toThrow('EMPTY_REPO')
  })
})

describe('git.commitsSince 解析', () => {
  it('增量收集：类型/scope/breaking/文件', async () => {
    const dir = makeRepo()
    dirs.push(dir)
    const h1 = commit(dir, 'feat(a): 功能一', { 'src/a.ts': 'a' })
    commit(dir, 'fix!: 破坏性修复', { 'src/b.ts': 'b' }, '2026-08-12T10:00:00')
    commit(dir, 'chore: 杂项', { 'docs/c.md': 'c' })

    const commits = await git.commitsSince(dir, h1)
    expect(commits).toHaveLength(2)
    expect(commits[0].type).toBe('fix')
    expect(commits[0].breaking).toBe(true)
    expect(commits[0].files).toEqual(['src/b.ts'])
    expect(commits[1].type).toBe('chore')
    expect(commits[0].date).toBe('2026-08-12')
  })

  it('首次发布（base=null）全量收集', async () => {
    const dir = makeRepo()
    dirs.push(dir)
    commit(dir, 'feat: 1', { 'a': '1' })
    commit(dir, 'feat: 2', { 'b': '2' })
    const commits = await git.commitsSince(dir, null)
    expect(commits).toHaveLength(2)
  })

  it('基准不可达 → 按全量收集 + warning', async () => {
    const dir = makeRepo()
    dirs.push(dir)
    commit(dir, 'feat: 1', { 'a': '1' })
    const warnings: string[] = []
    const commits = await git.commitsSince(dir, 'deadbeef', { warnings })
    expect(commits).toHaveLength(1)
    expect(warnings[0]).toContain('基准不可达')
  })

  it('maxCommits 截断保留最近 N 条', async () => {
    const dir = makeRepo()
    dirs.push(dir)
    for (let i = 0; i < 5; i++) commit(dir, `feat: c${i}`, { [`f${i}`]: `${i}` })
    const warnings: string[] = []
    const commits = await git.commitsSince(dir, null, { maxCommits: 3, warnings })
    expect(commits).toHaveLength(3)
    expect(commits[0].subject).toBe('c2')
    expect(commits[2].subject).toBe('c4')
    expect(warnings.some(w => w.includes('仅展示最近 3 条'))).toBe(true)
  })
})

describe('git 标签操作', () => {
  it('createTag 幂等：同 tag 同 commit 跳过，不同 commit 抛 TAG_CONFLICT', async () => {
    const dir = makeRepo()
    dirs.push(dir)
    const h1 = commit(dir, 'feat: 1', { 'a': '1' })
    await git.createTag(dir, 'v1.0.0', { message: 'Release v1.0.0' })
    expect(await git.tagExists(dir, 'v1.0.0')).toBe(true)
    await git.createTag(dir, 'v1.0.0', { message: 'Release v1.0.0' }) // 幂等
    expect(await git.tagTarget(dir, 'v1.0.0')).toBe(h1)

    commit(dir, 'feat: 2', { 'b': '2' })
    await expect(git.createTag(dir, 'v1.0.0')).rejects.toThrow('TAG_CONFLICT')
  })

  it('latestTag / listTags', async () => {
    const dir = makeRepo()
    dirs.push(dir)
    commit(dir, 'feat: 1', { 'a': '1' })
    tag(dir, 'build/v1.0.0.26081315', 'build', '2026-08-13T15:00:00')
    tag(dir, 'v1.0.0', 'release', '2026-08-13T16:00:00')
    expect(await git.listTags(dir, 'build/*')).toEqual(['build/v1.0.0.26081315'])
    expect(await git.latestTag(dir)).toBe('v1.0.0')
  })

  it('pushTag 无 origin 抛 NO_REMOTE', async () => {
    const dir = makeRepo()
    dirs.push(dir)
    commit(dir, 'feat: 1', { 'a': '1' })
    await git.createTag(dir, 'v1.0.0')
    await expect(git.pushTag(dir, 'v1.0.0')).rejects.toThrow('NO_REMOTE')
  })
})

describe('git.diffStat', () => {
  it('增量统计', async () => {
    const dir = makeRepo()
    dirs.push(dir)
    const h1 = commit(dir, 'feat: 1', { 'a.txt': 'line1\nline2\n' })
    commit(dir, 'feat: 2', { 'a.txt': 'line3\nline4\n' })
    const s = await git.diffStat(dir, h1)
    expect(s.filesChanged).toBe(1)
    expect(s.insertions).toBe(2)
    expect(s.deletions).toBe(0)
  })
})

describe('git.clone 校验', () => {
  it('非法协议抛 BAD_URL', async () => {
    await expect(git.clone('ftp://example.com/x.git', 'C:/nonexistent/dir')).rejects.toThrow('BAD_URL')
  })
})
