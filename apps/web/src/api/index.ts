// apps/web/src/api/index.ts
// API 资源层：全部端点函数（类型引用 @bxverse/shared）

import type {
  AiTestResult,
  AppConfig,
  AggregateExportFormat,
  AggregateFeedResponse,
  AggregateGranularity,
  AggregateTimelineResponse,
  BackupCleanupResult,
  BackupRetention,
  BackupUsage,
  BranchAlignmentResult,
  CloneRequest,
  CommitType,
  CompareResult,
  CrossSearchResponse,
  CrossSearchType,
  FileContent,
  FailedRepoReport,
  GitFileDiff,
  GitStatus,
  OverviewData,
  ProjectDef,
  PublishPlan,
  PublishRequest,
  ReleaseRecord,
  RepoBackupRef,
  RepoDef,
  RepoStatus,
  RepoVersionItem,
  RollbackPreview,
  RollbackRequest,
  RollbackResult,
  TreeNode,
  VersionMatrix,
} from '@bxverse/shared'
import { download, http, streamSse } from './http'

export interface ConfigPayload {
  token: string
  config: AppConfig & {
    projects: { id: string; name: string; version: string; repoCount: number }[]
  }
}

export interface PublishEventLike {
  seq?: number
  type: string
  message: string
  repoId?: string
  data?: unknown
}

