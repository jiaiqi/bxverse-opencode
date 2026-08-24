// apps/web/src/composables/useDetectPool.ts
// 检测 worker 池 + 单仓重试（ReleaseWizard 步骤 1）

import type { RepoStatus } from '@bxverse/shared'
import { useProjectsStore } from '../stores/projects'

export function useDetectPool(
  projectId: Ref<string>,
  project: ComputedRef<ReturnType<typeof useProjectsStore>['byId'] extends (id: string) => infer R ? R : never>,
) {
  const projectsStore = useProjectsStore()

  const statuses = ref<Map<string, RepoStatus | null>>(new Map())
  const failedRepos = ref<Map<string, string>>(new Map())
  const detecting = ref(true)

  /** 提交明细「展开全部」按仓库记录 */
  const commitsShowAllRepos = ref<Set<string>>(new Set())
  const COMMITS_PREVIEW_LIMIT = 100
  const DETECT_CONCURRENCY = 4

  const failedRepoIds = computed(() => [...failedRepos.value.keys()])

  const changedRepoIds = computed(() => {
    if (!project.value) return []
    return project.value.repos.filter(r => statuses.value.get(r.id)?.changed).map(r => r.id)
  })

  async function detect(): Promise<void> {
    if (!project.value) return
    detecting.value = true
    statuses.value = new Map()
    failedRepos.value = new Map()
    commitsShowAllRepos.value = new Set()
    const repos = [...project.value.repos]
    let idx = 0
    const worker = async () => {
      while (idx < repos.length) {
        const repo = repos[idx++]
        try {
          const st = await projectsStore.repoStatus(projectId.value, repo.id, true)
          statuses.value.set(repo.id, st)
        } catch (e) {
          statuses.value.set(repo.id, null)
          failedRepos.value.set(repo.id, (e as Error).message || '检测失败')
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(DETECT_CONCURRENCY, repos.length) }, () => worker()))
    statuses.value = new Map(statuses.value)
    failedRepos.value = new Map(failedRepos.value)
    detecting.value = false
  }

  async function detectRepo(repoId: string): Promise<void> {
    const repo = project.value?.repos.find(r => r.id === repoId)
    if (!repo) return
    statuses.value.set(repoId, null)
    failedRepos.value.delete(repoId)
    failedRepos.value = new Map(failedRepos.value)
    try {
      const st = await projectsStore.repoStatus(projectId.value, repo.id, true)
      statuses.value.set(repoId, st)
    } catch (e) {
      failedRepos.value.set(repoId, (e as Error).message || '检测失败')
    }
    statuses.value = new Map(statuses.value)
    failedRepos.value = new Map(failedRepos.value)
  }

  function visibleCommits(repoId: string) {
    const list = statuses.value.get(repoId)?.commits ?? []
    return commitsShowAllRepos.value.has(repoId) ? list : list.slice(0, COMMITS_PREVIEW_LIMIT)
  }

  function hiddenCommitsCount(repoId: string): number {
    if (commitsShowAllRepos.value.has(repoId)) return 0
    const list = statuses.value.get(repoId)?.commits ?? []
    return Math.max(0, list.length - COMMITS_PREVIEW_LIMIT)
  }

  function showAllCommits(repoId: string): void {
    const next = new Set(commitsShowAllRepos.value)
    next.add(repoId)
    commitsShowAllRepos.value = next
  }

  return {
    statuses,
    failedRepos,
    detecting,
    failedRepoIds,
    changedRepoIds,
    commitsShowAllRepos,
    COMMITS_PREVIEW_LIMIT,
    detect,
    detectRepo,
    visibleCommits,
    hiddenCommitsCount,
    showAllCommits,
  }
}
