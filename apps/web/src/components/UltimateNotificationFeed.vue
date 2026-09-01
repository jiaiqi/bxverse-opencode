<script setup lang="ts">
// UltimateNotificationFeed.vue —— design v2.0 ULTIMATE 8 区：通知流
// 数据：api.opsLogs('all') 最近 5 条 → 按 level 映射 dot 绿/红
// 视觉：列表 + dot 状态 + 文本 + 时间戳

import { computed, onMounted, ref } from 'vue'
import { api } from '../api'

interface LogLine {
  ts: string
  level: string
  message: string
  fields?: Record<string, unknown>
}

const lines = ref<LogLine[]>([])
const loading = ref(false)

async function load(): Promise<void> {
  loading.value = true
  try {
    const r = await api.opsLogs('all')
    lines.value = r.lines.slice(-5).reverse()
  } catch {
    lines.value = []
  } finally {
    loading.value = false
  }
}
onMounted(() => {
  void load()
})

function dotOf(level: string): 'ok' | 'fail' {
  return level === 'error' || level === 'warn' ? 'fail' : 'ok'
}
function shortTime(ts: string): string {
  // HH:MM:SS
  const m = ts.match(/(\d{2}:\d{2}:\d{2})/)
  return m ? m[1] : ts
}
const hasAny = computed(() => lines.value.length > 0)
</script>

<template>
  <section class="wx-surface p-5 space-y-3" role="region" aria-label="通知流">
    <header class="flex items-center justify-between">
      <h3 class="text-[15px] font-semibold flex items-center gap-2" style="color: var(--wx-t1)">
        <i aria-hidden="true" class="i-carbon-notification text-[var(--wx-warn)]" />
        通知流
        <span
          v-if="hasAny"
          class="text-[10px] font-mono px-1.5 py-0.5 rounded"
          style="background-color: var(--wx-bg-elev); color: var(--wx-t3)"
        >
          {{ lines.length }} 条
        </span>
      </h3>
    </header>

    <div
      v-if="loading && !lines.length"
      class="text-[11px] font-mono text-center py-4"
      style="color: var(--wx-t3)"
    >
      加载中…
    </div>
    <div v-else-if="!hasAny" class="text-[12px] text-center py-4" style="color: var(--wx-t3)">
      暂无通知
    </div>
    <ul v-else>
      <li
        v-for="(l, i) in lines"
        :key="i"
        class="flex gap-2.5 py-2"
        :class="i < lines.length - 1 ? 'border-b' : ''"
        style="border-color: var(--wx-border)"
      >
        <span class="wx-dot" :class="dotOf(l.level)" aria-hidden="true" />
        <div class="flex-1 min-w-0">
          <div class="text-[12px] truncate" style="color: var(--wx-t2)">
            {{ l.message }}
          </div>
          <div class="text-[10px] font-mono mt-0.5" style="color: var(--wx-t3)">
            {{ l.level }} · {{ shortTime(l.ts) }}
          </div>
        </div>
      </li>
    </ul>
  </section>
</template>
