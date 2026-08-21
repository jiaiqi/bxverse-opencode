// packages/core/src/store.ts
// 数据目录、app.json 配置、凭据、发布记录（DataStore）、数据仓库操作

import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { APP_DEFAULT_PORT } from '@bxverse/shared'
import type { AppConfig, ProjectDef, ReleaseRecord, RepoBackupRef } from '@bxverse/shared'
import { atomicWrite, ensureDirs, resolveHome } from './home'
import { ensureOk, git } from './git'

export { resolveHome }

const home = ensureDirs()

/** 家目录根（BX_HOME ?? ~/.bxverse） */
export const APP_DIR: string = home.root

export const DEFAULT_APP_CONFIG: AppConfig = {
  schemaVersion: 2,
  port: APP_DEFAULT_PORT,
  host: '127.0.0.1',
  theme: 'system',
  pwa: { enabled: true },
  dataDir: home.dataDir,
  pollInterval: 30_000,
  ai: { enabled: false, baseUrl: '', model: '', apiKey: '' },
  backup: { enabled: true, source: 'both', onFailure: 'warn' },
  projects: [],
}

const APP_JSON = path.join(APP_DIR, 'app.json')
const CRED_JSON = path.join(APP_DIR, 'credentials.json')

function deepMergeDefault(raw: Partial<AppConfig>): AppConfig {
  return {
    ...DEFAULT_APP_CONFIG,
    ...raw,
    schemaVersion: (raw as Record<string, unknown>).schemaVersion != null ? Number((raw as Record<string, unknown>).schemaVersion) : DEFAULT_APP_CONFIG.schemaVersion,
    pwa: { ...DEFAULT_APP_CONFIG.pwa, ...(raw.pwa ?? {}) },
    ai: { ...DEFAULT_APP_CONFIG.ai, ...(raw.ai ?? {}) },
    backup: raw.backup ? { ...DEFAULT_APP_CONFIG.backup!, ...raw.backup, retention: raw.backup.retention ? { ...raw.backup.retention } : undefined } : DEFAULT_APP_CONFIG.backup,
    dataDir: raw.dataDir ?? DEFAULT_APP_CONFIG.dataDir,
  }
}

function projectsDirPath(): string {
  return resolveHome().projectsDir
}

function readProjectsFromDir(): ProjectDef[] | null {
  const dir = projectsDirPath()
  if (!fs.existsSync(dir)) return null
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'))
  if (files.length === 0) return null
  const out: ProjectDef[] = []
  for (const f of files) {
    try {
      const p = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as ProjectDef
      if (p?.id) out.push(p)
    } catch { /* 跳过损坏文件 */ }
  }
  return out
}

function writeProjectToDir(p: ProjectDef): void {
  const dir = projectsDirPath()
  fs.mkdirSync(dir, { recursive: true })
  atomicWrite(path.join(dir, `${p.id}.json`), JSON.stringify(p, null, 2))
}

/** 读取 app.json；缺失时写默认值；深合并新字段兜底；按需迁移 projects/ 目录 */
export async function loadAppConfig(): Promise<AppConfig> {
  if (!fs.existsSync(APP_JSON)) {
    const cfg: AppConfig = { ...DEFAULT_APP_CONFIG, projects: [] }
    atomicWrite(APP_JSON, JSON.stringify(cfg, null, 2))
    return cfg
  }
  let raw: unknown
  try {
    raw = JSON.parse(fs.readFileSync(APP_JSON, 'utf8'))
  } catch (e) {
    throw new Error(`无法解析 app.json: ${(e as Error).message}`)
  }
  const cfg = deepMergeDefault(raw as Partial<AppConfig>)
  // 迁移：旧版 app.json 内嵌 projects → projects/ 目录（幂等）
  const dirProjects = readProjectsFromDir()
  if (dirProjects) {
    cfg.projects = dirProjects
    // 同步 schemaVersion
    if ((raw as Record<string, unknown>).schemaVersion == null) {
      cfg.schemaVersion = 2
      // 尽力写回，避免下次重复迁移
      try { atomicWrite(APP_JSON, JSON.stringify({ ...raw as object, schemaVersion: 2 }, null, 2)) } catch { /* best-effort */ }
    }
  } else if (cfg.projects.length > 0) {
    // 首次拆分：把内存中的 projects 落盘
    for (const p of cfg.projects) {
      try { writeProjectToDir(p) } catch { /* best-effort */ }
    }
    if ((raw as Record<string, unknown>).schemaVersion == null) {
      try { atomicWrite(APP_JSON, JSON.stringify({ ...(raw as object), schemaVersion: 2 }, null, 2)) } catch { /* best-effort */ }
      cfg.schemaVersion = 2
    }
  }
  return cfg
}

