// packages/core/src/git.ts
// git 子进程封装与解析（零依赖，仅 child_process.spawn）
// 原则：所有 git 调用数组参数（绝不 shell 拼接）；永不执行写历史类命令
// （commit/amend/reset/rebase/force-push 在本包禁止，唯一的 commit 发生在数据仓库 store.ts）

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { CommitInfo, DiffStat } from '@bxverse/shared'
import { classifyCommit } from './changelog'

export type GitResult =
  | { ok: true; stdout: string; stderr: string }
  | { ok: false; code: number | string; stderr: string }

export class GitError extends Error {
  code: number | string
  stderr: string
  constructor(code: number | string, stderr: string) {
    const first = stderr.split('\n')[0] || `git 执行失败（code=${code}）`
    super(`[${code}] ${first}`)
    this.name = 'GitError'
    this.code = code
    this.stderr = stderr
  }
}

const MAX_BUFFER = 50 * 1024 * 1024

export interface GitOpts {
  cwd?: string
  timeoutMs?: number
  env?: NodeJS.ProcessEnv
}

/** 基础封装：spawn git，超时/缓冲上限保护，结果归一为 GitResult（永不 throw） */
export function git(args: string[], opts: GitOpts = {}): Promise<GitResult> {
  const { cwd = process.cwd(), timeoutMs = 30_000 } = opts
  const env = opts.env ?? { ...process.env, LC_ALL: 'C.UTF-8' }
  // -c core.quotepath=false 保证中文路径按 UTF-8 原样输出
  const finalArgs = ['-c', 'core.quotepath=false', ...args]
  return new Promise((resolve) => {
    let child
    try {
      child = spawn('git', finalArgs, { cwd, windowsHide: true, env, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (err) {
      resolve({ ok: false, code: 'SPAWN', stderr: (err as Error).message })
      return
    }
    let stdout = ''
    let stderr = ''
    let killed = false
    let overLimit = false
    const timer = setTimeout(() => {
      killed = true
      child.kill('SIGKILL')
    }, timeoutMs)
    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString('utf8')
      if (stdout.length > MAX_BUFFER) {
        overLimit = true
        child.kill('SIGKILL')
      }
    })
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString('utf8')
    })
    child.on('error', (err: Error) => {
      clearTimeout(timer)
      resolve({ ok: false, code: 'SPAWN', stderr: err.message })
    })
    child.on('close', (code: number | null) => {
      clearTimeout(timer)
      if (overLimit) resolve({ ok: false, code: 'BUFFER', stderr: 'stdout 超过 50MB 上限' })
      else if (killed) resolve({ ok: false, code: 'TIMEOUT', stderr: `git 执行超时（${timeoutMs}ms）` })
      else if (code === 0) resolve({ ok: true, stdout, stderr })
      else resolve({ ok: false, code: code ?? 1, stderr })
    })
  })
}

/** 成功则返回 stdout，失败抛 GitError */
export function ensureOk(result: GitResult): string {
  if (result.ok) return result.stdout
  throw new GitError(result.code, result.stderr)
}

/** 执行 shell 命令（构建命令用，非 git 操作），逐行回调输出 */
export async function runShell(
  command: string,
  cwd: string,
  onLine: (line: string) => void,
  timeoutMs = 30 * 60_000,
): Promise<GitResult> {
  return new Promise((resolve) => {
    const child = spawn(command, { cwd, shell: true, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    let killed = false
    const timer = setTimeout(() => {
      killed = true
      child.kill('SIGKILL')
    }, timeoutMs)
    let buf = ''
    child.stdout.on('data', (d: Buffer) => {
      buf += d.toString('utf8')
      let idx
      while ((idx = buf.indexOf('\n')) !== -1) {
        onLine(buf.slice(0, idx).replace(/\r$/, ''))
        buf = buf.slice(idx + 1)
      }
    })
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString('utf8')
      let idx
      while ((idx = stderr.indexOf('\n')) !== -1) {
        onLine(stderr.slice(0, idx).replace(/\r$/, ''))
        stderr = stderr.slice(idx + 1)
      }
    })
    child.on('error', (err: Error) => {
      clearTimeout(timer)
      resolve({ ok: false, code: 'SPAWN', stderr: err.message })
    })
    child.on('close', (code: number | null) => {
      clearTimeout(timer)
      if (buf.trim()) onLine(buf.replace(/\r$/, ''))
      if (stderr.trim()) stderr = stderr.trim()
      if (killed) resolve({ ok: false, code: 'TIMEOUT', stderr: `命令执行超时（${timeoutMs}ms）` })
      else if (code === 0) resolve({ ok: true, stdout: '', stderr })
      else resolve({ ok: false, code: code ?? 1, stderr })
    })
  })
}

