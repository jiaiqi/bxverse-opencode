<script setup lang="ts">
// Dashboard.vue —— 总览页

import { RouterLink } from 'vue-router'
import { useProjectsStore } from '../stores/projects'
import PageHeader from '../components/PageHeader.vue'
import StatCard from '../components/StatCard.vue'
import ProjectCard from '../components/ProjectCard.vue'
import EmptyState from '../components/EmptyState.vue'
import AddProjectDialog from '../components/AddProjectDialog.vue'
import { useNow } from '../composables/useNow'
import { usePolling } from '../composables/usePolling'
import { useMessage } from 'naive-ui'
import { useAppStore } from '../stores/app'
import type { OverviewData } from '@bxverse/shared'

const router = useRouter()
const projectsStore = useProjectsStore()
const appStore = useAppStore()
const message = useMessage()
const now = useNow()
const showAddProject = ref(false)
const syncing = ref(false)

const overview = computed(() => projectsStore.overview)

function groupByProject(repos: OverviewData['changedRepos']): { projectId: string; projectName: string; repos: OverviewData['changedRepos'] }[] {
  const map = new Map<string, { projectId: string; projectName: string; repos: OverviewData['changedRepos'] }>()
  for (const r of repos) {
    if (!map.has(r.projectId)) map.set(r.projectId, { projectId: r.projectId, projectName: r.projectName, repos: [] })
    map.get(r.projectId)!.repos.push(r)
  }
  return [...map.values()]
}

const today = computed(() => {
  const d = now.value
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
})

async function refresh() {
  try {
    await Promise.allSettled([projectsStore.load(), projectsStore.loadOverview()])
  } catch {
    // store 内已兜底
  }
}

async function syncData() {
  syncing.value = true
  try {
    const result = await import('../api').then(m => m.api.sync('pull'))
    message.success(result.ok ? '数据仓库已同步' : `同步失败：${String(result.message ?? '')}`)
  } catch (e) {
    message.error((e as Error).message)
  } finally {
    syncing.value = false
  }
}

onMounted(() => {
  void refresh()
})

// 页面可见时按配置周期自动刷新（总览/项目/仓库状态）
usePolling(refresh, computed(() => appStore.pollInterval).value || 30_000)
</script>

<template>
  <div class="page">
    <PageHeader title="总览" :description="`今天是 ${today}`">
      <NButton size="small" quaternary :loading="syncing" @click="syncData">
        <template #icon><i aria-hidden="true" class="i-carbon-renew" /></template>
        同步数据
      </NButton>
      <NButton size="small" type="primary" @click="showAddProject = true">
        <template #icon><i aria-hidden="true" class="i-carbon-add" /></template>
        新建项目
      </NButton>
    </PageHeader>

    <!-- 统计 -->
    <div v-if="projectsStore.overviewLoading && !overview" class="grid grid-cols-3 gap-4">
      <div v-for="i in 3" :key="i" class="skeleton h-24" />
    </div>
    <div v-else class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <StatCard label="项目" :value="overview?.projectCount ?? 0" icon="i-carbon-catalog" />
      <StatCard label="代码仓库" :value="overview?.repoCount ?? 0" icon="i-carbon-cube" />
      <StatCard
        label="待发布仓库"
        :value="overview?.changedRepoCount ?? 0"
        icon="i-carbon-git-commit"
        :accent="(overview?.changedRepoCount ?? 0) > 0"
      />
    </div>

    <!-- 项目网格 -->
    <section>
      <h2 class="section-title">
        <i aria-hidden="true" class="i-carbon-catalog text-brand-500" /> 项目
      </h2>
      <div v-if="overview && overview.projects.length === 0" class="card">
        <EmptyState
          title="还没有项目"
          description="创建项目后，将你的代码仓库接入进来，统一管理版本与更新日志。"
          @action="showAddProject = true"
        />
      </div>
      <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-4">
        <template v-if="overview">
          <ProjectCard
            v-for="p in overview.projects"
            :key="p.id"
            :project="p"
            @open="id => router.push(`/project/${id}`)"
            @release="id => router.push(`/project/${id}/release`)"
          />
        </template>
        <template v-else>
          <div v-for="i in 3" :key="i" class="skeleton h-32" />
        </template>
      </div>
    </section>

    <!-- 变动仓库 -->
    <section v-if="overview && overview.changedRepos.length > 0">
      <h2 class="section-title">
        <i aria-hidden="true" class="i-carbon-git-commit text-brand-500" /> 待发布仓库
      </h2>
      <div class="card mt-4 divide-y divide-border">
        <template v-for="group in groupByProject(overview.changedRepos)" :key="group.projectId">
          <div class="flex items-center gap-3 px-5 py-3">
            <div class="w-44 shrink-0 flex items-center gap-2 min-w-0">
              <span class="text-sm font-medium text-text-1 truncate">{{ group.projectName }}</span>
              <NButton
                size="tiny"
                secondary
                type="primary"
                @click="router.push(`/project/${group.projectId}/release`)"
              >
                <template #icon><i aria-hidden="true" class="i-carbon-rocket" /></template>
                发布
              </NButton>
            </div>
            <div class="flex-1 flex flex-wrap gap-2">
              <RouterLink
                v-for="r in group.repos"
                :key="r.repoId"
                :to="`/repo/${r.projectId}/${r.repoId}`"
                class="no-underline flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border hover:border-brand-300 hover:bg-brand-soft transition-colors duration-150 text-sm text-text-2"
              >
                <i aria-hidden="true" class="i-carbon-git-branch text-13px text-text-3" />
                {{ r.repoName }}
                <span class="chip code-text text-brand-600 border-brand-200 bg-brand-50">{{ r.commits }} 提交</span>
                <span class="code-text text-xs text-text-3" translate="no">{{ r.head }}</span>
              </RouterLink>
            </div>
          </div>
        </template>
      </div>
    </section>

    <AddProjectDialog v-model:show="showAddProject" />
  </div>
</template>
