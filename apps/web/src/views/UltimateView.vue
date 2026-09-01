<script setup lang="ts">
// UltimateView.vue —— design v2.0 ULTIMATE 原型完整驾驶舱视图（v1.2.0）
// 布局与 design 原型行 282-363 对应：
//   [KPI × 4] [KPI × 4] [KPI × 4] [KPI × 4]
//   [待发布变动 col-span-2] [近 8 周发布节奏 col-span-1] [最近发布 col-span-1]
//   [系统健康速览 col-span-2] [通知流 col-span-1]
// 主题：appStore.themeStyle 切 wenxi/indigo，tokens.css 派生 .wx-* 变量

import { computed, onMounted } from 'vue'
import { useProjectsStore } from '../stores/projects'
import UltimateTopBar from '../components/UltimateTopBar.vue'
import UltimateStatCard from '../components/UltimateStatCard.vue'
import UltimateChangedList from '../components/UltimateChangedList.vue'
import UltimateSparkline from '../components/UltimateSparkline.vue'
import UltimateRecentReleases from '../components/UltimateRecentReleases.vue'
import UltimateHealthGrid from '../components/UltimateHealthGrid.vue'
import UltimateNotificationFeed from '../components/UltimateNotificationFeed.vue'
import LoadingState from '../components/LoadingState.vue'

const projectsStore = useProjectsStore()
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
    class="flex flex-1 overflow-hidden flex-col"
    style="
      background-color: var(--wx-bg);
      background-image: radial-gradient(circle at 1px 1px, var(--wx-grid-dot) 1px, transparent 0);
      background-size: 24px 24px;
      color: var(--wx-t1);
    "
  >
    <!-- 顶栏：面包屑 + 队列空闲 + wenxi/indigo 切换 + 同步/快速发布/新建项目 -->
    <UltimateTopBar />

    <!-- 主区 -->
    <div class="flex-1 overflow-y-auto p-6 space-y-6 max-w-[1280px] w-full mx-auto">
      <!-- 4 张 KPI 主指标（design v2.0 行 291-298） -->
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

      <!-- 行 2：待发布变动 2/3 + sparkline 1/3 + 最近发布 1/3（design v2.0 行 300-342） -->
      <section class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div class="lg:col-span-2">
          <UltimateChangedList :changed-repos="overview?.changedRepos ?? []" />
        </div>
        <UltimateSparkline />
      </section>
      <section class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div class="lg:col-span-2">
          <UltimateHealthGrid />
        </div>
        <UltimateNotificationFeed />
      </section>

      <!-- 行 3：最近发布（独立完整 list，4 条，design v2.0 行 333-340 风格） -->
      <UltimateRecentReleases />
    </div>
  </div>
</template>