// ==================== 仓库状态 ====================

export async function isRepo(dir: string): Promise<boolean> {
  if (!dir || !fs.existsSync(dir)) return false
  return (await git(['rev-parse', '--git-dir'], { cwd: dir })).ok
}

/** 完整 40 位 HEAD hash；空仓库抛 GitError('EMPTY_REPO') */
export async function head(dir: string): Promise<string> {
  const r = await git(['rev-parse', 'HEAD'], { cwd: dir })
  if (!r.ok) throw new GitError('EMPTY_REPO', r.stderr || '空仓库（无提交）')
  return r.stdout.trim()
}

/** 当前分支；detached → '(detached)'；空仓库抛 GitError('EMPTY_REPO') */
export async function currentBranch(dir: string): Promise<string> {
  const hr = await git(['rev-parse', 'HEAD'], { cwd: dir })
  if (!hr.ok) throw new GitError('EMPTY_REPO', '空仓库（无提交）')
  const r = await git(['symbolic-ref', '--short', 'HEAD'], { cwd: dir })
  return r.ok ? r.stdout.trim() : '(detached)'
}

/** 未提交改动数（仅已跟踪文件，untracked 不计入） */
export async function dirtyCount(dir: string): Promise<number> {
  const r = await git(['status', '--porcelain', '--untracked-files=no'], { cwd: dir })
  if (!r.ok) return 0
  return r.stdout.trim().split(/\r?\n/).filter(Boolean).length
}

export async function hasRemote(dir: string, name = 'origin'): Promise<boolean> {
  return (await git(['remote', 'get-url', name], { cwd: dir })).ok
}

export async function remoteUrl(dir: string, name = 'origin'): Promise<string> {
  const r = await git(['remote', 'get-url', name], { cwd: dir })
  return r.ok ? r.stdout.trim() : ''
}

// ==================== 标签 ====================

/** 最近创建的标签（按 creatordate 倒序取第一个）；无标签 → null */
export async function latestTag(dir: string): Promise<string | null> {
  const r = await git(
    ['for-each-ref', 'refs/tags', '--sort=-creatordate', '--format=%(refname:short)', '--count=1'],
    { cwd: dir },
  )
  if (!r.ok || !r.stdout.trim()) return null
  return r.stdout.trim().split(/\r?\n/)[0]
}

export async function listTags(dir: string, pattern?: string): Promise<string[]> {
  const r = await git(pattern ? ['tag', '-l', pattern] : ['tag', '-l'], { cwd: dir })
  if (!r.ok || !r.stdout.trim()) return []
  return r.stdout.trim().split(/\r?\n/)
}

export async function tagExists(dir: string, tag: string): Promise<boolean> {
  return (await git(['rev-parse', '-q', '--verify', `refs/tags/${tag}`], { cwd: dir })).ok
}

/** 标签指向的 commit（不存在 → null） */
export async function tagTarget(dir: string, tag: string): Promise<string | null> {
  const r = await git(['rev-list', '-n', '1', tag], { cwd: dir })
  return r.ok && r.stdout.trim() ? r.stdout.trim() : null
}

/**
 * 创建附注标签（幂等）：
 * - 同 tag 已存在且指向同一 commit → 跳过
 * - 同 tag 已存在且指向不同 commit → 抛 GitError('TAG_CONFLICT')（交预检/规避层处理）
 */
export async function createTag(
  dir: string,
  tag: string,
  opts: { target?: string; message?: string } = {},
): Promise<void> {
  const target = opts.target ?? 'HEAD'
  if (await tagExists(dir, tag)) {
    const existing = await tagTarget(dir, tag)
    const want = target === 'HEAD' ? ensureOk(await git(['rev-parse', 'HEAD'], { cwd: dir })).trim() : target
    if (existing === want) return
    throw new GitError('TAG_CONFLICT', `标签 ${tag} 已存在且指向不同 commit`)
  }
  ensureOk(await git(['tag', '-a', tag, '-m', opts.message ?? tag, target], { cwd: dir }))
}

/** 推送标签；无 origin → 抛 GitError('NO_REMOTE')（调用方降级为警告） */
export async function pushTag(dir: string, tag: string): Promise<void> {
  if (!(await hasRemote(dir))) throw new GitError('NO_REMOTE', '未配置 origin 远程')
  ensureOk(await git(['push', 'origin', 'tag', tag], { cwd: dir, timeoutMs: 60_000 }))
}

