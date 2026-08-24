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
  }),
  getters: {
    byId: s => (id: string): ProjectDef | undefined => s.items.find(p => p.id === id),
    repoById: s => (pid: string, rid: string): { project?: ProjectDef; repo?: RepoDef } => {
      const project = s.items.find(p => p.id === pid)
      return { project, repo: project?.repos.find(r => r.id === rid) }
    },
    /** M8 看板聚合：overview 项目与本地 items 联动，优先取 overview 的统计，回退本地 */
    boardItems: s => {
      const ov = s.overview
      if (!ov) return s.items.map(p => ({ id: p.id, name: p.name, version: p.version, repoCount: p.repos.length, changedRepoCount: 0, lastRelease: null as OverviewData['projects'][number]['lastRelease'] }))
      return ov.projects
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
    },
    async repoStatus(pid: string, rid: string, fresh = false): Promise<RepoStatus> {
      return api.repoStatus(pid, rid, fresh)
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
