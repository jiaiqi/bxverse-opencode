// packages/core/src/backup/index.ts
// 备份编排（R19/M6）：一次发布一个仓库 → source.bundle / source.tar.gz / artifact.tar.gz + manifest
// 幂等（同名同哈希跳过）；失败清理本次半成品；元数据由调用方经 DataStore.writeBackupMeta 落数据仓库。

import fs from 'node:fs'
import path from 'node:path'
import type { BackupCleanupResult, BackupRetention, BackupUsage, RepoBackupRef } from '@bxverse/shared'
import { DataStore, versionSafe } from '../store'
import { backupArtifact, ARTIFACT_TAR } from './artifact'
import { hashFile } from './manifest'
import { createArchiveGz, createBundle } from './source'

export { backupArtifact, ARTIFACT_MANIFEST, ARTIFACT_TAR } from './artifact'
export { buildManifest, readManifest, hashFile } from './manifest'
export { extractTarGz, restoreArchive, restoreBundle } from './restore'

export const SOURCE_BUNDLE = 'source.bundle'
export const SOURCE_ARCHIVE = 'source.tar.gz'
export const SOURCE_SHA256 = 'source.sha256'

export class BackupError extends Error {}

export interface BackupRepoOptions {
  projectId: string
  repoId: string
  repoName: string
  repoPath: string
  version: string
  releaseId: string
  /** 备份时 HEAD（full hash） */
  commit: string
  /** 本次 build tag（快照 ref 优先用它，其次 commit） */
  tag?: string
  /** 备份根目录（AppConfig.backup.dir ?? ~/.bxverse/backups） */
  backupDir: string
  /** 是否备份源码（bundle + 快照） */
  source?: boolean
  /** 源码备份形式（AppConfig.backup.source；缺省 both） */
  sourceMode?: 'both' | 'bundle' | 'archive'
  /** 是否备份产物（需 artifactDir 已配置） */
  artifact?: boolean
  artifactDir?: string
  log?: (msg: string) => void
}

/** 文件大小（失败归 0，仅展示用） */
function statSize(file: string): number {
  try {
    return fs.statSync(file).size
  } catch {
    return 0
  }
}

/**
 * 执行一次仓库备份；返回元数据引用（全部跳过时返回 null）。
 * 任一环节失败抛 BackupError，并清理本次运行创建的文件。
 */
export async function backupRepo(opts: BackupRepoOptions): Promise<RepoBackupRef | null> {
  const dir = path.join(opts.backupDir, opts.projectId, opts.repoId, versionSafe(opts.version))
  const created: string[] = []
  const items: RepoBackupRef['items'] = []
  const ref = opts.tag && opts.tag.length > 0 ? opts.tag : opts.commit
  const log = opts.log ?? ((): void => {})
  const touch = (file: string): void => {
    if (!created.includes(file)) created.push(file)
  }

  try {
    fs.mkdirSync(dir, { recursive: true })
    const mode = opts.sourceMode ?? 'both'

    if (opts.source) {
      // 1. bundle（全部历史与标签）
      if (mode === 'both' || mode === 'bundle') {
        const bundle = path.join(dir, SOURCE_BUNDLE)
        log('备份源码：git bundle（全部历史与标签）')
        await createBundle(opts.repoPath, bundle)
        touch(bundle)
        items.push({ kind: 'source-bundle', file: SOURCE_BUNDLE, sha256: await hashFile(bundle), size: statSize(bundle) })
      }

      // 2. 快照（git archive，仅已跟踪文件，遵循 .gitignore）
      if (mode === 'both' || mode === 'archive') {
        const archive = path.join(dir, SOURCE_ARCHIVE)
        log('备份源码：git archive 工作树快照')
        await createArchiveGz(opts.repoPath, ref, archive)
        touch(archive)
        items.push({ kind: 'source-archive', file: SOURCE_ARCHIVE, sha256: await hashFile(archive), size: statSize(archive) })
      }

      // 3. sha256 校验文件（一行一文件）
      const shaFile = path.join(dir, SOURCE_SHA256)
      const lines = items
        .filter(i => i.file !== SOURCE_SHA256)
        .map(i => `${i.sha256}  ${i.file}`)
        .join('\n') + '\n'
      fs.writeFileSync(shaFile, lines)
      touch(shaFile)
    }

    if (opts.artifact) {
      if (!opts.artifactDir) {
        log('跳过产物备份：仓库未配置产物目录')
      } else {
        log(`备份产物：${opts.artifactDir}`)
        const r = await backupArtifact(opts.repoPath, opts.artifactDir, dir)
        if (r === null) {
          log('跳过产物备份：产物目录不存在或为空')
        } else {
          touch(r.tarFile)
          touch(r.manifestFile)
          items.push({ kind: 'artifact', file: ARTIFACT_TAR, sha256: await hashFile(r.tarFile), size: statSize(r.tarFile), files: r.fileCount })
          log(`产物备份完成：${r.fileCount} 个文件，${r.totalBytes} 字节`)
        }
      }
    }

    if (items.length === 0) return null
    return {
      releaseId: opts.releaseId,
      repoId: opts.repoId,
      repoName: opts.repoName,
      projectId: opts.projectId,
      version: opts.version,
      commit: opts.commit,
      tag: opts.tag,
      date: new Date().toISOString(),
      items,
    }
  } catch (e) {
    // 清理本次运行创建的文件（不删已有同名文件——幂等场景保留旧物）
    for (const f of created) {
      try {
        fs.rmSync(f, { force: true })
      } catch { /* 清理尽力而为 */ }
    }
    throw new BackupError(`备份失败: ${(e as Error).message}`)
  }
}

