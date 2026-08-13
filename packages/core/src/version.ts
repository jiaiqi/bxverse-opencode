// packages/core/src/version.ts
// 版本号计算：buildStamp / semver 解析与 bump / 建议推断 / 混合版本

import { SEMVER_RE } from '@bxverse/shared'
import type { BumpType, CommitInfo } from '@bxverse/shared'

const pad2 = (n: number) => String(n).padStart(2, '0')

export interface SemverParts {
  major: number
  minor: number
  patch: number
  /** hybrid 版本的时间戳段（vX.Y.Z.YYMMDDHH 的末段） */
  build?: number
}

/**
 * 生成构建时间戳 YYMMDDHH（本地时间）。
 * usedStamps：已占用的 stamp 集合（各仓库既有 build tag 解析出），
 * 撞名时自动追加两位序号（8 → 10 位，仍满足 HYBRID_VERSION_RE）。
 */
export function buildStamp(now: Date = new Date(), usedStamps?: Set<string>): string {
  const base = `${pad2(now.getFullYear() % 100)}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}${pad2(now.getHours())}`
  if (!usedStamps || !usedStamps.has(base)) return base
  for (let seq = 1; seq <= 99; seq++) {
    const cand = base + pad2(seq)
    if (!usedStamps.has(cand)) return cand
  }
  throw new Error('BUILD_STAMP_EXHAUSTED')
}

/** SEMVER_RE 匹配解析；不匹配返回 null */
export function parseSemver(v: string): SemverParts | null {
  const m = SEMVER_RE.exec(v.trim())
  if (!m) return null
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    ...(m[4] !== undefined ? { build: Number(m[4]) } : {}),
  }
}

/** 按 bump 类型递增，返回 vX.Y.Z（丢弃 build 段，保留 v 前缀） */
export function bumpSemver(v: string, bump: BumpType): string {
  const p = parseSemver(v)
  if (!p) throw new Error(`INVALID_SEMVER: ${v}`)
  let { major, minor, patch } = p
  if (bump === 'major') {
    major += 1
    minor = 0
    patch = 0
  } else if (bump === 'minor') {
    minor += 1
    patch = 0
  } else {
    patch += 1
  }
  return `v${major}.${minor}.${patch}`
}

/**
 * 按提交语义推断 bump：
 * breaking → major；否则有 feat → minor；否则 patch（含空数组）。
 */
export function suggestBump(commits: Pick<CommitInfo, 'type' | 'breaking'>[]): BumpType {
  if (commits.some(c => c.breaking)) return 'major'
  if (commits.some(c => c.type === 'feat')) return 'minor'
  return 'patch'
}

/** 混合版本：vX.Y.Z.YYMMDDHH（stamp 8~10 位） */
export function hybridVersion(projectVersion: string, stamp: string): string {
  const p = parseSemver(projectVersion)
  if (!p) throw new Error(`INVALID_SEMVER: ${projectVersion}`)
  return `v${p.major}.${p.minor}.${p.patch}.${stamp}`
}

/** semver 比较：a < b 返回负，a > b 返回正，相等返回 0；不可解析的排在前面视为更小 */
export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a)
  const pb = parseSemver(b)
  if (!pa && !pb) return 0
  if (!pa) return -1
  if (!pb) return 1
  return pa.major - pb.major || pa.minor - pb.minor || pa.patch - pb.patch || (pa.build ?? 0) - (pb.build ?? 0)
}
