// packages/shared/src/types.ts
// 全局共享类型：项目 / 仓库 / 发布记录 / 应用配置 / API 类型

// ==================== 版本 ====================
export type BumpType = 'major' | 'minor' | 'patch'

// ==================== 提交与日志 ====================
export type CommitType =
  | 'feat' | 'fix' | 'perf' | 'refactor' | 'style'
  | 'chore' | 'docs' | 'test' | 'build' | 'ci' | 'revert' | 'other'

export type LogState = 'auto' | 'edited' | 'confirmed'

export interface CommitInfo {
  /** 短 hash */
  hash: string
  /** 完整 hash */
  fullHash: string
  author: string
  /** YYYY-MM-DD */
  date: string
  subject: string
  type: CommitType
  scope: string | null
  breaking: boolean
  files: string[]
}

export interface DiffStat {
  filesChanged: number
  insertions: number
  deletions: number
}

export interface Stats {
  commits: number
  filesChanged: number
  insertions: number
  deletions: number
  byType: Record<CommitType, number>
}

export interface ReleaseLog {
  state: LogState
  content: string
  /** 自动生成的原始草稿（供「草稿 vs 定稿」对比） */
  autoDraft: string
}

// ==================== 领域模型 ====================
export interface RepoDef {
  id: string
  name: string
  /** 本地绝对路径 */
  path: string
  /** origin 远程地址 */
  remote?: string
  /** 发版前执行的构建命令 */
  buildCommand?: string
  /** version.json 输出目录（相对仓库根，默认 public） */
  outputDir?: string
  /** 是否在业务仓库内写 version.json / version-history（默认 true，零侵入可关） */
  writeVersionFile?: boolean
  /** 上次统一发布时的 commit（变更检测基准） */
  lastPublishCommit?: string | null
  createdAt?: string
}

export interface ProjectDef {
  id: string
  name: string
  description?: string
  /** 当前统一版本 vX.Y.Z */
  version: string
  /** bump 建议来源：auto=按提交语义推断，manual=默认 patch */
  bump: 'auto' | 'manual'
  /** 仓库版本号方案：hybrid=vX.Y.Z.YYMMDDHH（默认）/ timestamp=vYYMMDDHH */
  repoVersionScheme: 'hybrid' | 'timestamp'
  /** 对外日志排除的提交类型 */
  externalExclude: CommitType[]
  repos: RepoDef[]
  createdAt?: string
  updatedAt?: string
}

export interface AppConfig {
  port: number
  host: string
  theme: 'light' | 'dark' | 'system'
  pwa: { enabled: boolean }
  dataDir: string
  pollInterval: number
  ai: {
    enabled: boolean
    baseUrl: string
    model: string
    apiKey: string
  }
  projects: ProjectDef[]
}

// ==================== 发布记录 ====================
export interface RepoReleaseRef {
  repoId: string
  repoName: string
  version: string
  commits: CommitInfo[]
}

export interface ReleaseRecord {
  id: string
  kind: 'project' | 'repo'
  scopeId: string
  scopeName: string
  version: string
  baseVersion: string
  buildStamp: string
  bump: BumpType
  date: string
  from?: string | null
  to?: string
  commits: CommitInfo[]
  stats: Stats
  logs: {
    internal: ReleaseLog
    external: ReleaseLog
  }
  /** 项目级记录：聚合的各仓库发布信息 */
  repos?: RepoReleaseRef[]
  tags: { build?: string; milestone?: string }
  pushed: boolean
  builtBy: string
}

// ==================== 发布计划 / 任务 ====================
export interface PlannedRepo {
  repoId: string
  name: string
  changed: boolean
  version: string
  from?: string | null
  to?: string
  commits: CommitInfo[]
  buildCommand?: string
}

export interface PublishPlan {
  projectId: string
  projectName: string
  projectVersion: string
  buildStamp: string
  bump: BumpType
  suggestedBump: BumpType
  changed: PlannedRepo[]
  /** 未变动、仅同步基版 version.json 的仓库 */
  syncedOnly: PlannedRepo[]
  milestoneTag: string
  tags: { repoId: string; name: string; tag: string }[]
  /** 项目级对外日志自动草稿 */
  externalDraft: string
  /** 项目级对内日志自动草稿 */
  internalDraft: string
  warnings: string[]
}

export interface PublishRequest {
  projectId: string
  bump: BumpType | 'auto'
  /** 不传 = 自动选择有变动的仓库 */
  repoIds?: string[]
  skipBuild?: boolean
  offline?: boolean
  dryRun?: boolean
  /** 向导中人工编辑后的项目对外日志（覆盖自动草稿） */
  externalContent?: string
  /** 向导中人工编辑后的项目对内日志 */
  internalContent?: string
}

export interface PublishEvent {
  type: 'log' | 'step' | 'repo-start' | 'repo-done' | 'repo-error' | 'done' | 'error'
  message: string
  repoId?: string
  data?: unknown
}

// ==================== 状态 / 文件树 ====================
export interface RepoStatus {
  id: string
  name: string
  path: string
  branch: string
  head: string
  dirty: number
  hasRemote: boolean
  remoteUrl: string
  versionFile: {
    version: string
    build: string
    buildTime: string
  } | null
  buildTags: string[]
  milestoneTag: string | null
  /** 相对上次统一发布是否有变动 */
  changed: boolean
  lastPublishCommit: string | null
  commits: CommitInfo[]
}

export interface FileEntry {
  name: string
  type: 'dir' | 'file'
  size: number
}

export interface TreeNode {
  path: string
  entries: FileEntry[]
  truncated: boolean
}

export interface FileContent {
  path: string
  size: number
  binary: boolean
  truncated: boolean
  content: string
  lines: number
}

export interface OverviewData {
  projectCount: number
  repoCount: number
  changedRepoCount: number
  projects: {
    id: string
    name: string
    version: string
    repoCount: number
    changedRepoCount: number
    lastRelease: { version: string; date: string } | null
  }[]
  changedRepos: {
    projectId: string
    projectName: string
    repoId: string
    repoName: string
    head: string
    commits: number
  }[]
}

export interface CloneRequest {
  url: string
  name?: string
  shallow?: boolean
}
