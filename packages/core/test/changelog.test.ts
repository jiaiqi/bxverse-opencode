import { describe, expect, it } from 'vitest'
import { classifyCommit, classifyCommits, computeStats, renderExternal, renderInternal } from '../src/changelog'
import type { CommitInfo } from '@bxverse/shared'

function c(subject: string, files: string[] = []): CommitInfo {
  const { rest, ...cls } = classifyCommit(subject)
  return {
    fullHash: 'f'.repeat(40),
    hash: 'abc1234',
    author: 'tester',
    date: '2026-08-13',
    subject: rest,
    ...cls,
    files,
  }
}

describe('changelog.classifyCommit', () => {
  it('常规类型', () => {
    expect(classifyCommit('feat(ui): 新增按钮')).toEqual({ type: 'feat', scope: 'ui', breaking: false, rest: '新增按钮' })
    expect(classifyCommit('fix: 修复崩溃')).toEqual({ type: 'fix', scope: null, breaking: false, rest: '修复崩溃' })
  })
  it('breaking：! 后缀与 BREAKING 关键字', () => {
    expect(classifyCommit('feat!: 破坏性变更')).toEqual({ type: 'feat', scope: null, breaking: true, rest: '破坏性变更' })
    expect(classifyCommit('chore: BREAKING 移除旧接口')).toEqual({ type: 'chore', scope: null, breaking: true, rest: 'BREAKING 移除旧接口' })
  })
  it('未知类型归 other', () => {
    expect(classifyCommit('weird: 奇怪提交').type).toBe('other')
    expect(classifyCommit('无前缀的提交').type).toBe('other')
  })
})

describe('changelog.classifyCommits', () => {
  it('就地补全且幂等（subject 归一为正文）', () => {
    const raw: CommitInfo = { fullHash: 'f', hash: 'a', author: 't', date: 'd', subject: 'feat(x): y', type: 'other', scope: null, breaking: false, files: [] }
    classifyCommits([raw])
    expect(raw.type).toBe('feat')
    expect(raw.scope).toBe('x')
    expect(raw.subject).toBe('y')
    classifyCommits([raw])
    expect(raw.type).toBe('feat')
    expect(raw.subject).toBe('y')
  })
})

describe('changelog.computeStats', () => {
  it('byType 全量 12 键 + 文件并集', () => {
    const stats = computeStats([c('feat(a): 1', ['a.ts', 'b.ts']), c('fix: 2', ['b.ts'])])
    expect(stats.commits).toBe(2)
    expect(stats.filesChanged).toBe(2)
    expect(stats.byType.feat).toBe(1)
    expect(stats.byType.fix).toBe(1)
    expect(Object.keys(stats.byType)).toHaveLength(12)
  })
  it('diff 优先', () => {
    const stats = computeStats([c('feat: 1', ['a.ts'])], { filesChanged: 5, insertions: 10, deletions: 2 })
    expect(stats.filesChanged).toBe(5)
    expect(stats.insertions).toBe(10)
  })
})

describe('changelog.renderExternal', () => {
  const commits = [
    c('feat(a): 新增功能A', ['a.ts']),
    c('fix: 修复bug', ['b.ts']),
    c('perf: 性能优化', ['c.ts']),
    c('chore(deps): 升级依赖', []),
    c('docs: 更新文档', []),
    c('refactor!: 破坏性重构', []),
  ]
  const opts = { version: 'v1.2.0', date: '2026-08-13', repoName: 'r', projectName: '主产品线', buildStamp: '26081315' }

  it('分节正确 + 默认排除 chore/docs + breaking 强制收录', () => {
    const md = renderExternal(commits, opts)
    expect(md).toContain('# 主产品线 v1.2.0 更新日志')
    expect(md).toContain('## 新增')
    expect(md).toContain('- 新增功能A（a）')
    expect(md).toContain('## 修复')
    expect(md).toContain('## 优化')
    expect(md).toContain('- **[BREAKING]**：破坏性重构')
    expect(md).not.toContain('升级依赖')
    expect(md).not.toContain('更新文档')
    expect(md).not.toContain('abc1234')
  })

  it('空可见变更提示', () => {
    const md = renderExternal([c('chore: x'), c('docs: y')], opts)
    expect(md).toContain('本次发布无用户可见变更。')
  })
})

describe('changelog.renderInternal', () => {
  it('全量细节：hash/作者/文件/统计/类型分布', () => {
    const commits = [c('feat(a): 新增功能A', ['src/a.ts']), c('fix!: 破坏性修复', [])]
    const stats = computeStats(commits, { filesChanged: 1, insertions: 5, deletions: 0 })
    const md = renderInternal(commits, {
      version: 'v1.2.0.26081315',
      baseVersion: 'v1.2.0',
      date: '2026-08-13',
      repoName: 'l-pc-front',
      projectName: '主产品线',
      buildStamp: '26081315',
      from: null,
      tags: ['build/v1.2.0.26081315', 'v1.2.0'],
      stats,
    })
    expect(md).toContain('# v1.2.0.26081315 发布记录（内部）')
    expect(md).toContain('首次发布，全量收集')
    expect(md).toContain('abc1234')
    expect(md).toContain('src/a.ts')
    expect(md).toContain('（无文件级信息）')
    expect(md).toContain('新增(feat)×1')
    expect(md).toContain('[BREAKING]')
    expect(md).toContain('+5 / -0')
  })

  it('空提交显示无明细', () => {
    const md = renderInternal([], {
      version: 'v1.2.0.26081315', baseVersion: 'v1.2.0', date: 'd', repoName: 'r', projectName: 'p',
      buildStamp: 's', from: 'abc', tags: [], stats: computeStats([]),
    })
    expect(md).toContain('本次无提交明细。')
  })
})
