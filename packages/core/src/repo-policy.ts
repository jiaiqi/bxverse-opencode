// 受管理仓库写入策略：默认写入 version.json（可关），R26 新增受控 package.json version 例外（白名单提交）。裁决 DOC2：以引擎实际行为为准。

import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { git, ensureOk } from './git'
import { atomicWrite } from './home'

export interface WorktreeStatus {
  tracked: number
  untracked: number
  ignored: number
  paths: string[]
}

export interface BuildWorkspace {
  path: string
  remove: () => Promise<void>
}

function packagePath(repoPath: string): string {
  return path.join(repoPath, 'package.json')
}

export function projectSemver(version: string): string {
  const value = version.trim().replace(/^v/i, '')
  if (!/^\d+\.\d+\.\d+$/.test(value)) throw new Error(`项目版本不是标准 SemVer: ${version}`)
  return value
}

export function readPackageVersion(repoPath: string): string | null {
  try {
    const raw = JSON.parse(fs.readFileSync(packagePath(repoPath), 'utf8')) as { version?: unknown }
    return typeof raw.version === 'string' ? raw.version : null
  } catch {
    return null
  }
}

/** 仅替换仓库根 package.json 的顶层 version，不自动提交。 */
export function updatePackageVersion(repoPath: string, projectVersion: string): { previous: string | null; next: string } {
  const file = packagePath(repoPath)
  if (!fs.existsSync(file)) throw new Error(`未找到仓库根 package.json: ${file}`)
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>
  } catch (error) {
    throw new Error(`package.json 不是合法 JSON: ${(error as Error).message}`)
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('package.json 顶层必须为对象')
  const next = projectSemver(projectVersion)
  const previous = typeof parsed.version === 'string' ? parsed.version : null
  if (previous === next) return { previous, next }
  parsed.version = next
  atomicWrite(file, `${JSON.stringify(parsed, null, 2)}\n`)
  return { previous, next }
}

export async function worktreeStatus(repoPath: string): Promise<WorktreeStatus> {
  const result = await git(['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignored=matching'], { cwd: repoPath })
  if (!result.ok) throw new Error(result.stderr || '无法读取工作树状态')
  const trackedPaths: string[] = []
  const untrackedPaths: string[] = []
  const ignoredPaths: string[] = []
  for (const entry of result.stdout.split('\0')) {
    if (!entry || entry.length < 3) continue
    const code = entry.slice(0, 2)
    const file = entry.slice(3)
    if (code === '!!') ignoredPaths.push(file)
    else if (code === '??') untrackedPaths.push(file)
    else trackedPaths.push(file)
  }
  return {
    tracked: trackedPaths.length,
    untracked: untrackedPaths.length,
    ignored: ignoredPaths.length,
    paths: [...trackedPaths, ...untrackedPaths, ...ignoredPaths],
  }
}

/** 当前差异是否仅为根 package.json 顶层 version。 */
export async function packageJsonVersionOnlyChanged(repoPath: string): Promise<boolean> {
  const status = await worktreeStatus(repoPath)
  if (status.tracked !== 1 || status.untracked !== 0 || status.ignored !== 0 || status.paths[0] !== 'package.json') return false
  const currentFile = packagePath(repoPath)
  try {
    const current = JSON.parse(fs.readFileSync(currentFile, 'utf8')) as Record<string, unknown>
    const headResult = await git(['show', 'HEAD:package.json'], { cwd: repoPath })
    if (!headResult.ok) return false
    const previous = JSON.parse(headResult.stdout) as Record<string, unknown>
    const { version: _currentVersion, ...currentRest } = current
    const { version: _previousVersion, ...previousRest } = previous
    return JSON.stringify(currentRest) === JSON.stringify(previousRest)
  } catch {
    return false
  }
}

