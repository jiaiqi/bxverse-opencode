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
  /** 中文名（可选，展示与导出用；缺省时展示 name） */
  displayName?: string
  /** 本地绝对路径 */
  path: string
  /** origin 远程地址 */
  remote?: string
  /** 发版前执行的构建命令 */
  buildCommand?: string
  /** version.json 输出目录（相对仓库根，默认 public） */
  outputDir?: string
  /** 是否在业务仓库内写 version.json / version-history.json（默认 true，零侵入可关） */
  writeVersionFile?: boolean
  /** 扩展：R19 产物备份目录（相对仓库根；未配置则发布时跳过产物备份并提示） */
  artifactDir?: string
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
  /** 扩展：R20 主题风格（indigo=默认靛蓝套件，含亮/暗/system；wenxi=深色玻璃拟态套件，仅深色） */
  themeStyle?: 'indigo' | 'wenxi'
  pwa: { enabled: boolean }
  dataDir: string
  pollInterval: number
  ai: {
    enabled: boolean
    baseUrl: string
    model: string
    apiKey: string
    /** 扩展：AI 多供应商（R21）。baseUrl/model/apiKey 为兼容旧字段——读取时自动迁移为默认 provider。 */
    providers?: AiProvider[]
    activeProviderId?: string
    /** 扩展：R23 场景特化模型路由（commit 极速/polish 润色/explain 深度推理分流） */
    routes?: {
      commit?: string
      polish?: string
      explain?: string
    }
  }
  /** 扩展：R19 发布备份策略（默认 { enabled: true, source: 'both', onFailure: 'warn' }） */
  backup?: BackupConfig
  projects: ProjectDef[]
}

/** 扩展：R21 AI 供应商（当前仅 OpenAI 兼容；kind 预留扩展位） */
export interface AiProvider {
  /** 永久标识（创建后不变） */
  id: string
  /** 显示名（可改） */
  name: string
  /** 预留扩展位：当前仅 'openai-compatible' */
  kind: 'openai-compatible'
  /** chat/completions 前缀（如 https://api.deepseek.com/v1） */
  baseUrl: string
  /** 默认模型 */
  model: string
  enabled: boolean
}

// ==================== 发布记录 ====================
// 扩展：R19 备份类型（发布自动备份的产物引用与哈希清单）
export interface BackupItem {
  kind: 'source-bundle' | 'source-archive' | 'artifact'
  /** 相对备份目录的文件名 */
  file: string
  sha256: string
  size: number
  /** 归档内文件数（产物备份才有） */
  files?: number
}

export interface RepoBackupRef {
  releaseId: string
  repoId: string
  repoName: string
  /** 所属项目（定位备份目录 backups/{projectId}/{repoId}/{version}） */
  projectId: string
  version: string
  /** 备份时 HEAD（full hash） */
  commit: string
  tag?: string
  date: string
  items: BackupItem[]
}

export interface BackupConfig {
  enabled: boolean
  /** 备份大文件目录；缺省 ~/.bxverse/backups */
  dir?: string
  /** 源码备份形式：both（bundle + 快照，默认）/ bundle / archive */
  source: 'both' | 'bundle' | 'archive'
  /** 备份失败策略：warn（发布继续，记 warning）/ fail（该仓库发布中止） */
  onFailure: 'warn' | 'fail'
}

export interface RepoReleaseRef {
  repoId: string
  repoName: string
  /** 发布时刻的仓库中文名快照（缺省回退 repoName） */
  displayName?: string
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
  /** 扩展：发布结果状态；partial 表示部分仓库或同步步骤失败 */
  status?: 'completed' | 'partial' | 'failed'
  /** 扩展：发布执行期间产生的非阻断/部分失败诊断 */
  warnings?: string[]
  /** 扩展：R19 本次发布备份引用（源码 bundle/快照/产物） */
  backups?: RepoBackupRef[]
  /** 扩展：R24 发布废弃标记与原因 */
  deprecated?: boolean
  deprecateReason?: string
  deprecatedAt?: string
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
  /** 扩展：计划阶段的 Git 增删统计 */
  diffStat?: DiffStat
  /** 扩展：检测阶段诊断信息 */
  warnings?: string[]
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
  /** 扩展：R19 本次发布是否备份源码（默认 true，受 AppConfig.backup.enabled 总控） */
  backupSource?: boolean
  /** 扩展：R19 本次发布是否备份产物（默认 true；仓库未配置 artifactDir 时跳过并 warning） */
  backupArtifacts?: boolean
  /** 扩展：提交级排除（向导人工甄别），repoId → 不参与本次发布的 fullHash 列表 */
  excludeCommits?: Record<string, string[]>
}

