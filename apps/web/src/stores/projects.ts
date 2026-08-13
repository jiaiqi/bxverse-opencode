// apps/web/src/stores/projects.ts
// 项目/仓库数据：列表、overview、CRUD、状态

import { defineStore } from 'pinia'
import type {
  BumpType,
  CloneRequest,
  OverviewData,
  ProjectDef,
  ReleaseRecord,
  RepoDef,
  RepoStatus,
} from '@bxverse/shared'
import { api } from '../api'

export const useProjectsStore = defineStore('projects', {
  state: () => ({
    items: [] as ProjectDef[],
    overview: null as OverviewData | null,
    loading: false,
    overviewLoading: false,
    statusCache: new Map<string, RepoStatus>(),
  }),
  getters: {
    byId: s => (id: string): ProjectDef | undefined => s.items.find(p => p.id === id),
    repoById: s => (pid: string, rid: string): { project?: ProjectDef; repo?: RepoDef } => {
      const project = s.items.find(p => p.id === pid)
      return { project, repo: project?.repos.find(r => r.id === rid) }
    },
  },
  actions: {
    async load(): Promise<void> {
      this.loading = true
      try {
        this.items = await api.projects()
      } finally {
        this.loading = false
      }
    },
    async loadOverview(): Promise<void> {
      this.overviewLoading = true
      try {
        this.overview = await api.overview()
      } finally {
        this.overviewLoading = false
      }
    },
    async create(payload: { name: string; description?: string }): Promise<ProjectDef> {
      const p = await api.createProject(payload)
      this.items.push(p)
      return p
    },
    async update(id: string, payload: Parameters<typeof api.updateProject>[1]): Promise<void> {
      const updated = await api.updateProject(id, payload)
      const idx = this.items.findIndex(p => p.id === id)
      if (idx !== -1) this.items[idx] = updated
    },
    async remove(id: string, purge = false): Promise<void> {
      await api.deleteProject(id, purge)
      this.items = this.items.filter(p => p.id !== id)
    },
    async addRepo(projectId: string, payload: { path: string; name?: string } | CloneRequest): Promise<RepoDef> {
      const repo = 'path' in payload
        ? await api.addRepoByPath(projectId, payload.path, payload.name)
        : await api.addRepoByUrl(projectId, payload)
      const project = this.byId(projectId)
      if (project && !project.repos.some(r => r.id === repo.id)) project.repos.push(repo)
      return repo
    },
    async updateRepo(pid: string, rid: string, payload: Parameters<typeof api.updateRepo>[2]): Promise<void> {
      const updated = await api.updateRepo(pid, rid, payload)
      const project = this.byId(pid)
      if (project) {
        const idx = project.repos.findIndex(r => r.id === rid)
        if (idx !== -1) project.repos[idx] = updated
      }
    },
    async removeRepo(pid: string, rid: string, purge = false): Promise<void> {
      await api.deleteRepo(pid, rid, purge)
      const project = this.byId(pid)
      if (project) project.repos = project.repos.filter(r => r.id !== rid)
      this.statusCache.delete(rid)
    },
    async repoStatus(pid: string, rid: string, fresh = false): Promise<RepoStatus> {
      const status = await api.repoStatus(pid, rid, fresh)
      this.statusCache.set(rid, status)
      return status
    },
    async projectReleases(pid: string, n = 20): Promise<ReleaseRecord[]> {
      return api.projectReleases(pid, n)
    },
    bumpTypes(): { label: string; value: BumpType }[] {
      return [
        { label: '补丁 patch', value: 'patch' },
        { label: '次版本 minor', value: 'minor' },
        { label: '重大 major', value: 'major' },
      ]
    },
  },
})
