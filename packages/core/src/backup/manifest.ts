// packages/core/src/backup/manifest.ts
// 哈希清单：目录 → Manifest（流式 sha256，零依赖，R19/M6）

import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

export interface ManifestFile {
  /** 相对根目录的正斜杠路径 */
  path: string
  sha256: string
  size: number
}

export interface Manifest {
  schemaVersion: 1
  createdAt: string
  root: string
  files: ManifestFile[]
  totals: { files: number; bytes: number }
}

/** 归档/清单通用排除目录（VCS 与依赖目录永远不备份） */
export const BACKUP_SKIP_DIRS = new Set(['.git', '.svn', '.hg', 'node_modules'])

/** 流式 sha256（大文件不整读内存） */
export function hashFile(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256')
    const s = fs.createReadStream(file)
    s.on('data', (d: Buffer | string) => h.update(d))
    s.on('error', reject)
    s.on('end', () => resolve(h.digest('hex')))
  })
}

/** 递归收集目录内文件（排序稳定；跳过符号链接防环） */
export async function walkFiles(root: string, opts: { skipDirs?: Set<string> } = {}): Promise<{ rel: string; abs: string; size: number }[]> {
  const skip = opts.skipDirs ?? BACKUP_SKIP_DIRS
  const out: { rel: string; abs: string; size: number }[] = []
  const walk = async (dir: string, relBase: string): Promise<void> => {
    let entries: fs.Dirent[]
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const e of entries) {
      if (e.isSymbolicLink()) continue
      const rel = relBase ? `${relBase}/${e.name}` : e.name
      const abs = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (skip.has(e.name)) continue
        await walk(abs, rel)
      } else if (e.isFile()) {
        let size = 0
        try {
          size = (await fs.promises.stat(abs)).size
        } catch {
          continue
        }
        out.push({ rel, abs, size })
      }
    }
  }
  await walk(root, '')
  return out
}

/** 目录 → 哈希清单（相对路径正斜杠；sha256 流式计算） */
export async function buildManifest(root: string, opts: { skipDirs?: Set<string> } = {}): Promise<Manifest> {
  const files = await walkFiles(root, opts)
  const list: ManifestFile[] = []
  let bytes = 0
  for (const f of files) {
    list.push({ path: f.rel, sha256: await hashFile(f.abs), size: f.size })
    bytes += f.size
  }
  return {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    root: path.basename(root) || root,
    files: list,
    totals: { files: list.length, bytes },
  }
}

/** 读取既有 manifest（不存在 → null） */
export async function readManifest(file: string): Promise<Manifest | null> {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Manifest
    if (!Array.isArray(raw.files)) return null
    return raw
  } catch {
    return null
  }
}
