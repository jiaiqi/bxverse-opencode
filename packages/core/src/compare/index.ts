// packages/core/src/compare/index.ts
// 一致性对比引擎（R19/M6）三层次：
// ① 源码级：git diff --name-status --numstat 两 commit/tag 间文件差异
// ② 产物级：两份哈希清单（manifest）对比 → added/removed/modified/same
// ③ 校验级：manifest vs 实际归档文件（重算 sha256）

import fs from 'node:fs'
import path from 'node:path'
import type { CompareResult, FileCompareItem, FileSideInfo } from '@bxverse/shared'
import { git } from '../git'
import { hashFile, type Manifest } from '../backup/manifest'

function totals(files: FileCompareItem[]): CompareResult['totals'] {
  return {
    added: files.filter(f => f.status === 'added').length,
    removed: files.filter(f => f.status === 'removed').length,
    modified: files.filter(f => f.status === 'modified').length,
    same: files.filter(f => f.status === 'same').length,
  }
}

// ==================== ① 源码级（git diff） ====================

/**
 * 两 ref 间文件级差异（from/to 可为 tag/commit/hash；空 from = 首次发布全量）。
 * git 的 --numstat 与 --name-status 不能同出，故两次调用按 path 合并；
 * 文件名含制表符/换行的极端场景不保证（与既有提交解析限制一致）。
 */
export async function compareSource(
  repoPath: string,
  from: string | null,
  to: string,
): Promise<CompareResult> {
  const range = from ? `${from}..${to}` : to
  const [num, names] = await Promise.all([
    git(['diff', '--numstat', '--no-renames', range], { cwd: repoPath, timeoutMs: 60_000 }),
    git(['diff', '--name-status', '--no-renames', range], { cwd: repoPath, timeoutMs: 60_000 }),
  ])
  if (!num.ok || !names.ok) {
    const bad = (num.ok ? names : num) as { ok: false; code: number | string; stderr: string }
    const first = bad.stderr.split('\n')[0] || `git diff 失败（code=${bad.code}）`
    throw new Error(`源码对比失败: ${first}`)
  }
  const files: FileCompareItem[] = []
  for (const row of num.stdout.split('\n').filter(Boolean)) {
    // numstat 行：added\tdeleted\tpath（二进制文件为 -\t-）
    const m1 = /^(-|\d+)\t(-|\d+)\t(.+)$/.exec(row)
    if (m1) {
      files.push({
        path: m1[3],
        status: 'modified',
        insertions: m1[1] === '-' ? 0 : Number(m1[1]),
        deletions: m1[2] === '-' ? 0 : Number(m1[2]),
      })
    }
  }
  for (const row of names.stdout.split('\n').filter(Boolean)) {
    // name-status 行：status\tpath（A/D/M/R/T 等）
    const m2 = /^([A-Z]\d*)\t(.+)$/.exec(row)
    if (!m2) continue
    const st = m2[1][0]
    const item = files.find(f => f.path === m2[2])
    if (item) {
      item.status = st === 'A' ? 'added' : st === 'D' ? 'removed' : 'modified'
    } else {
      files.push({
        path: m2[2],
        status: st === 'A' ? 'added' : st === 'D' ? 'removed' : 'modified',
        insertions: 0,
        deletions: 0,
      })
    }
  }
  files.sort((a, b) => a.path.localeCompare(b.path))
  return {
    kind: 'source',
    left: from ?? '(root)',
    right: to,
    files,
    totals: totals(files),
  }
}

// ==================== ② 产物级（manifest 对比） ====================

/** 两份清单对比（按相对路径合并，sha256/size 不同 → modified） */
export function compareManifests(left: Manifest, right: Manifest, names?: { left?: string; right?: string }): CompareResult {
  const lm = new Map(left.files.map(f => [f.path, f]))
  const rm = new Map(right.files.map(f => [f.path, f]))
  const paths = new Set([...lm.keys(), ...rm.keys()])
  const files: FileCompareItem[] = []
  for (const p of [...paths].sort()) {
    const l = lm.get(p)
    const r = rm.get(p)
    if (!l) files.push({ path: p, status: 'added', right: side(r) })
    else if (!r) files.push({ path: p, status: 'removed', left: side(l) })
    else if (l.sha256 !== r.sha256 || l.size !== r.size) {
      files.push({ path: p, status: 'modified', left: side(l), right: side(r) })
    } else {
      files.push({ path: p, status: 'same', left: side(l), right: side(r) })
    }
  }
  return {
    kind: 'artifact',
    left: names?.left ?? left.root,
    right: names?.right ?? right.root,
    files,
    totals: totals(files),
  }
}

function side(f?: { sha256?: string; size?: number }): FileSideInfo | undefined {
  return f ? { sha256: f.sha256, size: f.size } : undefined
}

// ==================== ③ 校验级（manifest vs 实际文件） ====================

/** 重算目录内文件哈希并比对清单：缺失 → removed、清单无记录 → added、哈希不一致 → modified */
export async function verifyManifest(dir: string, manifest: Manifest): Promise<CompareResult> {
  const actual = new Map<string, { sha256: string; size: number }>()
  const walk = async (d: string, relBase: string): Promise<void> => {
    let entries: fs.Dirent[]
    try {
      entries = await fs.promises.readdir(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.isSymbolicLink()) continue
      const rel = relBase ? `${relBase}/${e.name}` : e.name
      const abs = path.join(d, e.name)
      if (e.isDirectory()) {
        if (e.name === '.git') continue
        await walk(abs, rel)
      } else if (e.isFile()) {
        actual.set(rel, { sha256: await hashFile(abs), size: (await fs.promises.stat(abs)).size })
      }
    }
  }
  await walk(dir, '')

  const files: FileCompareItem[] = []
  const manifestPaths = new Set(manifest.files.map(f => f.path))
  for (const [p, m] of manifest.files.map(f => [f.path, f] as const)) {
    const a = actual.get(p)
    if (!a) files.push({ path: p, status: 'removed', left: { sha256: m.sha256, size: m.size } })
    else if (a.sha256 !== m.sha256 || a.size !== m.size) {
      files.push({ path: p, status: 'modified', left: { sha256: m.sha256, size: m.size }, right: { sha256: a.sha256, size: a.size } })
    } else {
      files.push({ path: p, status: 'same', left: { sha256: m.sha256, size: m.size } })
    }
  }
  for (const [p, a] of actual) {
    if (!manifestPaths.has(p)) files.push({ path: p, status: 'added', right: { sha256: a.sha256, size: a.size } })
  }
  files.sort((a, b) => a.path.localeCompare(b.path))
  return { kind: 'verify', left: manifest.root, right: dir, files, totals: totals(files) }
}
