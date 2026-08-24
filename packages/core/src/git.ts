// packages/core/src/git.ts
// git 子进程封装与解析（零依赖，仅 child_process.spawn）
// 原则：所有 git 调用数组参数（绝不 shell 拼接）；永不执行写历史类命令
// （commit/amend/reset/rebase/force-push 在本包禁止，唯一的 commit 发生在数据仓库 store.ts）

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { CommitInfo, DiffStat, BranchAlignmentItem, BranchAlignmentResult } from '@bxverse/shared'
import { classifyCommit } from './changelog'
import { CoreError, CORE_ERROR_CODES } from './errors'
import type { CoreErrorCode } from './errors'

export type GitResult =
  | { ok: true; stdout: string; stderr: string }
  | { ok: false; code: number | string; stderr: string }

function mapGitCodeToCoreError(code: number | string, _stderr: string): CoreErrorCode {
  const s = String(code)
  if (s === 'TIMEOUT') return CORE_ERROR_CODES.GIT_TIMEOUT
  if (s === 'TAG_CONFLICT') return CORE_ERROR_CODES.TAG_CONFLICT
  if (s === 'TAG_EXISTS_DIFFERENT') return CORE_ERROR_CODES.TAG_EXISTS_DIFFERENT
  if (s === 'EMPTY_REPO') return CORE_ERROR_CODES.REPO_NOT_FOUND
  if (s === 'BASE_UNREACHABLE') return CORE_ERROR_CODES.BASE_UNREACHABLE
  if (s === 'NO_REMOTE') return CORE_ERROR_CODES.VALIDATION
  if (s === 'BAD_URL') return CORE_ERROR_CODES.VALIDATION
  if (s === 'TARGET_EXISTS') return CORE_ERROR_CODES.VALIDATION
  if (s === 'PATH_OUT_OF_REPO') return CORE_ERROR_CODES.VALIDATION
  if (s === 'EMPTY_SUBJECT' || s === 'BAD_SUBJECT' || s === 'BAD_BRANCH' || s === 'BAD_TAG') return CORE_ERROR_CODES.VALIDATION
  if (s === 'BUFFER' || s === 'SPAWN') return CORE_ERROR_CODES.GIT_FAILED
  // 数字退出码统一归为 GIT_FAILED（可通过 detail.gitCode 区分）
  return CORE_ERROR_CODES.GIT_FAILED
}

export class GitError extends CoreError {
  gitCode: number | string
  stderr: string
  constructor(code: number | string, stderr: string) {
    const mapped = mapGitCodeToCoreError(code, stderr)
    const first = stderr.split('\n')[0] || `git 执行失败（code=${code}）`
    super(mapped, `[${code}] ${first}`, { gitCode: code, stderr })
    this.name = 'GitError'
    this.gitCode = code
    this.stderr = stderr
  }
}

const MAX_BUFFER = 50 * 1024 * 1024

