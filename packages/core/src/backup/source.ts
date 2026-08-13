// packages/core/src/backup/source.ts
// 源码备份：git bundle（全历史全标签，可 clone 恢复）+ git archive 快照（仅已跟踪文件，遵循 .gitignore）

import fs from 'node:fs'
import zlib from 'node:zlib'
import { spawn } from 'node:child_process'
import { ensureOk, git } from '../git'

/** git bundle create（含全部 refs 与标签）；失败抛 GitError */
export async function createBundle(repoPath: string, outFile: string): Promise<void> {
  ensureOk(await git(['bundle', 'create', outFile, '--all'], { cwd: repoPath, timeoutMs: 300_000 }))
}

/**
 * git archive --format=tar <ref> 输出经 zlib gzip 流式写盘（不落临时 tar）。
 * 快照仅含已跟踪文件（.gitignore 语义由 git 原生保证）。
 */
export async function createArchiveGz(repoPath: string, ref: string, outFile: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('git', ['-c', 'core.quotepath=false', 'archive', '--format=tar', ref], {
      cwd: repoPath,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const gzip = zlib.createGzip({ level: 6 })
    const out = fs.createWriteStream(outFile)
    let stderr = ''
    let settled = false
    const fail = (err: Error): void => {
      if (settled) return
      settled = true
      try { fs.rmSync(outFile, { force: true }) } catch { /* 清理尽力而为 */ }
      reject(err)
    }
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString('utf8') })
    child.on('error', (e) => fail(e))
    out.on('error', (e) => fail(e))
    gzip.on('error', (e) => fail(e))
    child.stdout.pipe(gzip).pipe(out)
    child.on('close', (code) => {
      if (settled) return
      settled = true
      if (code === 0) resolve()
      else fail(new Error(stderr.split('\n')[0] || `git archive 失败（退出码 ${code}）`))
    })
  })
}