export const api = {
  // 配置
  config: () => http.get<ConfigPayload>('/config'),
  saveConfig: (
    body: Partial<
      Pick<AppConfig, 'theme' | 'themeStyle' | 'pwa' | 'pollInterval' | 'ai' | 'backup'>
    >,
  ) => http.post<{ config: AppConfig }>('/config', body),
  health: () => http.get<{ ok: boolean; version: string; home?: string }>('/health'),

  // 总览
  overview: () => http.get<OverviewData>('/overview'),
  // M9 驾驶舱增强：近 8 周发布节奏
  overviewWeekly: () =>
    http.get<{
      weeks: Array<{ week: string; releases: number; projects: number }>
      generatedAt: string
    }>('/overview/weekly'),

  // R31 版本矩阵（多项目跨工程 0 入侵聚合）
  matrix: () => http.get<VersionMatrix>('/matrix'),

  // R32 升级后回退到历史版本
  rollbackPreview: (projectId: string, targetReleaseId: string) =>
    http.get<RollbackPreview>(
      `/projects/${projectId}/rollback/preview?targetReleaseId=${encodeURIComponent(targetReleaseId)}`,
    ),
  rollbackExecute: (projectId: string, body: RollbackRequest) =>
    http.post<RollbackResult>(`/projects/${projectId}/rollback`, body),
  rollbackDiff: (projectId: string, fromReleaseId: string, toReleaseId: string) =>
    http.get<unknown>(
      `/projects/${projectId}/rollback/diff?fromReleaseId=${encodeURIComponent(fromReleaseId)}&toReleaseId=${encodeURIComponent(toReleaseId)}`,
    ),

  // 版本清单导出（R18）
  projectVersions: (projectId: string) =>
    http.get<RepoVersionItem[]>(`/projects/${projectId}/versions`),
  exportProjectVersions: (
    projectId: string,
    body: { repoId: string; path: string; items?: RepoVersionItem[] },
  ) =>
    http.post<{
      ok: boolean
      repoId: string
      path: string
      fullPath: string
      items: RepoVersionItem[]
      count: number
    }>(`/projects/${projectId}/versions/export`, body),

  // 项目
  projects: () => http.get<ProjectDef[]>('/projects'),
  createProject: (body: { name: string; description?: string }) =>
    http.post<ProjectDef>('/projects', body),
  updateProject: (
    id: string,
    body: Partial<
      Pick<
        ProjectDef,
        | 'name'
        | 'description'
        | 'bump'
        | 'repoVersionScheme'
        | 'repoVersionFormat'
        | 'manifestTarget'
        | 'externalExclude'
      >
    >,
  ) => http.patch<ProjectDef>(`/projects/${id}`, body),
  deleteProject: (id: string, purge = false) =>
    http.del<{ ok: boolean; purged: boolean }>(`/projects/${id}?purge=${purge}`),

  // 仓库
  addRepoByPath: (projectId: string, path: string, name?: string) =>
    http.post<RepoDef>(`/projects/${projectId}/repos`, name ? { path, name } : { path }),
  addRepoByUrl: (projectId: string, body: CloneRequest) =>
    http.post<RepoDef>(`/projects/${projectId}/repos`, body),
  updateRepo: (
    pid: string,
    rid: string,
    body: Partial<
      Pick<
        RepoDef,
        | 'name'
        | 'displayName'
        | 'buildCommand'
        | 'outputDir'
        | 'writeVersionFile'
        | 'updatePackageVersion'
        | 'path'
        | 'artifactDir'
        | 'versionSource'
        | 'packageManager'
        | 'installCommand'
        | 'preBuildCommand'
        | 'buildTimeoutMs'
        | 'versionSyncCommit'
      >
    >,
  ) => http.patch<RepoDef>(`/projects/${pid}/repos/${rid}`, body),
  deleteRepo: (pid: string, rid: string, purge = false) =>
    http.del<{ ok: boolean; purged: boolean }>(`/projects/${pid}/repos/${rid}?purge=${purge}`),
  repoStatus: (pid: string, rid: string, fresh = false) =>
    http.get<RepoStatus>(`/repos/${pid}/${rid}/status${fresh ? '?fresh=true' : ''}`),

  // 文件
  tree: (pid: string, rid: string, path: string) =>
    http.get<TreeNode>(`/repos/${pid}/${rid}/tree?path=${encodeURIComponent(path)}`),
  file: (pid: string, rid: string, path: string) =>
    http.get<FileContent>(`/repos/${pid}/${rid}/file?path=${encodeURIComponent(path)}`),

  // 发布历史
  projectReleases: (id: string, n = 20) =>
    http.get<ReleaseRecord[]>(`/projects/${id}/releases?n=${n}`),
  releasesByScope: (scopeId: string, version?: string) =>
    http.get<ReleaseRecord[] | ReleaseRecord>(
      `/releases?scopeId=${scopeId}${version ? `&version=${encodeURIComponent(version)}` : ''}`,
    ),
  editLog: (
    recordId: string,
    body: {
      track: 'internal' | 'external'
      action: 'edit' | 'confirm' | 'reset'
      content?: string
    },
  ) => http.patch<ReleaseRecord>(`/releases/${recordId}/log`, body),
  releaseVersions: (recordId: string) =>
    http.get<RepoVersionItem[]>(`/releases/${recordId}/versions`),
  deprecateRelease: (recordId: string, body: { reason?: string; cleanupTags?: boolean }) =>
    http.post<ReleaseRecord>(`/releases/${recordId}/deprecate`, body),

  // 多工程分支协同巡检与对齐 (R25)
  branchAlignment: (projectId: string, target = 'master') =>
    http.get<BranchAlignmentResult>(
      `/projects/${projectId}/branch-alignment?target=${encodeURIComponent(target)}`,
    ),
  batchCheckout: (projectId: string, branch: string) =>
    http.post<{
      ok: boolean
      branch: string
      errors: { repoId: string; repoName: string; error: string }[]
    }>(`/projects/${projectId}/batch-checkout`, { branch }),
  batchPull: (projectId: string) =>
    http.post<{
      ok: boolean
      results: { repoId: string; repoName: string; ok: boolean; output: string }[]
    }>(`/projects/${projectId}/batch-pull`, {}),

  // 发布
  publish: (body: PublishRequest) =>
    http.post<PublishPlan | { taskId: string; queued: boolean }>('/publish', body),
  publishCurrent: () =>
    http.get<{ taskId: string | null; status?: string; projectId?: string }>('/publish/current'),
  // M11：失败结构化诊断与回滚
  publishFailure: (taskId: string) =>
    http.get<{
      taskId: string
      projectId: string
      status: string
      failedRepos: string[]
      reports: FailedRepoReport[]
    }>(`/publish/${encodeURIComponent(taskId)}/failure`),
  // 运维中心
  opsDoctor: (project?: string) =>
    http.get<{
      home: string
      at: string
      counts: { ok: number; warn: number; error: number }
      overall: 'ok' | 'warn' | 'error' | 'checking'
      projects: Array<{
        projectId: string
        projectName: string
        projectVersion: string
        repos: Array<{
          repoId: string
          repoName: string
          head: string
          branch: string
          lastPublishCommit: string | null
          dirty: number
          ahead: number
          baseAncestor: boolean
          otherBranches: string[]
          buildTagsRecent: string[]
          vTagsCount: number
          vTagLatest: string | null
          plainTagsCount: number
          plainTagsRecent: string[]
          packageJsonLastCommit: string | null
          state: 'ok' | 'warn' | 'error' | 'checking'
          hints: string[]
        }>
      }>
    }>(`/ops/doctor${project ? `?project=${encodeURIComponent(project)}` : ''}`),
  opsProcess: () =>
    http.get<{
      version: string
      home: string
      memMB: number
      uptimeSec: number
      nodeVersion: string
      platform: string
      startedAt: string
      now: string
    }>('/ops/process'),
  opsLogs: (level: 'all' | 'info' | 'warn' | 'error' = 'all') =>
    http.get<{
      file: string
      total: number
      lines: Array<{ ts: string; level: string; message: string; fields: Record<string, unknown> }>
    }>(`/ops/logs?level=${level}`),
  publishRollback: (taskId: string, body: { repoIds?: string[] }) =>
    http.post<{
      ok: boolean
      deletedBuildTags: { repoId: string; tag: string }[]
      deprecatedReleases: string[]
      deletedMilestoneTags: { repoId: string; tag: string }[]
      warnings: string[]
    }>(`/publish/${encodeURIComponent(taskId)}/rollback`, body),
  // M11：接管续跑（基于 server 已有的 resume 端点，无新接口）

  // 同步
  sync: (action: string, extra: Record<string, unknown> = {}) =>
    http.post<Record<string, unknown>>('/sync', { action, ...extra }),
  rotateToken: () => http.post<{ token: string }>('/auth/rotate'),

  // AI 日志润色（M5-02/R21 多供应商）
  aiPolish: (text: string) =>
    http.post<{ ok: boolean; content: string; provider?: string }>('/ai/polish', { text }),
  aiProviders: () =>
    http.get<
      Array<{
        id: string
        name: string
        kind: string
        baseUrl: string
        model: string
        enabled: boolean
        hasKey: boolean
      }>
    >('/ai/providers'),
  aiAddProvider: (body: { name: string; baseUrl: string; model: string; enabled?: boolean }) =>
    http.post<{
      id: string
      name: string
      baseUrl: string
      model: string
      enabled: boolean
      hasKey: boolean
    }>('/ai/providers', body),
  aiUpdateProvider: (
    id: string,
    body: { name?: string; baseUrl?: string; model?: string; enabled?: boolean },
  ) =>
    http.patch<{
      id: string
      name: string
      baseUrl: string
      model: string
      enabled: boolean
      hasKey: boolean
    }>(`/ai/providers/${id}`, body),
  aiDeleteProvider: (id: string) => http.del<{ ok: boolean }>(`/ai/providers/${id}`),
  aiSetCredential: (id: string, apiKey: string) =>
    http.put<{ ok: boolean; hasKey: boolean }>(`/ai/providers/${id}/credential`, { apiKey }),
  aiTestProvider: (body: {
    providerId?: string
    baseUrl?: string
    apiKey?: string
    model?: string
    name?: string
  }) => http.post<AiTestResult>('/ai/test', body),
  aiFetchModels: (body: { providerId?: string; baseUrl?: string; apiKey?: string }) =>
    http.post<{ ok: boolean; models: string[] }>('/ai/models', body),
  aiCommitMessage: (body: { fileSummary: string; diff: string }) =>
    http.post<{ ok: boolean; subject: string; body: string; type: CommitType; provider?: string }>(
      '/ai/commit-message',
      body,
    ),
  aiExplainDiff: (body: { filePath: string; diff: string }) =>
    http.post<{
      ok: boolean
      intent: string
      keyChanges: string[]
      risks: string[]
      provider?: string
    }>('/ai/explain-diff', body),

  // Git 面板（R22）
  gitStatus: (pid: string, rid: string) => http.get<GitStatus>(`/repos/${pid}/${rid}/git/status`),
  gitDiff: (
    pid: string,
    rid: string,
    filePath: string,
    range: 'staged' | 'unstaged' | 'untracked',
  ) =>
    http.get<GitFileDiff>(
      `/repos/${pid}/${rid}/git/diff?path=${encodeURIComponent(filePath)}&range=${range}`,
    ),
  gitStage: (pid: string, rid: string, body: { all?: boolean; paths?: string[] }) =>
    http.post<{ ok: boolean }>(`/repos/${pid}/${rid}/git/stage`, body),
  gitUnstage: (pid: string, rid: string, body: { all?: boolean; paths?: string[] }) =>
    http.post<{ ok: boolean }>(`/repos/${pid}/${rid}/git/unstage`, body),
  gitCommit: (
    pid: string,
    rid: string,
    body: { subject: string; body?: string; allowEmpty?: boolean },
  ) => http.post<{ ok: boolean; hash: string }>(`/repos/${pid}/${rid}/git/commit`, body),
  gitPush: (pid: string, rid: string) =>
    http.post<{ ok: boolean; output: string }>(`/repos/${pid}/${rid}/git/push`, {}),
  gitPull: (pid: string, rid: string) =>
    http.post<{ ok: boolean; output: string }>(`/repos/${pid}/${rid}/git/pull`, {}),
  // 备份与一致性对比（R19）
  repoBackups: (pid: string, rid: string, n = 20) =>
    http.get<{ items: RepoBackupRef[] }>(`/repos/${pid}/${rid}/backups?n=${n}`),
  backupMeta: (releaseId: string, repoId: string) =>
    http.get<RepoBackupRef>(`/backups/${releaseId}/${repoId}`),
  backupDownload: (releaseId: string, repoId: string, kind: string) =>
    download(`/backups/download/${releaseId}/${repoId}/${kind}`),
  deleteBackup: (releaseId: string, repoId: string) =>
    http.del<{ ok: boolean }>(`/backups/${releaseId}/${repoId}`),
  compareBackups: (body: {
    kind: string
    left: { releaseId: string; repoId: string }
    right: { releaseId: string; repoId: string }
  }) => http.post<CompareResult>('/backups/compare', body),
  verifyBackup: (releaseId: string, repoId: string) =>
    http.post<CompareResult>('/backups/verify', { releaseId, repoId }),
  repoDiff: (pid: string, rid: string, from: string | null, to: string) =>
    http.get<CompareResult>(
      `/repos/${pid}/${rid}/diff?to=${encodeURIComponent(to)}${from ? `&from=${encodeURIComponent(from)}` : ''}`,
    ),
  backupUsage: (params?: { projectId?: string; repoId?: string }) => {
    const q = new URLSearchParams()
    if (params?.projectId) q.set('projectId', params.projectId)
    if (params?.repoId) q.set('repoId', params.repoId)
    const qs = q.toString() ? `?${q.toString()}` : ''
    return http.get<BackupUsage>(`/backups/usage${qs}`)
  },
  backupCleanup: (body: {
    projectId?: string
    repoId?: string
    retention?: BackupRetention
    dryRun?: boolean
  }) => http.post<BackupCleanupResult>('/backups/cleanup', body),
  backupRestore: (body: {
    releaseId: string
    repoId: string
    kind: string
    targetDir: string
    overwrite?: boolean
  }) => http.post<{ ok: boolean; targetDir: string; restores: number }>('/backups/restore', body),

  // R27 external 分发至 Release
  publishReleaseNote: (
    releaseId: string,
    body: { repoId: string; provider: 'github' | 'gitee'; body: string },
  ) =>
    http.post<{
      ok: boolean
      provider: string
      tag: string
      action: 'created' | 'updated'
      url?: string
    }>(`/releases/${encodeURIComponent(releaseId)}/publish-note`, body),

  // SSE
  subscribePublish: (
    taskId: string,
    onEvent: (e: PublishEventLike) => void,
    onError: (e: Error) => void,
  ) => streamSse(`/events?task=${taskId}`, onEvent, onError),

  // C 方向：跨项目搜索（commit / version / name）
  crossSearch: (q: string, type: CrossSearchType, limit = 50) => {
    const params = new URLSearchParams({ q, type, limit: String(limit) })
    return http.get<CrossSearchResponse>(`/cross/search?${params.toString()}`)
  },

  // D 方向：跨项目升级日志聚合（feed 流 / 时间线 / 导出）
  aggregateFeed: (
    params: { since?: string; until?: string; projectId?: string; limit?: number } = {},
  ) => {
    const q = new URLSearchParams()
    if (params.since) q.set('since', params.since)
    if (params.until) q.set('until', params.until)
    if (params.projectId) q.set('projectId', params.projectId)
    if (params.limit) q.set('limit', String(params.limit))
    const qs = q.toString() ? `?${q.toString()}` : ''
    return http.get<AggregateFeedResponse>(`/aggregate/feed${qs}`)
  },
  aggregateTimeline: (
    params: { granularity?: AggregateGranularity; days?: number; projectId?: string } = {},
  ) => {
    const q = new URLSearchParams()
    if (params.granularity) q.set('granularity', params.granularity)
    if (params.days) q.set('days', String(params.days))
    if (params.projectId) q.set('projectId', params.projectId)
    const qs = q.toString() ? `?${q.toString()}` : ''
    return http.get<AggregateTimelineResponse>(`/aggregate/timeline${qs}`)
  },
  aggregateExportUrl: (params: {
    since?: string
    until?: string
    projectId?: string
    format: AggregateExportFormat
  }) => {
    const q = new URLSearchParams({ format: params.format })
    if (params.since) q.set('since', params.since)
    if (params.until) q.set('until', params.until)
    if (params.projectId) q.set('projectId', params.projectId)
    return `/aggregate/export?${q.toString()}`
  },
}
