// apps/web/src/api/index.ts
// API 资源层：全部端点函数（类型引用 @bxverse/shared）

import type {
  AppConfig,
  BumpType,
  CloneRequest,
  FileContent,
  OverviewData,
  ProjectDef,
  PublishPlan,
  PublishRequest,
  ReleaseRecord,
  RepoDef,
  RepoStatus,
  TreeNode,
} from '@bxverse/shared'
import { http, streamSse } from './http'

export interface ConfigPayload {
  token: string
  config: AppConfig & { projects: { id: string; name: string; version: string; repoCount: number }[] }
}

export interface PublishEventLike {
  type: string
  message: string
  repoId?: string
  data?: unknown
}

export const api = {
  // 配置
  config: () => http.get<ConfigPayload>('/config'),
  saveConfig: (body: Partial<Pick<AppConfig, 'theme' | 'pwa' | 'pollInterval' | 'ai'>>) =>
    http.post<{ config: AppConfig }>('/config', body),
  health: () => http.get<{ ok: boolean; version: string }>('/health'),

  // 总览
  overview: () => http.get<OverviewData>('/overview'),

  // 项目
  projects: () => http.get<ProjectDef[]>('/projects'),
  createProject: (body: { name: string; description?: string }) => http.post<ProjectDef>('/projects', body),
  updateProject: (id: string, body: Partial<Pick<ProjectDef, 'name' | 'description' | 'bump' | 'repoVersionScheme' | 'externalExclude'>>) =>
    http.patch<ProjectDef>(`/projects/${id}`, body),
  deleteProject: (id: string, purge = false) => http.del<{ ok: boolean; purged: boolean }>(`/projects/${id}?purge=${purge}`),

  // 仓库
  addRepoByPath: (projectId: string, path: string, name?: string) =>
    http.post<RepoDef>(`/projects/${projectId}/repos`, name ? { path, name } : { path }),
  addRepoByUrl: (projectId: string, body: CloneRequest) =>
    http.post<RepoDef>(`/projects/${projectId}/repos`, body),
  updateRepo: (pid: string, rid: string, body: Partial<Pick<RepoDef, 'name' | 'buildCommand' | 'outputDir' | 'writeVersionFile' | 'path'>>) =>
    http.patch<RepoDef>(`/projects/${pid}/repos/${rid}`, body),
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
  projectReleases: (id: string, n = 20) => http.get<ReleaseRecord[]>(`/projects/${id}/releases?n=${n}`),
  releasesByScope: (scopeId: string, version?: string) =>
    http.get<ReleaseRecord[] | ReleaseRecord>(`/releases?scopeId=${scopeId}${version ? `&version=${encodeURIComponent(version)}` : ''}`),
  editLog: (recordId: string, body: { track: 'internal' | 'external'; action: 'edit' | 'confirm' | 'reset'; content?: string }) =>
    http.patch<ReleaseRecord>(`/releases/${recordId}/log`, body),

  // 发布
  publish: (body: PublishRequest) => http.post<PublishPlan | { taskId: string; queued: boolean }>('/publish', body),
  plan: (projectId: string, bump: BumpType | 'auto' = 'auto') =>
    http.post<PublishPlan>('/publish', { projectId, bump, dryRun: true }),
  publishCurrent: () => http.get<{ taskId: string | null; status?: string; projectId?: string }>('/publish/current'),

  // 同步
  sync: (action: string, extra: Record<string, unknown> = {}) => http.post<Record<string, unknown>>('/sync', { action, ...extra }),
  rotateToken: () => http.post<{ token: string }>('/auth/rotate'),

  // SSE
  subscribePublish: (taskId: string, onEvent: (e: PublishEventLike) => void, onError: (e: Error) => void) =>
    streamSse(`/events?task=${taskId}`, onEvent, onError),
}