export async function saveAppConfig(cfg: AppConfig): Promise<void> {
  atomicWrite(APP_JSON, JSON.stringify(cfg, null, 2))
  // 同步 projects/ 目录（P0-3 拆分后权威源，保持与 app.json 一致）
  try {
    const dir = projectsDirPath()
    fs.mkdirSync(dir, { recursive: true })
    const wanted = new Set(cfg.projects.map(p => `${p.id}.json`))
    for (const p of cfg.projects) {
      try { writeProjectToDir(p) } catch { /* best-effort */ }
    }
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue
      if (!wanted.has(f)) {
        try { fs.rmSync(path.join(dir, f), { force: true }) } catch { /* best-effort */ }
      }
    }
  } catch { /* best-effort，目录同步失败不影响主流程 */ }
}

// ==================== 凭据 ====================

export interface Credentials {
  token: string
  dataRemote?: string | null
  /** 扩展：R21 AI 供应商 API key（write-only，API 与 UI 永不回显明文） */
  aiKeys?: Record<string, string>
}

export function generateToken(): string {
  return randomBytes(32).toString('hex')
}

export async function loadCredentials(): Promise<Credentials> {
  if (!fs.existsSync(CRED_JSON)) {
    const cred: Credentials = { token: generateToken(), dataRemote: null }
    await saveCredentials(cred)
    return cred
  }
  const cred = JSON.parse(fs.readFileSync(CRED_JSON, 'utf8')) as Credentials
  return { token: cred.token ?? '', dataRemote: cred.dataRemote ?? null, aiKeys: cred.aiKeys ?? {} }
}

export async function saveCredentials(cred: Credentials): Promise<void> {
  atomicWrite(CRED_JSON, JSON.stringify(cred, null, 2), 0o600)
  try {
    fs.chmodSync(CRED_JSON, 0o600)
  } catch {
    // Windows 下 chmod 无效，尽力而为
  }
}

/** 恒时比较（防时序攻击） */
export function tokenMatches(a: string, b: string): boolean {
  const ha = createHash('sha256').update(String(a)).digest()
  const hb = createHash('sha256').update(String(b)).digest()
  return timingSafeEqual(ha, hb)
}

// ==================== 版本安全名 ====================