// ==================== 提交解析 ====================

const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'

/**
 * 收集 base..HEAD 的提交（base=null 时 --root 全量收集，即首次发布语义）。
 * 解析格式：%H\x1e%h\x1e%an\x1e%ad\x1e%s\x1f + 文件行，提交间空行分隔。
 * 已知限制：文件名含换行（极罕见）会导致归属错位。
 */
export async function commitsSince(
  dir: string,
  base: string | null,
  opts: { maxCommits?: number; includeFiles?: boolean; warnings?: string[] } = {},
): Promise<CommitInfo[]> {
  const maxCommits = opts.maxCommits ?? 3000
  const includeFiles = opts.includeFiles ?? true
  const buildArgs = (b: string | null) => {
    const args = ['log', '--no-merges', '--reverse', '--date=short', '--pretty=format:%H%x1e%h%x1e%an%x1e%ad%x1e%s%x1f']
    if (includeFiles) args.push('--name-only')
    if (b) args.push(`${b}..HEAD`)
    else args.push('--root')
    return args
  }
  let r = await git(buildArgs(base), { cwd: dir })
  if (!r.ok && base) {
    // 基准不可达（force-push / GC）：按首次发布全量收集
    opts.warnings?.push('检测基准不可达，已按首次发布全量收集')
    r = await git(buildArgs(null), { cwd: dir })
  }
  if (!r.ok) return []

  const result: CommitInfo[] = []
  let truncated = false
  let cur: CommitInfo | null = null
  for (const line of r.stdout.split('\n')) {
    const sep = line.indexOf('\x1f')
    if (sep !== -1) {
      const parts = line.slice(0, sep).split('\x1e')
      const rawSubject = parts[4] ?? ''
      const { rest, ...cls } = classifyCommit(rawSubject)
      const info: CommitInfo = {
        fullHash: parts[0] ?? '',
        hash: parts[1] ?? '',
        author: parts[2] ?? '',
        date: parts[3] ?? '',
        subject: rest,
        ...cls,
        files: [],
      }
      if (result.length >= maxCommits) {
        result.shift()
        truncated = true
      }
      result.push(info)
      cur = info
    } else if (line.trim() === '') {
      cur = null
    } else if (cur) {
      cur.files.push(line)
    }
  }
  if (truncated) opts.warnings?.push(`提交数超过 ${maxCommits}，仅展示最近 ${maxCommits} 条`)
  return result
}

/** 范围 diff 统计；base=null 时对空树 diff（首次发布全量）；失败/超时 → 全 0 + warning */
export async function diffStat(
  dir: string,
  base: string | null,
  opts: { warnings?: string[] } = {},
): Promise<DiffStat> {
  const range = base ? `${base}..HEAD` : `${EMPTY_TREE}..HEAD`
  const r = await git(['diff', '--shortstat', range], { cwd: dir, timeoutMs: 15_000 })
  if (!r.ok) {
    if (r.code === 'TIMEOUT') opts.warnings?.push('diff 统计超时，按 0 处理')
    return { filesChanged: 0, insertions: 0, deletions: 0 }
  }
  const s = r.stdout
  return {
    filesChanged: Number(s.match(/ (\d+) files? changed/)?.[1] ?? 0),
    insertions: Number(s.match(/ (\d+) insertions?\(\+\)/)?.[1] ?? 0),
    deletions: Number(s.match(/ (\d+) deletions?\(-\)/)?.[1] ?? 0),
  }
}

// ==================== 克隆 ====================

const CLONE_SCHEMES = ['https://', 'ssh://', 'git@']

/** 克隆仓库到本地（URL 白名单校验；目标目录必须不存在或为空） */
export async function clone(url: string, targetDir: string, opts: { shallow?: boolean } = {}): Promise<void> {
  if (!CLONE_SCHEMES.some(p => url.startsWith(p))) {
    throw new GitError('BAD_URL', `不支持的仓库地址协议（仅支持 https://、ssh://、git@）: ${url}`)
  }
  if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0) {
    throw new GitError('TARGET_EXISTS', `目标目录非空: ${targetDir}`)
  }
  fs.mkdirSync(path.dirname(targetDir), { recursive: true })
  const args = ['clone']
  if (opts.shallow) args.push('--depth', '1')
  args.push(url, targetDir)
  ensureOk(await git(args, { timeoutMs: 120_000 }))
}
