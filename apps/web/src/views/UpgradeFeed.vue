<script setup lang="ts">
// UpgradeFeed.vue —— D 方向 跨项目升级日志聚合页
// 顶部 timeline mini（近 30 天 / 周 / 月分桶）+ 聚合统计 + feed 列表（按时间倒序）+ 导出按钮

import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api'
import type { AggregateGranularity } from '@bxverse/shared'
import PageHeader from '../components/PageHeader.vue'
import ReleaseFeedCard from '../components/ReleaseFeedCard.vue'
import LoadingState from '../components/LoadingState.vue'
import ErrorState from '../components/ErrorState.vue'
import EmptyState from '../components/EmptyState.vue'

const route = useRoute()
const router = useRouter()

const granularity = ref<AggregateGranularity>(
  (route.query.granularity as AggregateGranularity) || 'day',
)
const days = ref<number>(Number(route.query.days) || 30)
const projectId = ref<string>((route.query.projectId as string) || '')

const timelineLoading = ref(false)
const timeline = ref<Awaited<ReturnType<typeof api.aggregateTimeline>> | null>(null)
const timelineError = ref<string | null>(null)

const feedLoading = ref(false)
const feed = ref<Awaited<ReturnType<typeof api.aggregateFeed>> | null>(null)
const feedError = ref<string | null>(null)

const projects = ref<Array<{ id: string; name: string }>>([])

async function loadTimeline(): Promise<void> {
  timelineLoading.value = true
  timelineError.value = null
  try {
    timeline.value = await api.aggregateTimeline({
      granularity: granularity.value,
      days: days.value,
      projectId: projectId.value || undefined,
    })
  } catch (e) {
    timelineError.value = (e as Error).message
  } finally {
    timelineLoading.value = false
  }
}

async function loadFeed(): Promise<void> {
  feedLoading.value = true
  feedError.value = null
  try {
    feed.value = await api.aggregateFeed({
      projectId: projectId.value || undefined,
      limit: 50,
    })
  } catch (e) {
    feedError.value = (e as Error).message
  } finally {
    feedLoading.value = false
  }
}

async function loadProjects(): Promise<void> {
  try {
    const list = await api.projects()
    projects.value = list.map((p) => ({ id: p.id, name: p.name }))
  } catch {
    // 静默失败：项目下拉是可选的
  }
}

function syncUrl(): void {
  const next: Record<string, string> = {}
  if (granularity.value !== 'day') next.granularity = granularity.value
  if (days.value !== 30) next.days = String(days.value)
  if (projectId.value) next.projectId = projectId.value
  router.replace({ query: next })
}

function reload(): void {
  syncUrl()
  void loadTimeline()
  void loadFeed()
}

function setGranularity(g: AggregateGranularity): void {
  granularity.value = g
  reload()
}

function setDays(d: number): void {
  days.value = d
  reload()
}

function setProjectId(id: string): void {
  projectId.value = id
  reload()
}

const maxBucketCount = computed(() => {
  if (!timeline.value || timeline.value.buckets.length === 0) return 1
  return Math.max(1, ...timeline.value.buckets.map((b) => b.count))
})

const exportUrl = computed(
  () =>
    api.aggregateExportUrl({
      projectId: projectId.value || undefined,
      format: 'md',
    }) + `&days=${days.value}`,
)

onMounted(() => {
  void loadProjects()
  void loadTimeline()
  void loadFeed()
})

// 路由 query 变化（外部跳转）→ 重新加载
watch(
  () => route.query,
  (q) => {
    const newG = (q.granularity as AggregateGranularity) || 'day'
    const newDays = Number(q.days) || 30
    const newProj = (q.projectId as string) || ''
    if (newG !== granularity.value) granularity.value = newG
    if (newDays !== days.value) days.value = newDays
    if (newProj !== projectId.value) projectId.value = newProj
    void loadTimeline()
    void loadFeed()
  },
)
</script>

