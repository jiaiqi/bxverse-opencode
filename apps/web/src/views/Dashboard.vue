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
import { useAppStore } from '../stores/app'
import { formatDateTime } from '../utils/format'
import type { OverviewData } from '@bxverse/shared'

const router = useRouter()
const projectsStore = useProjectsStore()
const appStore = useAppStore()
const now = useNow()
const showAddProject = ref(false)

const overview = computed(() => projectsStore.overview)
const boardFilter = ref('')

const boardProjects = computed(() => {
  const list = projectsStore.overview?.projects ?? []
  const q = boardFilter.value.trim().toLowerCase()
  if (!q) return list
  return list.filter(p => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q))
})
const emptyBoard = computed(() => !projectsStore.overviewLoading && boardProjects.value.length === 0 && (projectsStore.overview?.projects.length ?? 0) > 0)

function groupByProject(repos: OverviewData['changedRepos']): { projectId: string; projectName: string; repos: OverviewData['changedRepos'] }[] {
  const map = new Map<string, { projectId: string; projectName: string; repos: OverviewData['changedRepos'] }>()
  for (const r of repos) {
    if (!map.has(r.projectId)) map.set(r.projectId, { projectId: r.projectId, projectName: r.projectName, repos: [] })
    map.get(r.projectId)!.repos.push(r)
  }
  return [...map.values()]
}

const today = computed(() => formatDateTime(now.value))

async function refresh() {
  try {
    await Promise.allSettled([projectsStore.load(), projectsStore.loadOverview()])
  } catch {
    // store 内已兜底
  }
}

onMounted(() => {
  void refresh()
})

// 页面可见时按配置周期自动刷新（总览/项目/仓库状态）— interval 响应式
usePolling(refresh, () => appStore.pollInterval || 30_000)
</script>

<template>
  <div class="page max-w-6xl space-y-6">
    <PageHeader title="全景概览看板" :description="`系统守护运行中 · 今天是 ${today}`" icon="i-carbon-dashboard">
      <NButton type="primary" @click="showAddProject = true">
        <template #icon><i aria-hidden="true" class="i-carbon-add" /></template>
        新建项目
      </NButton>
      <NButton quaternary @click="refresh">
        <template #icon><i aria-hidden="true" class="i-carbon-renew" /></template>
        刷新
      </NButton>
    </PageHeader>

    <!-- 4 维现代精密仪表指标带 -->
    <div v-if="projectsStore.overviewLoading && !overview" class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div v-for="i in 4" :key="i" class="skeleton h-24" />
    </div>
    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        label="管理业务项目"
        :value="overview?.projectCount ?? 0"
        sub-label="个产品线"
        icon="i-carbon-catalog"
        color="emerald"
      />
      <StatCard
        label="托管关联工程"
        :value="overview?.repoCount ?? 0"
        sub-label="个 Git 仓库"
        icon="i-carbon-cube"
        color="cyan"
      />
      <StatCard
        label="待发布脏变动"
        :value="`+${overview?.changedRepoCount ?? 0}`"
        sub-label="处变更"
        icon="i-carbon-git-commit"
        :accent="(overview?.changedRepoCount ?? 0) > 0"
        color="amber"
      />
      <StatCard
        label="版本与备份审计"
        :value="projectsStore.items.length > 0 ? `${projectsStore.items.length} 活跃` : '就绪'"
        sub-label="Git 审计"
        icon="i-carbon-security"
        color="purple"
      />
    </div>

    <!-- 业务项目看板网格（M8） -->
    <section class="space-y-3">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <h2 class="section-title">
          <i aria-hidden="true" class="i-carbon-catalog text-brand-500" /> 业务项目总览与治理
        </h2>
        <div class="flex items-center gap-2">
          <NInput v-model:value="boardFilter" placeholder="筛选项目名/ID…" clearable size="small" style="width: 220px" :input-props="{ autocomplete: 'off', spellcheck: false }">
            <template #prefix><i aria-hidden="true" class="i-carbon-search text-text-3" /></template>
          </NInput>
          <button
            class="text-xs font-mono text-brand-500 hover:underline flex items-center gap-1 bg-transparent border-0 cursor-pointer"
            @click="showAddProject = true"
          >
            <i aria-hidden="true" class="i-carbon-add text-12px" /> 新建业务项目
          </button>
        </div>
      </div>

      <div v-if="overview && overview.projects.length === 0" class="card">
        <EmptyState
          title="还没有业务项目"
          description="创建项目后，将你的代码仓库接入进来，统一管理版本与更新日志。"
          @action="showAddProject = true"
        />
      </div>
      <div v-else-if="emptyBoard" class="card p-8 text-center text-sm text-text-3">无匹配项目，试试其他关键词</div>
      <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <template v-if="overview">
          <ProjectCard
            v-for="p in boardProjects"
            :key="p.id"
            :project="p"
            @open="id => router.push(`/project/${id}`)"
            @release="id => router.push(`/project/${id}/release`)"
          />
        </template>
        <template v-else>
          <div v-for="i in 3" :key="i" class="skeleton h-36 rounded-2xl" />
        </template>
      </div>
    </section>

    <!-- 待发布变动全景明细 -->
    <section v-if="overview && overview.changedRepos.length > 0" class="space-y-3">
      <h2 class="section-title">
        <i aria-hidden="true" class="i-carbon-git-commit text-warning" /> 待发布工程变更明细
      </h2>
      <div class="card p-2 divide-y divide-border">
        <template v-for="group in groupByProject(overview.changedRepos)" :key="group.projectId">
          <div class="flex items-center gap-4 px-4 py-3.5 flex-wrap md:flex-nowrap">
            <div class="w-48 shrink-0 flex items-center gap-2 min-w-0">
              <span class="text-sm font-bold text-text-1 truncate">{{ group.projectName }}</span>
              <NButton
                size="tiny"
                type="primary"
                secondary
                @click="router.push(`/project/${group.projectId}/release`)"
              >
                <template #icon><i aria-hidden="true" class="i-carbon-rocket" /></template>
                发版向导
              </NButton>
            </div>
            <div class="flex-1 flex flex-wrap gap-2">
              <RouterLink
                v-for="r in group.repos"
                :key="r.repoId"
                :to="`/repo/${r.projectId}/${r.repoId}`"
                class="no-underline flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-surface-alt hover:border-brand-300 hover:bg-brand-soft transition-colors duration-150 text-xs font-mono text-text-1 group"
              >
                <i aria-hidden="true" class="i-carbon-git-branch text-text-3 group-hover:text-brand-500" />
                <span class="font-medium font-sans">{{ r.repoName }}</span>
                <span class="px-1.5 py-0.2 rounded text-[10px] bg-warning/15 text-warning border border-warning/30">
                  +{{ r.commits }} 提交
                </span>
                <span class="text-text-3 text-[11px]" translate="no">{{ r.head.slice(0, 7) }}</span>
              </RouterLink>
            </div>
          </div>
        </template>
      </div>
    </section>

    <AddProjectDialog v-model:show="showAddProject" @saved="refresh" />
  </div>
</template>