// ==================== 磁盘占用与保留策略（P0-1） ====================

function sumBytes(ref: RepoBackupRef): number {
  return ref.items.reduce((s, i) => s + (i.size || 0), 0)
}

/** 计算备份磁盘占用（按元数据 size 汇总，不含文件系统开销） */
export function getBackupUsage(metas: RepoBackupRef[]): BackupUsage {
  const byRepo = new Map<string, { repoId: string; repoName: string; projectId: string; count: number; bytes: number }>()
  let totalBytes = 0
  for (const m of metas) {
    const key = `${m.projectId}:${m.repoId}`
    const cur = byRepo.get(key) ?? { repoId: m.repoId, repoName: m.repoName, projectId: m.projectId, count: 0, bytes: 0 }
    cur.count += 1
    const b = sumBytes(m)
    cur.bytes += b
    totalBytes += b
    byRepo.set(key, cur)
  }
  return { totalBytes, totalCount: metas.length, byRepo: [...byRepo.values()] }
}

export interface EnforceRetentionOptions {
  backupDir: string
  dataStore: DataStore
  retention: BackupRetention
  projectId?: string
  repoId?: string
  dryRun?: boolean
  log?: (msg: string) => void
}

/**
 * 按保留策略清理过期备份（按仓库维度）。
 * - keepLast：每仓库保留最新 N 份
 * - maxBytes：每仓库总字节超过阈值时，从最旧开始删
 * - keepDays：超过天数的备份删除
 * 返回实际删除的元数据与释放字节；dryRun 时不落盘。
 */
export async function enforceRetention(opts: EnforceRetentionOptions): Promise<BackupCleanupResult> {
  const all = await opts.dataStore.listBackupMeta()
  const filtered = all.filter(m => {
    if (opts.projectId && m.projectId !== opts.projectId) return false
    if (opts.repoId && m.repoId !== opts.repoId) return false
    return true
  })
  const grouped = new Map<string, RepoBackupRef[]>()
  for (const m of filtered) {
    const k = `${m.projectId}:${m.repoId}`
    const arr = grouped.get(k) ?? []
    arr.push(m)
    grouped.set(k, arr)
  }
  const toDelete: RepoBackupRef[] = []
  const now = Date.now()
  for (const [, list] of grouped) {
    list.sort((a, b) => b.date.localeCompare(a.date))
    const keep = new Set<string>()
    // keepLast
    if (opts.retention.keepLast != null && opts.retention.keepLast > 0) {
      for (let i = 0; i < Math.min(opts.retention.keepLast, list.length); i++) keep.add(list[i].releaseId + '|' + list[i].repoId)
    } else {
      for (const m of list) keep.add(m.releaseId + '|' + m.repoId)
    }
    // maxBytes：对 keep 集合按新到旧累加，超限的踢出
    if (opts.retention.maxBytes != null && opts.retention.maxBytes > 0) {
      let acc = 0
      const stillKeep = new Set<string>()
      for (const m of list) {
        const key = m.releaseId + '|' + m.repoId
        if (!keep.has(key)) continue
        const b = sumBytes(m)
        if (acc + b <= opts.retention.maxBytes || stillKeep.size === 0) {
          acc += b
          stillKeep.add(key)
        }
      }
      for (const k of [...keep]) if (!stillKeep.has(k)) keep.delete(k)
    }
    // keepDays
    if (opts.retention.keepDays != null && opts.retention.keepDays > 0) {
      const cutoff = now - opts.retention.keepDays * 24 * 3600 * 1000
      for (const m of list) {
        const key = m.releaseId + '|' + m.repoId
        if (!keep.has(key)) continue
        if (new Date(m.date).getTime() < cutoff) keep.delete(key)
      }
    }
    for (const m of list) {
      const key = m.releaseId + '|' + m.repoId
      if (!keep.has(key)) toDelete.push(m)
    }
  }
  let freedBytes = 0
  for (const m of toDelete) freedBytes += sumBytes(m)
  if (!opts.dryRun) {
    for (const m of toDelete) {
      const dir = path.join(opts.backupDir, m.projectId, m.repoId, versionSafe(m.version))
      try {
        fs.rmSync(dir, { recursive: true, force: true })
      } catch { /* best-effort */ }
      try {
        await opts.dataStore.deleteBackupMeta(m.releaseId, m.repoId)
      } catch { /* best-effort */ }
      opts.log?.(`清理过期备份：${m.repoName} ${m.version} (${m.date.slice(0, 10)})`)
    }
    if (toDelete.length > 0) {
      try {
        await opts.dataStore.commitRecords(`chore(backup): retention cleanup ${toDelete.length} expired`)
      } catch { /* best-effort */ }
    }
  }
  const remaining = filtered.length - toDelete.length
  return { deleted: toDelete, freedBytes, remaining, dryRun: !!opts.dryRun }
}