export interface PublishEvent {
  /** 扩展：任务内单调递增序号，用于 SSE 重放去重 */
  seq?: number
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
  /** 扩展：检测阶段诊断信息 */
  warnings?: string[]
  /** 扩展：提交列表是否因上限被截断 */
  truncated?: boolean
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

/** 项目版本清单项（GET /api/projects/:id/versions，R18） */
export interface RepoVersionItem {
  /** 仓库英文名（RepoDef.name） */
  app: string
  /** 仓库中文名（RepoDef.displayName ?? app） */
  name: string
  /** 当前版本号（业务仓库 version.json；缺省回退项目统一版本） */
  version: string
}

// ==================== 一致性对比（扩展：R19） ====================
export type FileCompareStatus = 'added' | 'removed' | 'modified' | 'same'

export interface FileSideInfo {
  sha256?: string
  size?: number
}

export interface FileCompareItem {
  path: string
  status: FileCompareStatus
  /** 源码级 diff 的行变化（无则缺省） */
  insertions?: number
  deletions?: number
  left?: FileSideInfo
  right?: FileSideInfo
}

export interface CompareResult {
  kind: 'source' | 'artifact' | 'verify'
  left?: string
  right?: string
  files: FileCompareItem[]
  totals: { added: number; removed: number; modified: number; same: number }
}

// 扩展：R22 仓库内 Git 面板（status / diff / 暂存 / 提交 / 推送 / 拉取 / AI 提交与变更解读）
/** git status --porcelain 单行（X 索引区状态，Y 工作区状态，路径） */
export interface GitFileStatus {
  indexStatus: string
  workStatus: string
  /** 相对仓库根的路径 */
  path: string
  staged: boolean
  untracked: boolean
}

export interface GitStatus {
  branch: string
  hasRemote: boolean
  remoteUrl: string
  head: string
  ahead: number
  behind: number
  files: GitFileStatus[]
  summary: { staged: number; unstaged: number; untracked: number }
}

export interface GitFileDiff {
  path: string
  range: 'staged' | 'unstaged' | 'untracked'
  patch: string
  truncated: boolean
}

export interface AiCommitMessageSuggestion {
  subject: string
  body: string
  type: CommitType
  provider?: string
}

export interface AiExplainDiffResult {
  intent: string
  keyChanges: string[]
  risks: string[]
  provider?: string
}

// 扩展：R21 智能 AI 供应商预设与在线模型探测
export type AiProviderCategory = 'domestic' | 'global' | 'aggregator' | 'local' | 'custom'

export interface AiModelRecommendation {
  id: string
  label: string
  description?: string
  isDefault?: boolean
}

export interface AiProviderPreset {
  key: string
  name: string
  category: AiProviderCategory
  baseUrl: string
  docUrl?: string
  placeholderModel: string
  recommendedModels: AiModelRecommendation[]
  hint?: string
  color?: string
}

export interface AiTestResult {
  ok: boolean
  latencyMs: number
  model: string
  reply: string
  detail?: string
  providerName?: string
}

// 扩展：R25 多工程分支协同巡检与批量对齐
export interface BranchAlignmentItem {
  repoId: string
  repoName: string
  branch: string
  head: string
  isAligned: boolean
  defaultBranch: string
}

export interface BranchAlignmentResult {
  isAllAligned: boolean
  defaultBranch: string
  items: BranchAlignmentItem[]
}
