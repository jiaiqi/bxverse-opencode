// packages/core/src/backup/restore.ts
// 备份恢复（P0-2 低优先级前置）：bundle 克隆、快照/产物解包（零依赖，仅 git + zlib + 自研 untar）

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { spawn } from 'node:child_process'

function ensureEmptyDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
  const entries = fs.readdirSync(dir)
  if (entries.length > 0) throw new Error(`目标目录非空: ${dir}（请先清空或另选路径）`)
}

/** 将 gzip 压缩的 tar 按 512 块解析并落盘（支持 GNU LongLink）；overwrite=true 时允许目标目录非空并覆盖同名文件 */
export async function extractTarGz(tarGzFile: string, destDir: string, overwrite = false): Promise<number> {
  const gzData = fs.readFileSync(tarGzFile)
  const tarData: Buffer = await new Promise((resolve, reject) => {
    zlib.gunzip(gzData, (err, buf) => (err ? reject(err) : resolve(buf)))
  })
  fs.mkdirSync(destDir, { recursive: true })
  if (!overwrite && fs.readdirSync(destDir).length > 0) {
    throw new Error(`目标目录非空: ${destDir}（请先清空或另选路径）`)
  }
  let offset = 0
  let longName: string | null = null
  let count = 0
  while (offset + 512 <= tarData.length) {
    const header = tarData.subarray(offset, offset + 512)
    offset += 512
    const isZero = header.every(b => b === 0)
    if (isZero) {
      // 连续两个零块结束；但单零块也可能，需 peek 下一块
      if (offset + 512 <= tarData.length && tarData.subarray(offset, offset + 512).every(b => b === 0)) break
      continue
    }
    const nameRaw = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '')
    const sizeStr = header.subarray(124, 136).toString('utf8').replace(/\0.*$/, '').trim()
    const size = parseInt(sizeStr || '0', 8) || 0
    const typeflag = String.fromCharCode(header[156])
    if (typeflag === 'L') {
      longName = tarData.subarray(offset, offset + size).toString('utf8').replace(/\0.*$/, '')
      offset += Math.ceil(size / 512) * 512
      continue
    }
    const name = longName ?? nameRaw
    longName = null
    const isDir = typeflag === '5' || name.endsWith('/')
    const outPath = path.join(destDir, name)
    // 防路径穿越
    const resolved = path.resolve(outPath)
    const destResolved = path.resolve(destDir)
    if (resolved !== destResolved && !resolved.startsWith(destResolved + path.sep)) {
      throw new Error(`非法归档路径（越界）: ${name}`)
    }
    if (isDir) {
      fs.mkdirSync(outPath, { recursive: true })
    } else {
      fs.mkdirSync(path.dirname(outPath), { recursive: true })
      const fileData = tarData.subarray(offset, offset + size)
      fs.writeFileSync(outPath, fileData)
      count++
    }
    offset += Math.ceil(size / 512) * 512
  }
  return count
}

/** bundle 恢复：git clone <bundle> <targetDir> */
export async function restoreBundle(bundleFile: string, targetDir: string): Promise<void> {
  ensureEmptyDir(targetDir)
  const child = spawn('git', ['clone', bundleFile, targetDir], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
  let stderr = ''
  child.stderr.on('data', (d: Buffer) => { stderr += d.toString('utf8') })
  await new Promise<void>((resolve, reject) => {
    child.on('error', reject)
    child.on('close', code => (code === 0 ? resolve() : reject(new Error(stderr.split('\n')[0] || `git clone bundle 失败（${code}）`))))
  })
}

/** 快照/产物恢复：解压 tar.gz 到目标目录；overwrite=true 时允许非空目录并覆盖同名文件 */
export async function restoreArchive(tarGzFile: string, targetDir: string, overwrite = false): Promise<number> {
  if (!overwrite) ensureEmptyDir(targetDir)
  return extractTarGz(tarGzFile, targetDir, overwrite)
}