export function fileHash(file: string): string {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

/** 在外部 tmp 中建立 detached worktree，构建完成后只移除外部目录。 */
export async function createBuildWorkspace(repoPath: string, commit: string, tmpRoot: string, taskId: string): Promise<BuildWorkspace> {
  const workspace = path.join(tmpRoot, 'build', taskId, path.basename(repoPath))
  fs.mkdirSync(path.dirname(workspace), { recursive: true })
  ensureOk(await git(['worktree', 'add', '--detach', workspace, commit], { cwd: repoPath }))
  return {
    path: workspace,
    remove: async () => {
      await git(['worktree', 'remove', '--force', workspace], { cwd: repoPath })
      try {
        fs.rmSync(path.dirname(workspace), { recursive: true, force: true })
      } catch {
        // 清理失败不触碰原业务仓库，交由运行日志报告。
      }
    },
  }
}

// ==================== R26 锁文件与包管理器探测 ====================
export type PackageManager = 'pnpm' | 'npm' | 'yarn' | 'bun'

const LOCK_FILES: Record<PackageManager, string> = {
  bun: 'bun.lockb',
  pnpm: 'pnpm-lock.yaml',
  npm: 'package-lock.json',
  yarn: 'yarn.lock',
}

/** 探测仓库包管理器（按锁文件优先级）；无锁文件返回 null */
export function detectPackageManager(repoPath: string): PackageManager | null {
  if (fs.existsSync(path.join(repoPath, LOCK_FILES.bun))) return 'bun'
  if (fs.existsSync(path.join(repoPath, LOCK_FILES.pnpm))) return 'pnpm'
  if (fs.existsSync(path.join(repoPath, LOCK_FILES.yarn))) return 'yarn'
  if (fs.existsSync(path.join(repoPath, LOCK_FILES.npm))) return 'npm'
  return null
}

/** 仓库工程化类型：有 package.json 为 nodejs；无则 static（原生 html/js/jquery 等，版本走派生模式，install/build 自动探测跳过） */
export type RepoKind = 'nodejs' | 'static'
export function detectRepoKind(repoPath: string): RepoKind {
  return fs.existsSync(packagePath(repoPath)) ? 'nodejs' : 'static'
}

/** 列出已存在的锁文件（相对仓库根路径） */
export function listLockFiles(repoPath: string): string[] {
  const out: string[] = []
  for (const pm of Object.keys(LOCK_FILES) as PackageManager[]) {
    const f = LOCK_FILES[pm]
    if (fs.existsSync(path.join(repoPath, f))) out.push(f)
  }
  return out
}

/** 按包管理器推导默认 frozen 安装命令；无匹配返回 null */
export function getDefaultInstallCommand(pm: PackageManager | null): string | null {
  switch (pm) {
    case 'pnpm': return 'pnpm install --frozen-lockfile'
    case 'npm': return 'npm ci'
    case 'yarn': return 'yarn install --frozen-lockfile'
    case 'bun': return 'bun install --frozen-lockfile'
    default: return null
  }
}

/** 解析安装命令：显式配置优先，'skip' 表示跳过，否则按探测推导 */
export function resolveInstallCommand(repoPath: string, explicit?: string, pmOverride?: PackageManager | null): string | null {
  if (explicit !== undefined) {
    const v = explicit.trim()
    if (v.toLowerCase() === 'skip' || v === '') return null
    return v
  }
  const pm = pmOverride ?? detectPackageManager(repoPath)
  return getDefaultInstallCommand(pm)
}

/**
 * 受控提交：仅提交 package.json + 已存在的锁文件。
 * 无变更 → { committed: false }；有变更 → commit 并返回新 hash。
 */
export async function commitVersionFiles(repoPath: string, message: string): Promise<{ committed: boolean; hash?: string }> {
  const candidates = ['package.json', ...listLockFiles(repoPath)]
  const existing = candidates.filter(f => fs.existsSync(path.join(repoPath, f)))
  if (existing.length === 0) return { committed: false }

  // 仅 add 白名单文件
  const addArgs = ['add', '--', ...existing]
  const addRes = await git(addArgs, { cwd: repoPath })
  if (!addRes.ok) throw new Error(addRes.stderr || 'git add 失败')

  const staged = await git(['diff', '--cached', '--name-only'], { cwd: repoPath })
  if (!staged.ok) throw new Error(staged.stderr || '无法读取暂存区')
  if (!staged.stdout.trim()) return { committed: false }

  const msg = message.trim() || 'chore(release): bump version'
  if (/[\r\n]/.test(msg.split('\n')[0] ?? '')) throw new Error('提交信息标题不能包含换行')
  const commitRes = await git(['commit', '-m', msg], { cwd: repoPath })
  if (!commitRes.ok) throw new Error(commitRes.stderr || 'git commit 失败')

  const headRes = await git(['rev-parse', '--short', 'HEAD'], { cwd: repoPath })
  return { committed: true, hash: headRes.ok ? headRes.stdout.trim() : undefined }
}

export function assertExternalPath(target: string, repoPaths: string[]): void {
  const resolved = path.resolve(target)
  for (const repoPath of repoPaths) {
    const root = path.resolve(repoPath)
    if (resolved === root || resolved.startsWith(root + path.sep)) {
      throw new Error(`外部目录不得位于受管理仓库内: ${target}`)
    }
  }
}