<template>
  <div class="flex flex-col gap-6 p-6 max-w-5xl mx-auto">
    <PageHeader title="升级日志聚合" subtitle="跨项目发布历史 · 时间线 · 导出">
      <template #actions>
        <a
          :href="exportUrl"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-border bg-surface hover:border-brand-500 hover:text-brand-500 transition-colors"
          title="导出近 N 天的发布日志为 Markdown"
        >
          <i aria-hidden="true" class="i-carbon-download text-13px" />
          导出 .md
        </a>
      </template>
    </PageHeader>

    <!-- 过滤行：granularity + days + project -->
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-[11px] text-text-3">粒度：</span>
      <button
        v-for="g in ['day', 'week', 'month'] as AggregateGranularity[]"
        :key="g"
        type="button"
        class="px-3 py-1 rounded-md text-xs font-medium border transition-colors"
        :class="
          granularity === g
            ? 'border-brand-500 bg-brand-soft text-brand-500'
            : 'border-border bg-surface text-text-2 hover:border-border-strong'
        "
        :aria-pressed="granularity === g"
        @click="setGranularity(g)"
      >
        {{ g === 'day' ? '日' : g === 'week' ? '周' : '月' }}
      </button>
      <span class="text-[11px] text-text-3 ml-2">范围：</span>
      <button
        v-for="d in [7, 30, 90, 365]"
        :key="d"
        type="button"
        class="px-3 py-1 rounded-md text-xs font-medium border transition-colors"
        :class="
          days === d
            ? 'border-brand-500 bg-brand-soft text-brand-500'
            : 'border-border bg-surface text-text-2 hover:border-border-strong'
        "
        :aria-pressed="days === d"
        @click="setDays(d)"
      >
        近 {{ d }} 天
      </button>
      <span class="text-[11px] text-text-3 ml-2">项目：</span>
      <select
        :value="projectId"
        class="px-2 py-1 rounded-md text-xs border border-border bg-surface text-text-2 focus:outline-none focus:border-brand-500"
        aria-label="按项目过滤"
        @change="setProjectId(($event.target as HTMLSelectElement).value)"
      >
        <option value="">全部</option>
        <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>
    </div>

    <!-- Timeline mini -->
    <section class="p-4 rounded-xl border border-border bg-surface">
      <header class="flex items-center justify-between mb-3">
        <h2 class="text-sm font-bold text-text-1">发布频率</h2>
        <span v-if="timeline" class="text-[11px] text-text-3">
          {{ timeline.total }} 次发布 · {{ timeline.projectCount }} 个项目
        </span>
      </header>
      <LoadingState v-if="timelineLoading" compact />
      <ErrorState
        v-else-if="timelineError"
        title="时间线加载失败"
        :reason="timelineError"
        :retry="loadTimeline"
      />
      <div v-else-if="timeline && timeline.buckets.length > 0" class="flex items-end gap-1 h-24">
        <div
          v-for="b in timeline.buckets"
          :key="b.key"
          class="flex-1 flex flex-col items-center gap-1 min-w-0"
          :title="`${b.key}: ${b.count} 次（${b.projectCount} 项目）`"
        >
          <div
            class="w-full bg-brand-500 rounded-t transition-[height] duration-base"
            :style="{
              height: `${(b.count / maxBucketCount) * 100}%`,
              minHeight: b.count > 0 ? '2px' : '0',
            }"
          />
          <span class="text-[9px] text-text-3 truncate w-full text-center font-mono">{{
            b.key.slice(-5)
          }}</span>
        </div>
      </div>
      <EmptyState
        v-else
        icon="i-carbon-chart-histogram"
        title="时间线暂无数据"
        description="所选范围内没有发布记录"
      />
    </section>

    <!-- Feed 列表 -->
    <section class="flex flex-col gap-3">
      <header class="flex items-center justify-between">
        <h2 class="text-sm font-bold text-text-1">发布历史</h2>
        <span v-if="feed" class="text-[11px] text-text-3">
          共 {{ feed.total }} 条 · {{ feed.tookMs }}ms
        </span>
      </header>
      <LoadingState v-if="feedLoading" />
      <ErrorState
        v-else-if="feedError"
        title="Feed 加载失败"
        :reason="feedError"
        :retry="loadFeed"
      />
      <EmptyState
        v-else-if="feed && feed.items.length === 0"
        icon="i-carbon-document"
        title="所选范围无发布记录"
        description="试试扩大时间范围或切换粒度"
      />
      <div v-else-if="feed" class="flex flex-col gap-3">
        <ReleaseFeedCard v-for="it in feed.items" :key="it.releaseId" :item="it" />
      </div>
    </section>
  </div>
</template>
