// packages/core/src/backup/source.ts
// 源码备份：git bundle（全历史全标签，可 clone 恢复）+ git archive 快照（仅已跟踪文件，遵循 .gitignore）

import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { pipeline } from 'node:stream/promises'
import zlib from 'node:zlib'

const GIT_TIMEOUT_MS = 300_000
const MAX_STDERR = 64 * 1024

function firstError(stderr: string, fallback: string): Error {
  return new Error(stderr.split(/\r?\n/, 1)[0]?.trim() || fallback)
}

/** git bundle create（含全部 refs 与标签）；失败抛错 */
export async function createBundle(repoPath: string, outFile: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('git', ['-c', 'core.quotepath=false', 'bundle', 'create', outFile, '--all'], {
      cwd: repoPath,
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    let stderr = ''
    let settled = false
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
    }, GIT_TIMEOUT_MS)
    const fail = (error: Error): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { fs.rmSync(outFile, { force: true }) } catch { /* 清理尽力而为 */ }
      reject(error)
    }
    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.length < MAX_STDERR) stderr += chunk.toString('utf8').slice(0, MAX_STDERR - stderr.length)
    })
    child.once('error', (error) => fail(error))
    child.once('close', (code) => {
      if (settled) return
      clearTimeout(timer)
      if (code === 0) {
        settled = true
        resolve()
      } else {
        fail(firstError(stderr, `git bundle 失败（退出码 ${code ?? 'unknown'}）`))
      }
    })
  })
}

/**
 * git archive --format=tar <ref> 输出经 zlib gzip 流式写盘（不落临时 tar）。
 * 快照仅含已跟踪文件（.gitignore 语义由 git 原生保证）。
 */
export async function createArchiveGz(repoPath: string, ref: string, outFile: string): Promise<void> {
  const child = spawn('git', ['-c', 'core.quotepath=false', 'archive', '--format=tar', ref], {
    cwd: repoPath,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stderr = ''
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    child.kill('SIGKILL')
  }, GIT_TIMEOUT_MS)

  const exit = new Promise<number>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code) => resolve(code ?? 1))
  })
  child.stderr?.on('data', (chunk: Buffer) => {
    if (stderr.length < MAX_STDERR) stderr += chunk.toString('utf8').slice(0, MAX_STDERR - stderr.length)
  })

  try {
    if (!child.stdout) throw new Error('git archive 未提供输出流')
    const gzip = zlib.createGzip({ level: 6 })
    const output = fs.createWriteStream(outFile)
    const pipePromise = pipeline(child.stdout, gzip, output)
    const [code] = await Promise.all([exit, pipePromise])
    if (timedOut) throw new Error(`git archive 执行超时（${GIT_TIMEOUT_MS}ms）`)
    if (code !== 0) throw firstError(stderr, `git archive 失败（退出码 ${code}）`)
  } catch (error) {
    child.kill('SIGKILL')
    try { await exit } catch { /* child error 已由主错误处理 */ }
    try { fs.rmSync(outFile, { force: true }) } catch { /* 清理尽力而为 */ }
    throw error instanceof Error ? error : new Error(String(error))
  } finally {
    clearTimeout(timer)
  }
}
