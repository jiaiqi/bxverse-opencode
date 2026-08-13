import { describe, expect, it } from 'vitest'
import * as version from '../src/version'
import type { CommitInfo } from '@bxverse/shared'

function c(type: CommitInfo['type'], breaking = false): CommitInfo {
  return {
    fullHash: 'x'.repeat(40),
    hash: 'abc1234',
    author: 't',
    date: '2026-08-13',
    subject: 'test',
    type,
    scope: null,
    breaking,
    files: [],
  }
}

describe('version.buildStamp', () => {
  it('生成 YYMMDDHH 8 位', () => {
    const d = new Date(2026, 7, 13, 15, 30)
    expect(version.buildStamp(d)).toBe('26081315')
  })

  it('撞名追加两位序号（8→10 位）', () => {
    const d = new Date(2026, 7, 13, 15, 30)
    expect(version.buildStamp(d, new Set(['26081315']))).toBe('2608131501')
    expect(version.buildStamp(d, new Set(['26081315', '2608131501']))).toBe('2608131502')
  })

  it('序号耗尽抛错（不可达）', () => {
    const d = new Date(2026, 7, 13, 15, 30)
    const used = new Set<string>(['26081315'])
    for (let i = 1; i <= 99; i++) used.add(`26081315${String(i).padStart(2, '0')}`)
    expect(() => version.buildStamp(d, used)).toThrow('BUILD_STAMP_EXHAUSTED')
  })
})

describe('version.parseSemver', () => {
  it('各形态解析', () => {
    expect(version.parseSemver('v1.0.6')).toEqual({ major: 1, minor: 0, patch: 6 })
    expect(version.parseSemver('1.0.6')).toEqual({ major: 1, minor: 0, patch: 6 })
    expect(version.parseSemver('v1.0.6.26081315')).toEqual({ major: 1, minor: 0, patch: 6, build: 26081315 })
    expect(version.parseSemver('abc')).toBeNull()
    expect(version.parseSemver('')).toBeNull()
  })
})

describe('version.bumpSemver', () => {
  it('patch/minor/major 递增与低位清零', () => {
    expect(version.bumpSemver('v1.0.6', 'patch')).toBe('v1.0.7')
    expect(version.bumpSemver('v1.0.6', 'minor')).toBe('v1.1.0')
    expect(version.bumpSemver('v1.0.6', 'major')).toBe('v2.0.0')
    expect(version.bumpSemver('v1.9.9.26081315', 'minor')).toBe('v1.10.0')
    expect(version.bumpSemver('v1.9.9.26081315', 'major')).toBe('v2.0.0')
  })

  it('非法输入抛错', () => {
    expect(() => version.bumpSemver('abc', 'patch')).toThrow('INVALID_SEMVER')
  })
})

describe('version.suggestBump', () => {
  it('breaking → major', () => {
    expect(version.suggestBump([c('fix'), c('chore', true)])).toBe('major')
  })
  it('feat → minor', () => {
    expect(version.suggestBump([c('fix'), c('feat')])).toBe('minor')
  })
  it('fix/其他 → patch', () => {
    expect(version.suggestBump([c('fix')])).toBe('patch')
    expect(version.suggestBump([c('docs')])).toBe('patch')
  })
  it('空数组 → patch', () => {
    expect(version.suggestBump([])).toBe('patch')
  })
})

describe('version.hybridVersion', () => {
  it('vX.Y.Z + stamp → vX.Y.Z.stamp', () => {
    expect(version.hybridVersion('v1.2.0', '26081315')).toBe('v1.2.0.26081315')
  })
  it('非法基版抛错', () => {
    expect(() => version.hybridVersion('x', '26081315')).toThrow()
  })
})

describe('version.compareSemver', () => {
  it('正确排序', () => {
    expect(version.compareSemver('v1.2.0', 'v1.10.0')).toBeLessThan(0)
    expect(version.compareSemver('v2.0.0', 'v1.9.9')).toBeGreaterThan(0)
    expect(version.compareSemver('v1.0.0', 'v1.0.0')).toBe(0)
  })
})
