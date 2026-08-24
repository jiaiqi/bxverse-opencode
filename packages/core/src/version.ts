// packages/core/src/version.ts
// 版本号计算：buildStamp / semver 解析与 bump / 建议推断 / 混合版本
// 扩展 R26：双格式 X.Y.Z / VYYMMDDHHmm + 容错解析与格式化

import { PRERELEASE_RE, SEMVER_PRERELEASE_RE } from '@bxverse/shared'
import type { BumpType, CommitInfo } from '@bxverse/shared'

const pad2 = (n: number) => String(n).padStart(2, '0')

export interface SemverParts {
  major: number
  minor: number
  patch: number
  /** 扩展 R30：prerelease 标识（如 beta.1） */
  prerelease?: string
  /** hybrid 版本的时间戳段（vX.Y.Z.YYMMDDHH 的末段） */
  build?: number
}

// ==================== R26 双格式 ====================
/** 扩展：R26 仓库版本输出格式（仅两种） */
export type RepoVersionFormat = 'X.Y.Z' | 'VYYMMDDHHmm'

/** 纯时间戳：V + 10~12 位（10 位基础 YYMMDDHHmm，撞名追加两位序号至 12 位） */
export const V_STAMP_RE = /^V(\d{10,12})$/

/** 容错 semver：v 可选，build 段 6~12 位以兼容旧 8/10 位与新 10/12 位 */
export const SEMVER_TOLERANT_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:\.(\d{6,12}))?$/

// ==================== R30 prerelease ====================
/** 扩展 R30：校验 prerelease 合法性 */
export function isValidPrerelease(s: string): boolean {
  return PRERELEASE_RE.test(s)
}

function splitPrerelease(s: string): { prefix: string; num?: number } {
  const m = s.match(/^(.*)\.(\d+)$/)
  if (m) return { prefix: m[1], num: Number(m[2]) }
  return { prefix: s }
}

/**
 * 扩展 R30：prerelease 递增
 * 同标识递增数字段，不同标识覆盖
 * - prev 无 → 直接采用 requested
 * - prev 与 requested 前缀相同 → 递增 numeric（beta.1→beta.2；beta→beta.1 递增为 beta.2）
 * - 前缀不同 → 覆盖为 requested
 */
export function resolvePrerelease(prev?: string | null, requested?: string | null): string | undefined {
  const req = requested?.trim()
  if (!req) return undefined
  if (!PRERELEASE_RE.test(req)) throw new Error(`INVALID_PRERELEASE: ${req}`)
  if (!prev) return req
  const p = prev.trim()
  if (!PRERELEASE_RE.test(p)) throw new Error(`INVALID_PRERELEASE: ${p}`)
  const prevSplit = splitPrerelease(p)
  const reqSplit = splitPrerelease(req)
  if (prevSplit.prefix === reqSplit.prefix) {
    const baseNum = prevSplit.num ?? reqSplit.num ?? 0
    const nextNum = baseNum + 1
    return `${prevSplit.prefix}.${nextNum}`
  }
  return req
}

function comparePrerelease(a?: string, b?: string): number {
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  const pa = a.split('.')
  const pb = b.split('.')
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    if (i >= pa.length) return -1
    if (i >= pb.length) return 1
    const ca = pa[i]
    const cb = pb[i]
    if (ca === cb) continue
    const isNumA = /^\d+$/.test(ca)
    const isNumB = /^\d+$/.test(cb)
    if (isNumA && isNumB) {
      const diff = Number(ca) - Number(cb)
      if (diff !== 0) return diff
      continue
    }
    if (isNumA) return -1
    if (isNumB) return 1
    return ca < cb ? -1 : 1
  }
  return 0
}

export type ParsedVersion =
  | { kind: 'semver'; parts: SemverParts; raw: string }
  | { kind: 'timestamp'; stamp: string; raw: string }

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

/**
 * 扩展：R26 生成构建时间戳 YYMMDDHHmm（本地时间，10 位）。
 * 撞名追加两位序号（10 → 12 位）。
 */
export function buildStampMinute(now: Date = new Date(), usedStamps?: Set<string>): string {
  const base = `${pad2(now.getFullYear() % 100)}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}${pad2(now.getHours())}${pad2(now.getMinutes())}`
  if (!usedStamps || !usedStamps.has(base)) return base
  for (let seq = 1; seq <= 99; seq++) {
    const cand = base + pad2(seq)
    if (!usedStamps.has(cand)) return cand
  }
  throw new Error('BUILD_STAMP_EXHAUSTED')
}

/** 去掉首字符 v/V 前缀（大小写均处理，仅去首位） */
export function stripV(v: string): string {
  const s = v.trim()
  if (s.startsWith('v') || s.startsWith('V')) return s.slice(1)
  return s
}

/** 取 X.Y.Z 核心（无前缀，无 build 段），用于写入 package.json */
export function semverCore(v: string): string {
  const p = parseSemver(v) ?? parseSemverTolerant(v)
  if (!p) throw new Error(`INVALID_SEMVER: ${v}`)
  return `${p.major}.${p.minor}.${p.patch}`
}

