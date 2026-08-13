// packages/core/src/backup/index.ts
// 备份编排（R19/M6）：一次发布一个仓库 → source.bundle / source.tar.gz / artifact.tar.gz + manifest
// 幂等（同名同哈希跳过）；失败清理本次半成品；元数据由调用方经 DataStore.writeBackupMeta 落数据仓库。

import fs from 'node:fs'
import path from 'node:path'
import type { RepoBackupRef } from '@bxverse/shared'
import { versionSafe } from '../store'
import { backupArtifact, ARTIFACT_TAR } from './artifact'
import { hashFile } from './manifest'
import { createArchiveGz, createBundle } from './source'

export { backupArtifact, ARTIFACT_MANIFEST, ARTIFACT_TAR } from './artifact'
export { buildManifest, readManifest, hashFile } from './manifest'

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
