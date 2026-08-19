// apps/web/src/stores/publish.ts
// 发布向导六步状态机（数据全部保留，步骤切换不销毁）

import { defineStore } from 'pinia'
import { markRaw } from 'vue'
import type { BumpType, LogState, PublishPlan, PublishRequest } from '@bxverse/shared'
import { api } from '../api'
import type { PublishEventLike } from '../api'

export type WizardPhase = 'idle' | 'planning' | 'running' | 'done' | 'error'

export interface LogTrackState {
  state: LogState
  content: string
  autoDraft: string
}

const trackOf = (s: LogTrackState): LogState =>
  s.content === s.autoDraft ? 'auto' : s.state === 'confirmed' ? 'confirmed' : 'edited'

export const usePublishStore = defineStore('publish', {
  state: () => ({
    step: 1,
    projectId: '',
    selectedRepoIds: [] as string[],
    /** 提交级排除：repoId → fullHash[]（向导第 1 步人工甄别） */
    excludedCommits: {} as Record<string, string[]>,
    plan: null as PublishPlan | null,
    planning: false,
    bumpOverride: 'auto' as 'auto' | BumpType,
    logs: {
      internal: { state: 'auto', content: '', autoDraft: '' } as LogTrackState,
      external: { state: 'auto', content: '', autoDraft: '' } as LogTrackState,
    },
    offline: true,
    skipBuild: true,
    /** 本次发布是否备份源码/产物（R19；默认关闭，执行更快） */
    backupSource: false,
    backupArtifacts: false,
    taskId: null as string | null,
    phase: 'idle' as WizardPhase,
    events: [] as PublishEventLike[],
    result: null as { releaseId: string | null; version: string; failedRepos: string[]; syncFailedRepos?: string[] } | null,
    error: '',
    /** 步骤 1 选择与生成 plan 时的集合是否一致（不一致需重新生成计划） */
    planDirty: false,
  }),
  getters: {
    bothConfirmed: (s): boolean =>
      s.logs.internal.state === 'confirmed' && s.logs.external.state === 'confirmed',
    canExecute: (s): boolean =>
      s.plan !== null && !s.planning
      && s.logs.internal.state === 'confirmed' && s.logs.external.state === 'confirmed',
    changedRepos: (s) => s.plan?.changed ?? [],
    syncedOnly: (s) => s.plan?.syncedOnly ?? [],
  },
  actions: {
    reset(projectId: string) {
      this.$patch({
        step: 1,
        projectId,
        selectedRepoIds: [],
        excludedCommits: {},
        plan: null,
        planning: false,
        bumpOverride: 'auto',
        logs: {
          internal: { state: 'auto', content: '', autoDraft: '' },
          external: { state: 'auto', content: '', autoDraft: '' },
        },
        offline: true,
        skipBuild: true,
        backupSource: false,
        backupArtifacts: false,
        taskId: null,
        phase: 'idle',
        events: [],
        result: null,
        error: '',
        planDirty: false,
      })
    },

    setSelected(repoIds: string[]) {
      this.selectedRepoIds = repoIds
      this.planDirty = true
    },

    /** 切换某仓库某提交的参与状态（true=参与，false=排除） */
    toggleCommit(repoId: string, fullHash: string, included: boolean) {
      const current = new Set(this.excludedCommits[repoId] ?? [])
      if (included) current.delete(fullHash)
      else current.add(fullHash)
      this.excludedCommits = { ...this.excludedCommits, [repoId]: [...current] }
      this.planDirty = true
    },

    async loadPlan(): Promise<void> {
      if (!this.projectId || this.selectedRepoIds.length === 0) return
      this.planning = true
      try {
        const req: PublishRequest = {
          projectId: this.projectId,
          bump: this.bumpOverride,
          repoIds: this.selectedRepoIds,
          excludeCommits: this.excludedCommits,
          offline: this.offline,
          skipBuild: this.skipBuild,
          backupSource: this.backupSource,
          backupArtifacts: this.backupArtifacts,
          dryRun: true,
        }
        const plan = (await api.publish(req)) as PublishPlan
        // markRaw：plan 可达数 MB（提交明细 + 双轨草稿），生成后整体替换不再变更，
        // 深度 reactive 代理大对象会拖慢 getter/依赖收集，只保留浅层引用
        this.plan = markRaw(plan)
        this.planDirty = false
        // 草稿同步：state=auto 时跟随新草稿；edited/confirmed 保留人工内容（调用方确认重置）
        if (this.logs.external.state === 'auto') {
          this.logs.external.autoDraft = plan.externalDraft
          this.logs.external.content = plan.externalDraft
        } else {
          this.logs.external.autoDraft = plan.externalDraft
        }
        if (this.logs.internal.state === 'auto') {
          this.logs.internal.autoDraft = plan.internalDraft
          this.logs.internal.content = plan.internalDraft
        } else {
          this.logs.internal.autoDraft = plan.internalDraft
        }
      } finally {
        this.planning = false
      }
    },

    editLog(track: 'internal' | 'external', content: string) {
      this.logs[track].content = content
      this.logs[track].state = trackOf(this.logs[track])
    },
    confirmLog(track: 'internal' | 'external') {
      const t = this.logs[track]
      if (!t.content.trim()) return
      t.state = 'confirmed'
    },
    unconfirmLog(track: 'internal' | 'external') {
      this.logs[track].state = trackOf(this.logs[track]) === 'confirmed' ? 'edited' : this.logs[track].state
    },
    resetLog(track: 'internal' | 'external') {
      const t = this.logs[track]
      t.content = t.autoDraft
      t.state = 'auto'
    },

    async execute(): Promise<string> {
      if (!this.plan) throw new Error('发布计划不存在')
      // 日志未编辑（含 confirmed 但内容仍等于自动草稿）时不携带 content：
      // 超长日志（首次发布可达数 MB）无需重复传输，engine 会用 plan 草稿兜底
      const extEdited = this.logs.external.state !== 'auto' && this.logs.external.content !== this.logs.external.autoDraft
      const intEdited = this.logs.internal.state !== 'auto' && this.logs.internal.content !== this.logs.internal.autoDraft
      const req: PublishRequest = {
        projectId: this.projectId,
        bump: this.plan.bump,
        repoIds: this.selectedRepoIds,
        excludeCommits: this.excludedCommits,
        offline: this.offline,
        skipBuild: this.skipBuild,
        backupSource: this.backupSource,
        backupArtifacts: this.backupArtifacts,
        externalContent: extEdited ? this.logs.external.content : undefined,
        internalContent: intEdited ? this.logs.internal.content : undefined,
      }
      const res = (await api.publish(req)) as { taskId: string; queued: boolean }
      this.taskId = res.taskId
      this.phase = 'running'
      this.events = []
      return res.taskId
    },

    pushEvent(e: PublishEventLike) {
      this.events.push(e)
      if (e.type === 'done') {
        const data = (e.data ?? {}) as { releaseId?: string | null; version?: string; failedRepos?: string[]; syncFailedRepos?: string[] }
        this.result = {
          releaseId: data.releaseId ?? null,
          version: data.version ?? this.plan?.projectVersion ?? '',
          failedRepos: data.failedRepos ?? [],
          syncFailedRepos: data.syncFailedRepos,
        }
        this.phase = 'done'
      } else if (e.type === 'error') {
        this.error = e.message
        this.phase = 'error'
      }
    },
  },
})
