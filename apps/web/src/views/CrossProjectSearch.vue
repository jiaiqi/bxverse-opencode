<script setup lang="ts">
// CrossProjectSearch.vue —— C 方向 跨项目搜索视图
// 搜索框 + 类型 chip 切换 + 结果列表（CrossProjectCard 复用）

import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api'
import type { CrossSearchResponse, CrossSearchType } from '@bxverse/shared'
import PageHeader from '../components/PageHeader.vue'
import CrossProjectCard from '../components/CrossProjectCard.vue'
import EmptyState from '../components/EmptyState.vue'
import LoadingState from '../components/LoadingState.vue'
import ErrorState from '../components/ErrorState.vue'

const route = useRoute()
const router = useRouter()

const query = ref(String(route.query.q ?? ''))
const type = ref<CrossSearchType>((route.query.type as CrossSearchType) || 'name')

const loading = ref(false)
const error = ref<string | null>(null)
const result = ref<CrossSearchResponse | null>(null)

const TYPE_OPTIONS: { value: CrossSearchType; label: string; hint: string }[] = [
  { value: 'name', label: '按名称', hint: '项目名/仓库名/displayName' },
  { value: 'commit', label: '按 commit', hint: 'commit hash 前缀（≥7 位）' },
  { value: 'version', label: '按版本', hint: '精确匹配 X.Y.Z / vX.Y.Z' },
]

let debounceHandle: ReturnType<typeof setTimeout> | null = null

async function runSearch(): Promise<void> {
  const q = query.value.trim()
  if (!q) {
    result.value = null
    error.value = null
    return
  }
  loading.value = true
  error.value = null
  try {
    result.value = await api.crossSearch(q, type.value)
  } catch (e) {
    error.value = (e as Error).message
    result.value = null
  } finally {
    loading.value = false
  }
}

function onInput(): void {
  // URL 同步（防抖后）
  if (debounceHandle) clearTimeout(debounceHandle)
  debounceHandle = setTimeout(() => {
    const next: Record<string, string> = {}
    if (query.value.trim()) next.q = query.value.trim()
    if (type.value !== 'name') next.type = type.value
    router.replace({ query: next })
  }, 300)
  // 搜索防抖
  if (debounceHandle) clearTimeout(debounceHandle)
  debounceHandle = setTimeout(() => void runSearch(), 400)
}

function setType(t: CrossSearchType): void {
  type.value = t
  onInput()
}

// 初始化：URL 有 q 直接搜
if (query.value.trim()) void runSearch()

// 路由 query 变化（如外部跳转）→ 重新搜
watch(
  () => route.query,
  (q) => {
    const newQ = String(q.q ?? '')
    const newType = (q.type as CrossSearchType) || 'name'
    if (newQ !== query.value) {
      query.value = newQ
      void runSearch()
    }
    if (newType !== type.value) type.value = newType
  },
)

const hasQuery = computed(() => query.value.trim().length > 0)
</script>

<template>
  <div class="flex flex-col gap-6 p-6 max-w-4xl mx-auto">
    <PageHeader title="跨项目搜索" subtitle="按 commit hash / 版本号 / 名称 在所有项目里查找" />

    <!-- 搜索框 + 类型 chip -->
    <div class="flex flex-col gap-3">
      <div class="flex items-center gap-2">
        <div class="i-carbon-search text-text-3 text-lg" aria-hidden="true" />
        <input
          v-model="query"
          type="search"
          placeholder="输入 commit / version / 项目或仓库名…"
          class="flex-1 px-3 py-2 rounded-lg border border-border bg-surface text-sm font-mono focus:outline-none focus:border-brand-500 transition-colors"
          autocomplete="off"
          spellcheck="false"
          aria-label="跨项目搜索关键字"
          @input="onInput"
        />
      </div>
      <div class="flex items-center gap-2">
        <span class="text-[11px] text-text-3">类型：</span>
        <button
          v-for="opt in TYPE_OPTIONS"
          :key="opt.value"
          type="button"
          class="px-3 py-1 rounded-md text-xs font-medium border transition-colors"
          :class="
            type === opt.value
              ? 'border-brand-500 bg-brand-soft text-brand-500'
              : 'border-border bg-surface text-text-2 hover:border-border-strong'
          "
          :aria-pressed="type === opt.value"
          :title="opt.hint"
          @click="setType(opt.value)"
        >
          {{ opt.label }}
        </button>
        <span v-if="result" class="ml-auto text-[11px] text-text-3">
          {{ result.tookMs }}ms · {{ result.total }} 条结果
        </span>
      </div>
    </div>

    <!-- 状态：加载/错误/空/结果 -->
    <LoadingState v-if="loading" message="搜索中…" />
    <ErrorState v-else-if="error" title="搜索失败" :reason="error" :retry="runSearch" />
    <EmptyState
      v-else-if="!hasQuery"
      icon="i-carbon-search"
      title="输入关键字开始搜索"
      description="支持按 commit hash 前缀、版本号（X.Y.Z）、项目/仓库名搜索。结果实时聚合所有项目。"
    />
    <EmptyState
      v-else-if="result && result.total === 0"
      icon="i-carbon-document"
      title="无匹配结果"
      :description="`未找到「${query}」（类型：${type}）的匹配项`"
    />
    <div v-else-if="result" class="flex flex-col gap-2">
      <CrossProjectCard
        v-for="(r, i) in result.results"
        :key="`${r.projectId}-${r.repoId ?? ''}-${r.commit ?? r.version ?? r.repoName ?? ''}-${i}`"
        :result="r"
      />
    </div>
  </div>
</template>