/** 容错解析：同时识别 X.Y.Z（含可选 v/可选 build 6~12位）与 VYYMMDDHHmm */
export function parseVersionTolerant(v: string): ParsedVersion | null {
  const s = v.trim()
  if (!s) return null
  const vm = V_STAMP_RE.exec(s)
  if (vm) return { kind: 'timestamp', stamp: vm[1], raw: s }
  const sm = SEMVER_PRERELEASE_RE.exec(s)
  if (sm) {
    return {
      kind: 'semver',
      parts: {
        major: Number(sm[1]),
        minor: Number(sm[2]),
        patch: Number(sm[3]),
        ...(sm[4] !== undefined ? { prerelease: sm[4] } : {}),
        ...(sm[5] !== undefined ? { build: Number(sm[5]) } : {}),
      },
      raw: s,
    }
  }
  // Fallback 旧 tolerant 不含 prerelease 的形态（如无 prerelease 的 build 段）
  const sm2 = SEMVER_TOLERANT_RE.exec(s)
  if (sm2) {
    return {
      kind: 'semver',
      parts: {
        major: Number(sm2[1]),
        minor: Number(sm2[2]),
        patch: Number(sm2[3]),
        ...(sm2[4] !== undefined ? { build: Number(sm2[4]) } : {}),
      },
      raw: s,
    }
  }
  // 兼容旧 timestamp 小写 v + 8~12 位（如 v26081315）
  const legacy = /^v(\d{8,12})$/.exec(s)
  if (legacy) return { kind: 'timestamp', stamp: legacy[1], raw: s }
  return null
}

/** 容错解析 semver 部分（供 semverCore 等复用）；V 时间戳返回 null */
export function parseSemverTolerant(v: string): SemverParts | null {
  const r = parseVersionTolerant(v)
  if (r?.kind === 'semver') return r.parts
  return null
}

/**
 * 扩展：R26 按格式渲染仓库版本。
 * - X.Y.Z：返回无前缀的语义版本核心（含 prerelease 如 1.2.0-beta.1）
 * - VYYMMDDHHmm：返回 V + stamp（忽略 projectVersion 的语义部分）
 */
export function formatRepoVersion(format: RepoVersionFormat, projectVersion: string, stamp: string, prerelease?: string): string {
  if (format === 'VYYMMDDHHmm') {
    if (!/^\d{10,12}$/.test(stamp)) throw new Error(`INVALID_STAMP: ${stamp}`)
    return `V${stamp}`
  }
  const p = parseSemver(projectVersion) ?? parseSemverTolerant(projectVersion)
  if (!p) throw new Error(`INVALID_SEMVER: ${projectVersion}`)
  const pre = prerelease?.trim() || p.prerelease
  const core = `${p.major}.${p.minor}.${p.patch}`
  return pre ? `${core}-${pre}` : core
}

/** SEMVER_RE 匹配解析；不匹配返回 null */
export function parseSemver(v: string): SemverParts | null {
  const m = SEMVER_PRERELEASE_RE.exec(v.trim())
  if (!m) return null
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    ...(m[4] !== undefined ? { prerelease: m[4] } : {}),
    ...(m[5] !== undefined ? { build: Number(m[5]) } : {}),
  }
}

/** 按 bump 类型递增，返回 vX.Y.Z（丢弃 build 段，保留 v 前缀）；支持 prerelease 透传 */
export function bumpSemver(v: string, bump: BumpType, prerelease?: string): string {
  const p = parseSemver(v) ?? parseSemverTolerant(v)
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
  const base = `v${major}.${minor}.${patch}`
  const pre = prerelease?.trim()
  if (pre) {
    if (!PRERELEASE_RE.test(pre)) throw new Error(`INVALID_PRERELEASE: ${pre}`)
    return `${base}-${pre}`
  }
  return base
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

/** 混合版本：vX.Y.Z.YYMMDDHH（stamp 8~10 位）；支持 prerelease 前缀（vX.Y.Z-beta.1.stamp） */
export function hybridVersion(projectVersion: string, stamp: string, prerelease?: string): string {
  const p = parseSemver(projectVersion) ?? parseSemverTolerant(projectVersion)
  if (!p) throw new Error(`INVALID_SEMVER: ${projectVersion}`)
  const pre = prerelease?.trim() || p.prerelease
  const base = `v${p.major}.${p.minor}.${p.patch}`
  if (pre) {
    if (!PRERELEASE_RE.test(pre)) throw new Error(`INVALID_PRERELEASE: ${pre}`)
    return `${base}-${pre}.${stamp}`
  }
  return `${base}.${stamp}`
}

/** semver 比较：a < b 返回负，a > b 返回正，相等返回 0；不可解析的排在前面视为更小 */
export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a)
  const pb = parseSemver(b)
  if (!pa && !pb) return 0
  if (!pa) return -1
  if (!pb) return 1
  const core = pa.major - pb.major || pa.minor - pb.minor || pa.patch - pb.patch
  if (core !== 0) return core
  const pre = comparePrerelease(pa.prerelease, pb.prerelease)
  if (pre !== 0) return pre
  return (pa.build ?? 0) - (pb.build ?? 0)
}

/**
 * 扩展：R26 通用版本比较（兼容 V 时间戳与 semver 混合排序）。
 * 同 kind 内按数值/时间戳比较；异 kind 时 semver < timestamp（稳定排序）。
 * 扩展 R30：semver 内 prerelease < 正式版，同 prerelease 按标识与数字段比较
 */
export function compareVersion(a: string, b: string): number {
  const pa = parseVersionTolerant(a)
  const pb = parseVersionTolerant(b)
  if (!pa && !pb) return 0
  if (!pa) return -1
  if (!pb) return 1
  if (pa.kind === 'timestamp' && pb.kind === 'timestamp') {
    if (pa.stamp === pb.stamp) return 0
    return pa.stamp < pb.stamp ? -1 : 1
  }
  if (pa.kind === 'semver' && pb.kind === 'semver') {
    const x = pa.parts
    const y = pb.parts
    const core = x.major - y.major || x.minor - y.minor || x.patch - y.patch
    if (core !== 0) return core
    const pre = comparePrerelease(x.prerelease, y.prerelease)
    if (pre !== 0) return pre
    return (x.build ?? 0) - (y.build ?? 0)
  }
  return pa.kind === 'semver' ? -1 : 1
}