/** 私有：跨平台进程树终止（Windows 递归杀树，POSIX 单进程 SIGKILL） */
function killTree(pid: number | undefined): void {
  if (pid == null) return
  if (process.platform === 'win32') {
    try {
      const killer = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      })
      killer.on('error', () => {})
    } catch {}
  } else {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {}
  }
}

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
      killTree(child.pid)
    }, timeoutMs)
    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString('utf8')
      if (stdout.length > MAX_BUFFER) {
        overLimit = true
        killTree(child.pid)
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

/** 成功则返回 stdout，失败抛 CoreError（GitError 子类，携带 code） */
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
      killTree(child.pid)
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

// ========================================================================
// R22 仓库内 Git 面板辅助（status / diff / 暂存 / 提交 / 推送 / 拉取）
// 严格：仅操作由调用方传入的仓库目录（resolveRepoDir 校验根）
// 提交信息允许由 UI 传入（subject + body），但绝不进入 git commit --amend / --reset / --force / pull --rebase 的危险分支
// ========================================================================

/** 校验路径在仓库根内（防 ../ 穿越；返回归一后的绝对路径） */
export function resolveRepoPath(repoDir: string, relativeOrAbs: string): string {
  const repoNorm = path.resolve(repoDir)
  const target = path.resolve(repoNorm, relativeOrAbs)
  // 必须落在 repoDir 之内
  if (target !== repoNorm && !target.startsWith(repoNorm + path.sep) && !target.startsWith(repoNorm + '/')) {
    throw new GitError('PATH_OUT_OF_REPO', `路径越界：${relativeOrAbs}`)
  }
  return target
}

/** git status --porcelain=v1 -z 解析（避免文件名含特殊字符） */
export function parsePorcelain(output: string): { index: string; work: string; path: string }[] {
  const out: { index: string; work: string; path: string }[] = []
  // 按 \0 分块；renames/copies 后续如需扩展（'R '/'C ' 后接 origin -> path）这里忽略
  const chunks = output.split('\0').filter(c => c.length > 0 && c !== '\n')
  for (const c of chunks) {
    if (c.length < 3) continue
    const index = c[0]
    const work = c[1]
    const p = c.slice(3)
    out.push({ index, work, path: p })
  }
  return out
}

/** ahead/behind 解析 `1\t2`（去 origin 前缀） */
function parseAheadBehind(s: string): { ahead: number; behind: number } {
  const t = s.trim()
  if (!t) return { ahead: 0, behind: 0 }
  const [a, b] = t.split('\t').map(x => parseInt(x, 10) || 0)
  return { ahead: a ?? 0, behind: b ?? 0 }
}

/** 单仓库 Git 状态（branch / ahead-behind / 全部变化文件） */
export type GitStatusFileEntry = {
  indexStatus: string
  workStatus: string
  path: string
  staged: boolean
  untracked: boolean
}

export type GitStatusResult = {
  branch: string
  head: string
  hasRemote: boolean
  remoteUrl: string
  ahead: number
  behind: number
  files: GitStatusFileEntry[]
}

export async function gitStatus(repoDir: string): Promise<GitStatusResult> {
  const branchRes = await git(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoDir })
  // detached HEAD 返回 'HEAD'，不视为分支
  const branch = branchRes.ok ? branchRes.stdout.trim() : 'HEAD'
  const headRes = await git(['rev-parse', '--short', 'HEAD'], { cwd: repoDir })
  const head = headRes.ok ? headRes.stdout.trim() : ''
  const remoteUrl = await (async () => {
    const r = await git(['remote', 'get-url', 'origin'], { cwd: repoDir })
    return r.ok ? r.stdout.trim() : ''
  })()
  const hasRemote = !!remoteUrl
  let ahead = 0, behind = 0
  if (hasRemote) {
    const br = branch && branch !== 'HEAD' ? branch : 'HEAD'
    const ab = await git(['rev-list', '--left-right', '--count', `origin/${br}...HEAD`], { cwd: repoDir })
    if (ab.ok) ({ ahead, behind } = parseAheadBehind(ab.stdout))
  }
  const st = await git(['status', '--porcelain=v1', '-z', '--untracked-files=normal'], { cwd: repoDir })
  if (!st.ok) throw new GitError(st.code, st.stderr)
  const files: GitStatusFileEntry[] = parsePorcelain(st.stdout).map(r => {
    const untracked = r.index === '?' && r.work === '?'
    const staged = !untracked && r.index !== ' ' && r.index !== '?'
    return { indexStatus: r.index, workStatus: r.work, path: r.path, staged, untracked }
  })
  return { branch, head, hasRemote, remoteUrl, ahead, behind, files }
}

export async function gitFileDiff(repoDir: string, filePath: string, range: 'staged' | 'unstaged' | 'untracked', opts: { maxBytes?: number } = {}): Promise<{ patch: string; truncated: boolean }> {
  const maxBytes = opts.maxBytes ?? 200_000
  if (range === 'untracked') {
    // 未追踪文件：cat 全文（限制大小，无则空）
    const abs = resolveRepoPath(repoDir, filePath)
    if (!fs.existsSync(abs)) return { patch: '', truncated: false }
    const stat = fs.statSync(abs)
    if (stat.size > maxBytes) {
      const buf = Buffer.alloc(maxBytes)
      const fd = fs.openSync(abs, 'r')
      try { fs.readSync(fd, buf, 0, maxBytes, 0) } finally { fs.closeSync(fd) }
      return { patch: buf.toString('utf8') + '\n... (truncated)', truncated: true }
    }
    return { patch: fs.readFileSync(abs, 'utf8'), truncated: false }
  }
  const args = ['diff', '--no-color', '--no-ext-diff']
  if (range === 'staged') args.push('--cached')
  args.push('--', filePath)
  const r = await git(args, { cwd: repoDir })
  if (!r.ok) throw new GitError(r.code, r.stderr)
  let out = r.stdout
  let truncated = false
  if (out.length > maxBytes) {
    out = out.slice(0, maxBytes) + '\n... (truncated)'
    truncated = true
  }
  return { patch: out, truncated }
}