/** releases 目录安全名：version.replace(/[<>:"/\\|?*\s]/g, '_') */
export function versionSafe(version: string): string {
  return version.replace(/[<>:"/\\|?*\s]/g, '_')
}

// ==================== 同步结果 ====================

export type SyncResult = { action: string; ok: boolean; message?: string; warning?: string } & Record<string, unknown>

// ==================== 数据仓库 ====================

export class DataStore {
  readonly dataDir: string
  readonly homeDir: string

  constructor(opts: { home?: string; dataDir?: string } = {}) {
    const h = resolveHome(opts.home)
    this.homeDir = h.root
    this.dataDir = opts.dataDir ?? h.dataDir
  }

  /** 确保数据仓库：git init + .gitignore + 首次 commit + 按需配置 origin + pull --ff-only */
  async ensureDataRepo(): Promise<void> {
    fs.mkdirSync(this.dataDir, { recursive: true })
    const gitDir = path.join(this.dataDir, '.git')
    if (!fs.existsSync(gitDir)) {
      fs.writeFileSync(path.join(this.dataDir, '.gitignore'), '*.tmp-*\n')
      ensureOk(await git(['init', '-b', 'master'], { cwd: this.dataDir }))
      ensureOk(await git(['add', '-A'], { cwd: this.dataDir }))
      ensureOk(await git(['commit', '-m', 'chore: init bxverse data repo'], { cwd: this.dataDir }))
    }
    const cred = await loadCredentials()
    const hasOrigin = (await git(['remote', 'get-url', 'origin'], { cwd: this.dataDir })).ok
    if (!hasOrigin && cred.dataRemote) {
      ensureOk(await git(['remote', 'add', 'origin', cred.dataRemote], { cwd: this.dataDir }))
    }
    if (hasOrigin || cred.dataRemote) {
      const r = await git(['pull', '--ff-only'], { cwd: this.dataDir, timeoutMs: 60_000 })
      if (!r.ok) {
        // 失败仅警告（保留本地），不阻断
        console.warn(`[bxverse] 数据仓库 pull 失败: ${r.stderr.split('\n')[0]}`)
      }
    }
  }

  // ---------- app.json 内嵌 projects CRUD（原子写） ----------

  async listProjects(): Promise<ProjectDef[]> {
    return (await loadAppConfig()).projects
  }

  async getProject(id: string): Promise<ProjectDef | undefined> {
    return (await this.listProjects()).find(p => p.id === id)
  }

  async saveProject(p: ProjectDef): Promise<void> {
    const cfg = await loadAppConfig()
    const idx = cfg.projects.findIndex(x => x.id === p.id)
    const stamped = { ...p, updatedAt: new Date().toISOString() }
    if (idx === -1) cfg.projects.push(stamped)
    else cfg.projects[idx] = stamped
    await saveAppConfig(cfg)
    try { writeProjectToDir(stamped) } catch { /* best-effort */ }
  }

  async deleteProject(id: string): Promise<void> {
    const cfg = await loadAppConfig()
    cfg.projects = cfg.projects.filter(p => p.id !== id)
    await saveAppConfig(cfg)
    try { fs.rmSync(path.join(projectsDirPath(), `${id}.json`), { force: true }) } catch { /* best-effort */ }
  }

  // ---------- 发布记录（数据仓库） ----------

  nextReleaseId(kind: 'project' | 'repo', scopeId: string, version: string): string {
    return `rel_${kind === 'project' ? 'p' : 'r'}_${scopeId}_${versionSafe(version)}`
  }

  /**
   * 落盘发布记录（不可变）：
   * 写 internal.md → external.md → data.json（最后，作为「落盘完成」判据）→ 重建两级索引。
   * 目标 data.json 已存在且内容一致 → 幂等跳过；不一致 → 抛错。
   */
  async writeRecord(record: ReleaseRecord): Promise<void> {
    const dir = path.join(this.dataDir, 'releases', record.scopeId, versionSafe(record.version))
    const dataPath = path.join(dir, 'data.json')
    const incoming = JSON.stringify(record, null, 2)
    if (fs.existsSync(dataPath)) {
      const existing = fs.readFileSync(dataPath, 'utf8')
      if (existing === incoming) return
      throw new Error(`发布记录已存在且内容不一致（不可变）: ${dataPath}`)
    }
    fs.mkdirSync(dir, { recursive: true })
    atomicWrite(path.join(dir, 'internal.md'), record.logs.internal.content)
    atomicWrite(path.join(dir, 'external.md'), record.logs.external.content)
    atomicWrite(dataPath, incoming)
    await this.rebuildScopeIndex(record.scopeId)
    await this.rebuildGlobalIndex()
  }

  /** 按 id 扫描读取（解析 id 不可靠，直接匹配 data.json 的 id 字段） */
  async readRecord(id: string): Promise<ReleaseRecord | null> {
    const found = (await this.listRecordFiles()).find(({ record }) => record.id === id)
    return found?.record ?? null
  }

  /**
   * 更新已落盘记录（日志人工编辑的唯一通道，api.md §7.3）：
   * 重写 data.json + 同步 md 副本；id/version 不可变（写入前校验）。
   */
  async updateRecord(record: ReleaseRecord): Promise<void> {
    const existing = await this.readRecord(record.id)
    if (!existing) throw new Error(`发布记录不存在: ${record.id}`)
    if (existing.version !== record.version || existing.scopeId !== record.scopeId) {
      throw new Error(`发布记录不可变字段被改动（id/version/scopeId）: ${record.id}`)
    }
    const dir = path.join(this.dataDir, 'releases', record.scopeId, versionSafe(record.version))
    const dataPath = path.join(dir, 'data.json')
    if (!fs.existsSync(dataPath)) throw new Error(`发布记录数据文件缺失: ${dataPath}`)
    atomicWrite(path.join(dir, 'internal.md'), record.logs.internal.content)
    atomicWrite(path.join(dir, 'external.md'), record.logs.external.content)
    atomicWrite(dataPath, JSON.stringify(record, null, 2))
  }

  /** 标记发布记录为已废弃（存入 Git 审计仓库） */
  async deprecateRecord(releaseId: string, reason: string): Promise<ReleaseRecord> {
    const existing = await this.readRecord(releaseId)
    if (!existing) throw new Error(`发布记录不存在: ${releaseId}`)
    existing.deprecated = true
    existing.deprecateReason = reason.trim() || '人为标为废弃'
    existing.deprecatedAt = new Date().toISOString()
    await this.updateRecord(existing)
    await this.commitRecords(`audit(release): deprecate ${existing.version}: ${existing.deprecateReason}`)
    return existing
  }

  /** scope 发布历史（倒序），n 默认 20、上限 100 */
  async listRecords(scopeId: string, n = 20): Promise<ReleaseRecord[]> {
    const items = await this.listRecordFiles(scopeId)
    return items
      .sort((a, b) => b.record.date.localeCompare(a.record.date))
      .slice(0, Math.min(Math.max(n, 1), 100))
      .map(x => x.record)
  }

  /** data/ 内 git add -A + commit；无变更返回 ''（不产生空提交） */
  async commitRecords(message: string): Promise<string> {
    const status = await git(['status', '--porcelain'], { cwd: this.dataDir })
    if (!status.ok || !status.stdout.trim()) return ''
    ensureOk(await git(['add', '-A'], { cwd: this.dataDir }))
    ensureOk(await git(['commit', '-m', message], { cwd: this.dataDir }))
    const rev = await git(['rev-parse', '--short', 'HEAD'], { cwd: this.dataDir })
    return (rev.ok ? rev.stdout : '').trim()
  }

  /** 数据仓库同步：pull / push / commit / status */
  async syncDataRepo(action: 'pull' | 'push' | 'commit' | 'status'): Promise<SyncResult> {
    const hasOrigin = (await git(['remote', 'get-url', 'origin'], { cwd: this.dataDir })).ok
    if (action === 'status') {
      if (!hasOrigin) return { action, ok: true, remote: false, message: '未配置远程' }
      const branchR = await git(['branch', '--show-current'], { cwd: this.dataDir })
      const branch = (branchR.ok ? branchR.stdout : '').trim() || 'master'
      const aheadR = await git(['rev-list', '--count', `origin/${branch}..HEAD`], { cwd: this.dataDir })
      const behindR = await git(['rev-list', '--count', `HEAD..origin/${branch}`], { cwd: this.dataDir })
      const ahead = Number(((aheadR.ok ? aheadR.stdout : '') || '0').trim())
      const behind = Number(((behindR.ok ? behindR.stdout : '') || '0').trim())
      return { action, ok: true, remote: true, ahead, behind, branch }
    }
    if (action === 'commit') {
      const hash = await this.commitRecords('chore: manual commit')
      return { action, ok: true, hash }
    }
    if (!hasOrigin) return { action, ok: false, message: '未配置远程 origin' }
    if (action === 'pull') {
      const r = await git(['pull', '--ff-only'], { cwd: this.dataDir, timeoutMs: 60_000 })
      if (r.ok) return { action, ok: true }
      return { action, ok: false, message: r.stderr.split('\n')[0] }
    }
    const r = await git(['push', 'origin', 'HEAD'], { cwd: this.dataDir, timeoutMs: 60_000 })
    if (r.ok) return { action, ok: true }
    return { action, ok: false, message: r.stderr.split('\n')[0] }
  }

  // ---------- 备份元数据（R19/M6：data/backups/ 进 git 审计，大文件在 backups/） ----------

  private backupMetaDir(): string {
    return path.join(this.dataDir, 'backups')
  }

  private backupMetaPath(releaseId: string, repoId: string): string {
    return path.join(this.backupMetaDir(), `${releaseId}-${repoId}.json`)
  }

  /** 落盘备份元数据（幂等覆盖，随发布记录一并 commit 入数据仓库） */
  async writeBackupMeta(ref: RepoBackupRef): Promise<void> {
    fs.mkdirSync(this.backupMetaDir(), { recursive: true })
    atomicWrite(this.backupMetaPath(ref.releaseId, ref.repoId), JSON.stringify(ref, null, 2))
  }

  async readBackupMeta(releaseId: string, repoId: string): Promise<RepoBackupRef | null> {
    try {
      const raw = JSON.parse(fs.readFileSync(this.backupMetaPath(releaseId, repoId), 'utf8')) as RepoBackupRef
      return raw.repoId === repoId ? raw : null
    } catch {
      return null
    }
  }

  /** 全部备份元数据（倒序按日期） */
  async listBackupMeta(): Promise<RepoBackupRef[]> {
    const dir = this.backupMetaDir()
    if (!fs.existsSync(dir)) return []
    const out: RepoBackupRef[] = []
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue
      try {
        out.push(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as RepoBackupRef)
      } catch {
        // 跳过损坏元数据
      }
    }
    return out.sort((a, b) => b.date.localeCompare(a.date))
  }

  async deleteBackupMeta(releaseId: string, repoId: string): Promise<void> {
    try {
      fs.rmSync(this.backupMetaPath(releaseId, repoId), { force: true })
    } catch {
      // 不存在视为已删除
    }
  }

  // ---------- 内部：记录扫描与索引重建 ----------

  private async listRecordFiles(scopeId?: string): Promise<{ record: ReleaseRecord; dir: string }[]> {
    const root = path.join(this.dataDir, 'releases')
    const out: { record: ReleaseRecord; dir: string }[] = []
    if (!fs.existsSync(root)) return out
    const scopes = scopeId ? [scopeId] : fs.readdirSync(root)
    for (const scope of scopes) {
      const scopeDir = path.join(root, scope)
      let isDir = false
      try {
        isDir = fs.statSync(scopeDir).isDirectory()
      } catch {
        continue
      }
      if (!isDir) continue
      for (const vd of fs.readdirSync(scopeDir)) {
        const dataPath = path.join(scopeDir, vd, 'data.json')
        if (!fs.existsSync(dataPath)) continue
        try {
          const record = JSON.parse(fs.readFileSync(dataPath, 'utf8')) as ReleaseRecord
          out.push({ record, dir: path.join(scopeDir, vd) })
        } catch {
          // 跳过损坏记录（启动自愈由重建索引承担）
        }
      }
    }
    return out
  }

  private async rebuildScopeIndex(scopeId: string): Promise<void> {
    const items = (await this.listRecordFiles(scopeId))
      .sort((a, b) => b.record.date.localeCompare(a.record.date))
      .map(({ record }) => ({
        id: record.id,
        kind: record.kind,
        version: record.version,
        buildStamp: record.buildStamp,
        date: record.date,
      }))
    atomicWrite(
      path.join(this.dataDir, 'releases', scopeId, 'index.json'),
      JSON.stringify({ schemaVersion: 1, scopeId, releases: items }, null, 2),
    )
  }

  private async rebuildGlobalIndex(): Promise<void> {
    const items = (await this.listRecordFiles())
      .sort((a, b) => b.record.date.localeCompare(a.record.date))
      .map(({ record }) => ({
        id: record.id,
        kind: record.kind,
        scopeId: record.scopeId,
        version: record.version,
        date: record.date,
      }))
    atomicWrite(path.join(this.dataDir, 'index.json'), JSON.stringify({ schemaVersion: 1, releases: items }, null, 2))
  }
}
