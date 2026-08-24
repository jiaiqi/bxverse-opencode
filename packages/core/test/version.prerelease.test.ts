import { describe, expect, it } from 'vitest'
import * as version from '../src/version'

describe('version prerelease R30', () => {
  describe('parseSemver with prerelease', () => {
    it('解析 vX.Y.Z-beta.N', () => {
      expect(version.parseSemver('v1.2.0-beta.1')).toEqual({ major: 1, minor: 2, patch: 0, prerelease: 'beta.1' })
      expect(version.parseSemver('1.2.0-rc.1')).toEqual({ major: 1, minor: 2, patch: 0, prerelease: 'rc.1' })
      expect(version.parseSemver('v1.2.0-alpha')).toEqual({ major: 1, minor: 2, patch: 0, prerelease: 'alpha' })
    })
    it('解析 hybrid with prerelease + build', () => {
      expect(version.parseSemver('v1.2.0-beta.1.26081315')).toEqual({ major: 1, minor: 2, patch: 0, prerelease: 'beta.1', build: 26081315 })
      expect(version.parseSemver('v1.2.0.26081315')).toEqual({ major: 1, minor: 2, patch: 0, build: 26081315 })
    })
    it('parseVersionTolerant 含 prerelease', () => {
      const r = version.parseVersionTolerant('v1.2.0-beta.1')
      expect(r?.kind).toBe('semver')
      if (r?.kind === 'semver') expect(r.parts.prerelease).toBe('beta.1')
      const r2 = version.parseVersionTolerant('v1.2.0-beta.1.26081315')
      if (r2?.kind === 'semver') {
        expect(r2.parts.prerelease).toBe('beta.1')
        expect(r2.parts.build).toBe(26081315)
      }
    })
  })

  describe('resolvePrerelease 递增矩阵', () => {
    it('无 prev 直接采用', () => {
      expect(version.resolvePrerelease(undefined, 'beta.1')).toBe('beta.1')
      expect(version.resolvePrerelease(null, 'rc.1')).toBe('rc.1')
    })
    it('同标识递增 numeric：beta.1→beta.2', () => {
      expect(version.resolvePrerelease('beta.1', 'beta.1')).toBe('beta.2')
      expect(version.resolvePrerelease('beta.1', 'beta')).toBe('beta.2')
      expect(version.resolvePrerelease('beta.2', 'beta.1')).toBe('beta.3')
    })
    it('同标识跨数字段：beta.9→beta.10', () => {
      expect(version.resolvePrerelease('beta.9', 'beta.1')).toBe('beta.10')
    })
    it('不同标识覆盖：beta.1→rc.1', () => {
      expect(version.resolvePrerelease('beta.1', 'rc.1')).toBe('rc.1')
      expect(version.resolvePrerelease('beta.1', 'alpha')).toBe('alpha')
    })
    it('多段标识同前缀递增：alpha.beta.1→alpha.beta.2', () => {
      expect(version.resolvePrerelease('alpha.beta.1', 'alpha.beta.1')).toBe('alpha.beta.2')
    })
    it('无 requested 返回 undefined', () => {
      expect(version.resolvePrerelease('beta.1', '')).toBeUndefined()
      expect(version.resolvePrerelease('beta.1', undefined)).toBeUndefined()
      expect(version.resolvePrerelease(undefined, undefined)).toBeUndefined()
    })
    it('非法 prerelease 抛错', () => {
      expect(() => version.resolvePrerelease(undefined, 'beta..1')).toThrow('INVALID_PRERELEASE')
      expect(() => version.resolvePrerelease('bad..', 'beta.1')).toThrow('INVALID_PRERELEASE')
    })
    it('跨版本语义：prev 为正式版 + requested beta', () => {
      expect(version.resolvePrerelease(undefined, 'beta.1')).toBe('beta.1')
    })
  })

  describe('bumpSemver with prerelease', () => {
    it('patch + prerelease 透传', () => {
      expect(version.bumpSemver('v1.2.0', 'patch', 'beta.1')).toBe('v1.2.1-beta.1')
      expect(version.bumpSemver('v1.2.0-beta.1', 'patch', 'beta.2')).toBe('v1.2.1-beta.2')
    })
    it('minor/major + prerelease', () => {
      expect(version.bumpSemver('v1.2.0', 'minor', 'rc.1')).toBe('v1.3.0-rc.1')
      expect(version.bumpSemver('v1.2.0', 'major', 'alpha.1')).toBe('v2.0.0-alpha.1')
    })
    it('无 prerelease 仍为正式版', () => {
      expect(version.bumpSemver('v1.2.0-beta.1', 'patch')).toBe('v1.2.1')
      expect(version.bumpSemver('v1.2.0', 'patch')).toBe('v1.2.1')
    })
    it('非法 prerelease 抛错', () => {
      expect(() => version.bumpSemver('v1.2.0', 'patch', 'bad..1')).toThrow('INVALID_PRERELEASE')
    })
  })

  describe('hybridVersion with prerelease', () => {
    it('hybrid 含 prerelease 前缀', () => {
      expect(version.hybridVersion('v1.2.0', '26081315', 'beta.1')).toBe('v1.2.0-beta.1.26081315')
      expect(version.hybridVersion('v1.2.0-beta.1', '26081315')).toBe('v1.2.0-beta.1.26081315')
      expect(version.hybridVersion('v1.2.0', '26081315')).toBe('v1.2.0.26081315')
    })
  })

  describe('formatRepoVersion with prerelease', () => {
    it('X.Y.Z + prerelease', () => {
      expect(version.formatRepoVersion('X.Y.Z', 'v1.2.0-beta.1', '2608241530')).toBe('1.2.0-beta.1')
      expect(version.formatRepoVersion('X.Y.Z', 'v1.2.0', '2608241530', 'rc.1')).toBe('1.2.0-rc.1')
      expect(version.formatRepoVersion('X.Y.Z', 'v1.2.0', '2608241530')).toBe('1.2.0')
    })
  })

  describe('compareSemver with prerelease', () => {
    it('prerelease < 正式版', () => {
      expect(version.compareSemver('v1.2.0-beta.1', 'v1.2.0')).toBeLessThan(0)
      expect(version.compareSemver('v1.2.0', 'v1.2.0-beta.1')).toBeGreaterThan(0)
    })
    it('同 prerelease 按标识与数字段比较', () => {
      expect(version.compareSemver('v1.2.0-beta.1', 'v1.2.0-beta.2')).toBeLessThan(0)
      expect(version.compareSemver('v1.2.0-beta.2', 'v1.2.0-beta.1')).toBeGreaterThan(0)
      expect(version.compareSemver('v1.2.0-alpha.1', 'v1.2.0-beta.1')).toBeLessThan(0)
      expect(version.compareSemver('v1.2.0-beta.1', 'v1.2.0-beta.1')).toBe(0)
    })
    it('numeric < non-numeric', () => {
      expect(version.compareSemver('v1.0.0-1', 'v1.0.0-alpha')).toBeLessThan(0)
    })
    it('core 不同时 prerelease 不影响主比较', () => {
      expect(version.compareSemver('v1.2.0-beta.1', 'v1.3.0-alpha.1')).toBeLessThan(0)
    })
  })

  describe('compareVersion with prerelease', () => {
    it('prerelease 参与混合排序', () => {
      expect(version.compareVersion('1.2.0-beta.1', '1.2.0')).toBeLessThan(0)
      expect(version.compareVersion('1.2.0-beta.1', '1.2.0-beta.2')).toBeLessThan(0)
      expect(version.compareVersion('V2608241530', '1.2.0')).toBeGreaterThan(0)
    })
  })

  describe('cross-version prerelease increment integration', () => {
    it('beta.1→beta.2 跨版本（bump 后仍递增）', () => {
      // 模拟项目从 v1.2.0 到先后两次 prerelease 发布
      const first = version.bumpSemver('v1.2.0', 'patch', version.resolvePrerelease(undefined, 'beta.1'))
      expect(first).toBe('v1.2.1-beta.1')
      const secondPre = version.parseSemver(first)?.prerelease
      const secondResolved = version.resolvePrerelease(secondPre, 'beta.1')
      expect(secondResolved).toBe('beta.2')
      const second = version.bumpSemver(first, 'patch', secondResolved)
      expect(second).toBe('v1.2.2-beta.2')
    })
    it('不同标识跨版本覆盖', () => {
      const first = version.bumpSemver('v1.2.0', 'patch', version.resolvePrerelease(undefined, 'beta.1'))
      expect(first).toBe('v1.2.1-beta.1')
      const secondResolved = version.resolvePrerelease(version.parseSemver(first)?.prerelease, 'rc.1')
      expect(secondResolved).toBe('rc.1')
      const second = version.bumpSemver(first, 'minor', secondResolved)
      expect(second).toBe('v1.3.0-rc.1')
    })
  })
})
