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

describe('version.buildStampMinute (R26)', () => {
  it('生成 YYMMDDHHmm 10 位', () => {
    const d = new Date(2026, 7, 24, 15, 30)
    expect(version.buildStampMinute(d)).toBe('2608241530')
  })

  it('撞名追加两位序号（10→12 位）', () => {
    const d = new Date(2026, 7, 24, 15, 30)
    expect(version.buildStampMinute(d, new Set(['2608241530']))).toBe('260824153001')
    expect(version.buildStampMinute(d, new Set(['2608241530', '260824153001']))).toBe('260824153002')
  })

  it('序号耗尽抛错', () => {
    const d = new Date(2026, 7, 24, 15, 30)
    const used = new Set<string>(['2608241530'])
    for (let i = 1; i <= 99; i++) used.add(`2608241530${String(i).padStart(2, '0')}`)
    expect(() => version.buildStampMinute(d, used)).toThrow('BUILD_STAMP_EXHAUSTED')
  })
})

describe('version.parseVersionTolerant (R26)', () => {
  it('X.Y.Z 与 vX.Y.Z', () => {
    expect(version.parseVersionTolerant('1.2.0')).toEqual({ kind: 'semver', parts: { major: 1, minor: 2, patch: 0 }, raw: '1.2.0' })
    expect(version.parseVersionTolerant('v1.2.0')).toEqual({ kind: 'semver', parts: { major: 1, minor: 2, patch: 0 }, raw: 'v1.2.0' })
  })

  it('旧 hybrid vX.Y.Z.YYMMDDHH 兼容', () => {
    const r = version.parseVersionTolerant('v1.2.0.26081315')
    expect(r?.kind).toBe('semver')
    if (r?.kind === 'semver') expect(r.parts.build).toBe(26081315)
  })

  it('VYYMMDDHHmm', () => {
    expect(version.parseVersionTolerant('V2608241530')).toEqual({ kind: 'timestamp', stamp: '2608241530', raw: 'V2608241530' })
    expect(version.parseVersionTolerant('V260824153012')).toEqual({ kind: 'timestamp', stamp: '260824153012', raw: 'V260824153012' })
  })

  it('旧 timestamp vYYMMDDHH 兼容（小写 v）', () => {
    expect(version.parseVersionTolerant('v26081315')).toEqual({ kind: 'timestamp', stamp: '26081315', raw: 'v26081315' })
  })

  it('非法返回 null', () => {
    expect(version.parseVersionTolerant('abc')).toBeNull()
    expect(version.parseVersionTolerant('')).toBeNull()
    expect(version.parseVersionTolerant('V123')).toBeNull()
  })
})

describe('version.stripV / semverCore (R26)', () => {
  it('stripV 去前缀', () => {
    expect(version.stripV('v1.2.0')).toBe('1.2.0')
    expect(version.stripV('V1.2.0')).toBe('1.2.0')
    expect(version.stripV('1.2.0')).toBe('1.2.0')
  })

  it('semverCore 取 X.Y.Z 核心', () => {
    expect(version.semverCore('v1.2.3')).toBe('1.2.3')
    expect(version.semverCore('1.2.3')).toBe('1.2.3')
    expect(version.semverCore('v1.2.3.26081315')).toBe('1.2.3')
  })
})

describe('version.formatRepoVersion (R26)', () => {
  it('X.Y.Z 格式返回无前缀核心', () => {
    expect(version.formatRepoVersion('X.Y.Z', 'v1.2.0', '2608241530')).toBe('1.2.0')
    expect(version.formatRepoVersion('X.Y.Z', '1.2.0', '2608241530')).toBe('1.2.0')
    expect(version.formatRepoVersion('X.Y.Z', 'v1.2.0.26081315', '2608241530')).toBe('1.2.0')
  })

  it('VYYMMDDHHmm 格式返回 V + stamp', () => {
    expect(version.formatRepoVersion('VYYMMDDHHmm', 'v1.2.0', '2608241530')).toBe('V2608241530')
    expect(version.formatRepoVersion('VYYMMDDHHmm', '1.2.0', '260824153012')).toBe('V260824153012')
  })

  it('非法 stamp 抛错', () => {
    expect(() => version.formatRepoVersion('VYYMMDDHHmm', '1.2.0', 'bad')).toThrow('INVALID_STAMP')
  })
})

describe('version.compareVersion (R26)', () => {
  it('semver 间比较', () => {
    expect(version.compareVersion('1.2.0', '1.10.0')).toBeLessThan(0)
    expect(version.compareVersion('v2.0.0', '1.9.9')).toBeGreaterThan(0)
  })

  it('timestamp 间比较', () => {
    expect(version.compareVersion('V2608241530', 'V2608241531')).toBeLessThan(0)
    expect(version.compareVersion('V2608241530', 'V2608241530')).toBe(0)
  })

  it('混合类型 semver < timestamp', () => {
    expect(version.compareVersion('1.2.0', 'V2608241530')).toBeLessThan(0)
    expect(version.compareVersion('V2608241530', '1.2.0')).toBeGreaterThan(0)
  })
})


