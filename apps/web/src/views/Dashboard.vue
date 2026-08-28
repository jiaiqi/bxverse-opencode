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
import { api } from '../api'

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
  return list.filter((p) => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q))
})
const emptyBoard = computed(
  () =>
    !projectsStore.overviewLoading &&
    boardProjects.value.length === 0 &&
    (projectsStore.overview?.projects.length ?? 0) > 0,
)

function groupByProject(
  repos: OverviewData['changedRepos'],
): { projectId: string; projectName: string; repos: OverviewData['changedRepos'] }[] {
  const map = new Map<
    string,
    { projectId: string; projectName: string; repos: OverviewData['changedRepos'] }
  >()
  for (const r of repos) {
    if (!map.has(r.projectId))
      map.set(r.projectId, { projectId: r.projectId, projectName: r.projectName, repos: [] })
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

// 扩展：M9 驾驶舱增强——近 8 周发布节奏（柱状 sparkline + 最高 1 周提示）
const weekly = ref<Array<{ week: string; releases: number; projects: number }>>([])
const weeklyMax = computed(() => Math.max(1, ...weekly.value.map((w) => w.releases)))
const totalRecent = computed(() => weekly.value.reduce((s, w) => s + w.releases, 0))
const peakWeek = computed(() => {
  const m = weeklyMax.value
  if (m <= 1) return null
  const w = weekly.value.find((x) => x.releases === m)
  return w ? { week: w.week, count: w.releases } : null
})
async function loadWeekly() {
  try {
    const r = await api.overviewWeekly()
    weekly.value = r.weeks
  } catch {
    weekly.value = []
  }
}
const sparkBars = computed(() => {
  if (!weekly.value.length) return []
  const w = 120
  const h = 40
  const pad = 4
  const slot = (w - pad * 2) / weekly.value.length
  const barW = Math.max(2, slot - 2)
  return weekly.value.map((x, i) => {
    const xc = pad + i * slot + (slot - barW) / 2
    const ratio = x.releases / weeklyMax.value
    const bh = Math.max(1, ratio * (h - pad * 2))
    return {
      x: xc,
      y: h - pad - bh,
      w: barW,
      h: bh,
      label: x.week,
      count: x.releases,
      projects: x.projects,
    }
  })
})

onMounted(() => {
  void refresh()
  void loadWeekly()
})

// 页面可见时按配置周期自动刷新（总览/项目/仓库状态）— interval 响应式
usePolling(refresh, () => appStore.pollInterval || 30_000)
</script>

<template>
  <div class="page max-w-6xl space-y-6">
    <PageHeader
      title="全景概览看板"
      :description="`系统守护运行中 · 今天是 ${today}`"
      icon="i-carbon-dashboard"
    >
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
    <div
      v-if="projectsStore.overviewLoading && !overview"
      class="grid grid-cols-2 md:grid-cols-4 gap-4"
    >
      <div v-for="i in 4" :key="i" class="skeleton h-24" />
    </div>
    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
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
      <!-- 扩展：M8 看板——脏仓库计数（status.dirty > 0） -->
      <StatCard
        label="工作区脏"
        :value="overview?.dirtyRepoCount ?? 0"
        sub-label="仓未提交"
        icon="i-carbon-document-unknown"
        :accent="(overview?.dirtyRepoCount ?? 0) > 0"
        color="orange"
      />
      <StatCard
        label="版本与备份审计"
        :value="projectsStore.items.length > 0 ? `${projectsStore.items.length} 活跃` : '就绪'"
        sub-label="Git 审计"
        icon="i-carbon-security"
        color="purple"
      />
    </div>

    <!-- 业务项目看板网格（M8）上方：M9 驾驶舱增强——近 8 周发布节奏 + misaligned 一键对齐 -->
    <section v-if="overview" class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <!-- sparkline -->
      <div class="glass-panel p-5 rounded-2xl lg:col-span-2">
        <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div class="flex items-center gap-2">
            <i aria-hidden="true" class="i-carbon-chart-histogram text-brand-500" />
            <h3 class="text-sm font-semibold text-text-1">近 8 周发布节奏</h3>
            <span class="text-[11px] text-text-3 font-mono"
              >共 {{ totalRecent }} 次 · 跨项目聚合</span
            >
          </div>
          <div v-if="peakWeek" class="text-[11px] text-text-3 flex items-center gap-1">
            <i aria-hidden="true" class="i-carbon-storm-warning text-warning" />
            峰值 <b class="text-text-1 font-mono">{{ peakWeek.week }}</b> · {{ peakWeek.count }} 次
          </div>
        </div>
        <div
          v-if="!weekly.length && !projectsStore.overviewLoading"
          class="text-xs text-text-3 text-center py-6"
        >
          暂无发布数据
        </div>
        <div v-else class="flex items-end gap-3">
          <svg
            viewBox="0 0 120 40"
            class="w-44 h-14 shrink-0"
            preserveAspectRatio="none"
            aria-label="近 8 周发布次数柱状图"
          >
            <rect
              v-for="(b, i) in sparkBars"
              :key="i"
              :x="b.x"
              :y="b.y"
              :width="b.w"
              :height="b.h"
              rx="1.5"
              :class="b.count === weeklyMax && b.count > 0 ? 'fill-warn' : 'fill-brand-500'"
              :opacity="b.count === 0 ? 0.15 : 1"
            />
          </svg>
          <div
            class="flex-1 grid grid-cols-8 gap-1 text-center text-[10px] text-text-3 font-mono self-end"
          >
            <div
              v-for="b in sparkBars"
              :key="b.label"
              :title="`${b.label} · ${b.count} 次 · ${b.projects} 项目`"
            >
              <div class="truncate">{{ b.label.slice(5) }}</div>
              <div class="text-text-1 font-semibold text-[11px]">{{ b.count }}</div>
            </div>
          </div>
        </div>
      </div>
      <!-- misaligned 一键对齐 -->
      <div class="glass-panel p-5 rounded-2xl flex flex-col">
        <div class="flex items-center gap-2 mb-2">
          <i aria-hidden="true" class="i-carbon-branch text-warn" />
          <h3 class="text-sm font-semibold text-text-1">分支巡检与一键对齐</h3>
        </div>
        <p class="text-xs text-text-3 leading-relaxed mb-3">
          进入项目查看未停留在主发布分支的工程，并在向导里一键切回 + pull。每个项目支持独立 dry-run
          预检。
        </p>
        <div class="mt-auto flex gap-2">
          <NButton
            size="small"
            type="primary"
            :disabled="!projectsStore.items.length"
            @click="
              router.push(
                projectsStore.items[0]?.id ? `/project/${projectsStore.items[0].id}` : '/',
              )
            "
          >
            前往首个项目
          </NButton>
          <NButton size="small" quaternary @click="$router.push('/ops')">查看健康页</NButton>
        </div>
      </div>
    </section>

    <!-- 业务项目看板网格（M8） -->
    <section class="space-y-3">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <h2 class="section-title">
          <i aria-hidden="true" class="i-carbon-catalog text-brand-500" /> 业务项目总览与治理
        </h2>
        <div class="flex items-center gap-2">
          <NInput
            v-model:value="boardFilter"
            placeholder="筛选项目名/ID…"
            clearable
            size="small"
            style="width: 220px"
            :input-props="{ autocomplete: 'off', spellcheck: false }"
          >
            <template #prefix
              ><i aria-hidden="true" class="i-carbon-search text-text-3"
            /></template>
          </NInput>
          <button
            class="text-xs font-mono text-brand-500 hover:underline flex items-center gap-1 bg-transparent border-0 cursor-pointer focus-ring rounded"
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
      <div v-else-if="emptyBoard" class="card p-8 text-center text-sm text-text-3">
        无匹配项目，试试其他关键词
      </div>
      <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <template v-if="overview">
          <ProjectCard
            v-for="p in boardProjects"
            :key="p.id"
            :project="p"
            @release="(id) => router.push(`/project/${id}/release`)"
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
                class="no-underline flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-surface-alt hover:border-brand-300 hover:bg-brand-soft transition-colors duration-fast text-xs font-mono text-text-1 group"
              >
                <i
                  aria-hidden="true"
                  class="i-carbon-git-branch text-text-3 group-hover:text-brand-500"
                />
                <span class="font-medium font-sans">{{ r.repoName }}</span>
                <span
                  class="px-1.5 py-0.2 rounded text-[10px] bg-warning/15 text-warning border border-warning/30"
                >
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
