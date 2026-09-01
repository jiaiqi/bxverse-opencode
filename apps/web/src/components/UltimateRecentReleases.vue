<script setup lang="ts">
// UltimateRecentReleases.vue —— design v2.0 ULTIMATE 6 区：最近 4 条 release
// 数据：api.aggregateFeed({limit: 4})
// 视觉：4 行 + icon (check/ban/alert) + 版本 + 日期 + 仓数

import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { api } from '../api'
import type { AggregateFeedItem } from '@bxverse/shared'

const items = ref<AggregateFeedItem[]>([])
const loading = ref(false)

async function load(): Promise<void> {
  loading.value = true
  try {
    const r = await api.aggregateFeed({ limit: 4 })
    items.value = r.items.slice(0, 4)
  } catch {
    items.value = []
  } finally {
    loading.value = false
  }
}
onMounted(() => {
  void load()
})

function statusOf(it: AggregateFeedItem): 'ok' | 'deprecated' {
  // AggregateFeedItem 仅有 deprecated 字段；failed 由 deprecated 间接表达（已废 = 失败回退）
  if (it.deprecated) return 'deprecated'
  return 'ok'
}
function iconOf(s: ReturnType<typeof statusOf>): string {
  return s === 'deprecated' ? 'i-carbon-ban' : 'i-carbon-checkmark-outline'
}
function colorOf(s: ReturnType<typeof statusOf>): string {
  return s === 'deprecated' ? 'var(--wx-t3)' : 'var(--wx-accent)'
}
function shortDate(iso: string): string {
  // 取 MM-DD 部分，避免长 ISO
  const m = iso.match(/(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}` : iso
}
const hasAny = computed(() => items.value.length > 0)
</script>

<template>
  <section class="wx-surface p-5 space-y-3" role="region" aria-label="最近发布">
    <header class="flex items-center justify-between">
      <h3 class="text-[13px] font-semibold flex items-center gap-2" style="color: var(--wx-t1)">
        <i aria-hidden="true" class="i-carbon-checkmark-outline text-[var(--wx-accent)]" />
        最近发布
        <span
          v-if="hasAny"
          class="text-[10px] font-mono px-1.5 py-0.5 rounded"
          style="background-color: var(--wx-bg-elev); color: var(--wx-t3)"
        >
          {{ items.length }} 条
        </span>
      </h3>
      <RouterLink
        to="/feed"
        class="text-[11px] no-underline transition-colors"
        style="color: var(--wx-accent)"
        title="跳到跨项目 feed"
      >
        跨项目 feed →
      </RouterLink>
    </header>

    <div
      v-if="loading && !items.length"
      class="text-[11px] font-mono text-center py-4"
      style="color: var(--wx-t3)"
    >
      加载中…
    </div>
    <div v-else-if="!hasAny" class="text-[12px] text-center py-4" style="color: var(--wx-t3)">
      暂无发布记录
    </div>
    <ul v-else class="divide-y" style="border-color: var(--wx-border)">
      <li
        v-for="it in items"
        :key="it.releaseId"
        class="wx-row flex items-center gap-3 py-2 px-1.5"
      >
        <i
          aria-hidden="true"
          :class="iconOf(statusOf(it))"
          :style="{ color: colorOf(statusOf(it)) }"
        />
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span
              class="font-mono text-[12px] truncate"
              :style="{
                color: statusOf(it) === 'deprecated' ? 'var(--wx-t3)' : 'var(--wx-t1)',
                textDecoration: statusOf(it) === 'deprecated' ? 'line-through' : 'none',
              }"
            >
              {{ it.version }}
            </span>
            <span class="text-[10px] font-mono truncate" style="color: var(--wx-t3)">
              · {{ it.projectName }}
            </span>
          </div>
          <div class="text-[10px] font-mono mt-0.5" style="color: var(--wx-t3)">
            {{ shortDate(it.date) }} · {{ it.repos.length }} 仓 · {{ it.commitCount }} 提交
          </div>
        </div>
        <RouterLink
          :to="`/project/${it.projectId}/releases`"
          class="text-[10px] font-mono no-underline"
          style="color: var(--wx-accent)"
          :title="`打开项目 ${it.projectName}`"
        >
          查看 →
        </RouterLink>
      </li>
    </ul>
  </section>
</template>
