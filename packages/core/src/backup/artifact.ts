// packages/core/src/backup/artifact.ts
// 产物备份：RepoDef.artifactDir 目录 → artifact.tar.gz + artifact-manifest.json（R19/M6）
// 注意：产物目录本身即使被业务 .gitignore 也整体归档（否则 dist 类目录会丢失）；
// 仅排除 .git/.svn/.hg/node_modules 与符号链接。

import fs from 'node:fs'
import path from 'node:path'
import { buildManifest, readManifest, walkFiles, type Manifest } from './manifest'
import { createTarGz } from './tar'

export const ARTIFACT_TAR = 'artifact.tar.gz'
export const ARTIFACT_MANIFEST = 'artifact-manifest.json'

export interface ArtifactBackupResult {
  tarFile: string
  manifestFile: string
  fileCount: number
  totalBytes: number
}

/**
 * 归档产物目录。目录不存在或为空 → 返回 null（调用方按「跳过」处理）。
 * 幂等：tar/manifest 已存在且内容一致 → 直接返回（不重写）。
 */
export async function backupArtifact(repoPath: string, artifactDir: string, outDir: string): Promise<ArtifactBackupResult | null> {
  const abs = path.resolve(repoPath, artifactDir)
  if (!fs.existsSync(abs)) return null
  const files = await walkFiles(abs)
  if (files.length === 0) return null

  fs.mkdirSync(outDir, { recursive: true })
  const tarFile = path.join(outDir, ARTIFACT_TAR)
  const manifestFile = path.join(outDir, ARTIFACT_MANIFEST)

  const manifest: Manifest = await buildManifest(abs)
  if (fs.existsSync(tarFile) && fs.existsSync(manifestFile)) {
    const prev = await readManifest(manifestFile)
    const same = prev && JSON.stringify(prev.files) === JSON.stringify(manifest.files)
    if (same) {
      return { tarFile, manifestFile, fileCount: manifest.totals.files, totalBytes: manifest.totals.bytes }
    }
  }
  await createTarGz(files, tarFile)
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2))
  return { tarFile, manifestFile, fileCount: manifest.totals.files, totalBytes: manifest.totals.bytes }
}
