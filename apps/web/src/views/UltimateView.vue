<script setup lang="ts">
// UltimateView.vue —— design v2.0 ULTIMATE 原型 dashboard 视图骨架
// 阶段 1 仅落 4 张 KPI 主区（4 张 .stat-card-wx）+ 余下 5 个区"v1.2.0 即将到来"占位
// 阶段 2-4 逐区替换占位为真实组件

import { computed, onMounted } from 'vue'
import { useProjectsStore } from '../stores/projects'
import { useAppStore } from '../stores/app'
import PageHeader from '../components/PageHeader.vue'
import UltimateStatCard from '../components/UltimateStatCard.vue'
import LoadingState from '../components/LoadingState.vue'

const projectsStore = useProjectsStore()
const appStore = useAppStore()
const overview = computed(() => projectsStore.overview)

async function refresh(): Promise<void> {
  try {
    await Promise.allSettled([projectsStore.load(), projectsStore.loadOverview()])
  } catch {
    // store 内已兜底
  }
}

onMounted(() => {
  void refresh()
})

const placeholders = [
  {
    id: 'changed-list',
    label: '待发布变动',
    icon: 'i-carbon-document-multiple',
    sub: '5 仓 + 提交数 + 分支 + 版本 chip + 红字"未提交改动"',
  },
  {
    id: 'sparkline',
    label: '8 周发布节奏',
    icon: 'i-carbon-chart-histogram',
    sub: 'SVG 折线 sparkline + 8 周标签 + 计数',
  },
  {
    id: 'recent',
    label: '最近发布',
    icon: 'i-carbon-checkmark-outline',
    sub: '最近 4 条 release + 仓数 + 时间',
  },
  {
    id: 'health',
    label: '系统健康览',
    icon: 'i-carbon-health-cross',
    sub: '数据仓库 / journal / 备份目录 / 轮询检测 4 卡',
  },
  { id: 'notify', label: '通知流', icon: 'i-carbon-notification', sub: '钉钉 / 飞书 webhook 历史' },
]

// 备份覆盖率：已发布 release 的项目数 / 总项目数 × 100%
const backupRate = computed(() => {
  if (!overview.value?.projects?.length) return '0%'
  const list = overview.value.projects as Array<{ lastRelease?: unknown }>
  const withRelease = list.filter((p) => p.lastRelease).length
  return Math.round((withRelease / list.length) * 100) + '%'
})
const backupHot = computed(() =>
  ((overview.value?.projects ?? []) as Array<{ lastRelease?: unknown }>).some(
    (p) => !p.lastRelease,
  ),
)
</script>

<template>
  <div
    class="flex flex-1 overflow-hidden"
    style="
      background-color: var(--wx-bg);
      background-image: radial-gradient(circle at 1px 1px, var(--wx-grid-dot) 1px, transparent 0);
      background-size: 24px 24px;
      color: var(--wx-t1);
    "
  >
    <!-- 左侧 nav 已在 AppLayout 挂载；本页只负责主区 -->
    <div class="flex-1 overflow-y-auto p-6 space-y-6">
      <PageHeader
        title="总览驾驶舱"
        :description="`全局态势·变动、健康、备份、通知一目了然 · 轮询中 ${appStore.pollInterval ? Math.round(appStore.pollInterval / 1000) + 's' : '30s'} · 页面隐藏自动暂停`"
      >
        <template #actions>
          <NButton size="small" quaternary @click="refresh">
            <template #icon><i aria-hidden="true" class="i-carbon-renew" /></template>
            同步数据
          </NButton>
        </template>
      </PageHeader>

      <!-- 4 张 KPI 主指标（design v2.0 截图一致） -->
      <LoadingState v-if="projectsStore.overviewLoading && !overview" compact />
      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <UltimateStatCard
          label="管理项目"
          :value="overview?.projectCount ?? 0"
          sub-label="主产品线"
          icon="i-carbon-catalog"
          :stagger-delay-ms="0"
        />
        <UltimateStatCard
          label="托管仓库"
          :value="overview?.repoCount ?? 0"
          sub-label="仓在主发布分支"
          icon="i-carbon-cube"
          :stagger-delay-ms="60"
        />
        <UltimateStatCard
          label="待发布变动"
          :value="overview?.changedRepoCount ?? 0"
          sub-label="个新提交"
          :hot="(overview?.changedRepoCount ?? 0) > 0"
          icon="i-carbon-git-commit"
          :stagger-delay-ms="120"
        />
        <UltimateStatCard
          label="备份覆盖率"
          :value="backupRate"
          sub-label="仓已配置产物目录"
          :hot="backupHot"
          icon="i-carbon-cloud-upload"
          :stagger-delay-ms="180"
        />
      </div>

      <!-- 5 个区 v1.2.0 即将到来占位（阶段 2-4 逐区替换） -->
      <section class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div
          v-for="(p, i) in placeholders"
          :key="p.id"
          class="wx-surface p-5 space-y-2 stagger-item"
          :style="{ '--stagger-delay': i * 40 + 'ms' }"
        >
          <div class="flex items-center gap-2">
            <i :class="p.icon" class="text-[var(--wx-accent)] text-16px" />
            <h3 class="text-sm font-bold">{{ p.label }}</h3>
            <span class="text-[10px] text-[var(--wx-t3)] font-mono ml-auto"
              >v1.2.0 阶段 {{ 2 + Math.floor(i / 2) }}</span
            >
          </div>
          <p class="text-[11px] text-[var(--wx-t2)] font-mono">{{ p.sub }}</p>
        </div>
      </section>
    </div>
  </div>
</template>