/** 暂存指定路径（all 暂存所有） */
export async function gitAdd(repoDir: string, paths: string[] | 'all'): Promise<void> {
  const args = ['add']
  if (paths === 'all') {
    args.push('-A')
  } else {
    for (const p of paths) resolveRepoPath(repoDir, p) // 校验
    args.push('--', ...paths)
  }
  ensureOk(await git(args, { cwd: repoDir }))
}

/** 撤销暂存 */
export async function gitReset(repoDir: string, paths: string[] | 'all'): Promise<void> {
  const args = ['reset', 'HEAD', '--']
  if (paths === 'all') {
    args.pop() // reset HEAD 不带 -- 即可重置全部索引
    args.pop()
  } else {
    for (const p of paths) resolveRepoPath(repoDir, p)
    args.push(...paths)
  }
  ensureOk(await git(args, { cwd: repoDir }))
}

/** 提交（subject + body；--no-verify 跳过 hook；--allow-empty 允许空提交） */
export async function gitCommit(repoDir: string, opts: { subject: string; body?: string; allowEmpty?: boolean }): Promise<{ hash: string }> {
  const subject = opts.subject.trim()
  if (!subject) throw new GitError('EMPTY_SUBJECT', '提交标题不能为空')
  // subject 单行校验（block newline subject，避免钓鱼）
  if (/[\r\n]/.test(subject)) throw new GitError('BAD_SUBJECT', '提交标题不能包含换行')
  const args = ['commit', '-m', subject]
  if (opts.body && opts.body.trim()) {
    args.push('-m', opts.body.replace(/\r\n/g, '\n'))
  }
  if (opts.allowEmpty) args.push('--allow-empty')
  ensureOk(await git(args, { cwd: repoDir }))
  const h = await git(['rev-parse', '--short', 'HEAD'], { cwd: repoDir })
  return { hash: h.ok ? h.stdout.trim() : '' }
}

/** push 到 origin（无远端给出可读错误） */
export async function gitPush(repoDir: string): Promise<{ output: string }> {
  const r = await git(['push', 'origin'], { cwd: repoDir, timeoutMs: 120_000 })
  if (!r.ok) throw new GitError(r.code, r.stderr)
  return { output: (r.stdout + r.stderr).trim() }
}

/** pull --ff-only（拒绝非快进，由人手动 rebase/merge） */
export async function gitPull(repoDir: string): Promise<{ output: string }> {
  const r = await git(['pull', '--ff-only'], { cwd: repoDir, timeoutMs: 180_000 })
  if (!r.ok) throw new GitError(r.code, r.stderr)
  return { output: (r.stdout + r.stderr).trim() }
}

/** 切换分支 (安全 checkout) */
export async function checkoutBranch(repoDir: string, branch: string): Promise<void> {
  const target = branch.trim()
  if (!target) throw new GitError('BAD_BRANCH', '分支名不能为空')
  ensureOk(await git(['checkout', target], { cwd: repoDir }))
}

/** 安全删除 Tag（本地与可选远程） */
export async function deleteTag(repoDir: string, tag: string, opts: { remote?: boolean } = {}): Promise<void> {
  const targetTag = tag.trim()
  if (!targetTag) throw new GitError('BAD_TAG', '标签名不能为空')
  // 1. 删除本地标签
  await git(['tag', '-d', targetTag], { cwd: repoDir })
  // 2. 若配置删除远程标签且存在 remote
  if (opts.remote) {
    const hasRem = await hasRemote(repoDir, 'origin')
    if (hasRem) {
      await git(['push', 'origin', '--delete', targetTag], { cwd: repoDir, timeoutMs: 30_000 })
    }
  }
}

/** 多工程分支协同巡检：检测各仓库是否停留在期望的主发布分支 */
export async function inspectBranchAlignment(
  repos: { repoId: string; repoName: string; path: string }[],
  targetDefaultBranch = 'master',
): Promise<BranchAlignmentResult> {
  const items: BranchAlignmentItem[] = []
  let isAllAligned = true
  for (const r of repos) {
    let branch = 'HEAD'
    let headSh = ''
    try {
      branch = await currentBranch(r.path)
      headSh = await head(r.path)
    } catch {
      // ignore
    }
    const isAligned = branch === targetDefaultBranch || branch === 'main' || branch === 'master'
    if (!isAligned) isAllAligned = false
    items.push({
      repoId: r.repoId,
      repoName: r.repoName,
      branch,
      head: headSh.slice(0, 7),
      isAligned,
      defaultBranch: targetDefaultBranch,
    })
  }
  return { isAllAligned, defaultBranch: targetDefaultBranch, items }
}
