<script setup lang="ts">
// UltimateSparkline.vue —— design v2.0 ULTIMATE 5 区：8 周发布节奏 SVG 折线
// 数据：api.overviewWeekly() → { weeks: [{week, releases, projects}], generatedAt }
// 视觉：260×70 SVG 渐变填充 + 描边 + W29/W36 标签 + 顶值统计

import { computed, onMounted, ref } from 'vue'
import { api } from '../api'

interface Week {
  week: string
  releases: number
  projects: number
}

const weeks = ref<Week[]>([])
const loading = ref(false)
const total = computed(() => weeks.value.reduce((s, w) => s + w.releases, 0))
const peak = computed(() => weeks.value.reduce((m, w) => (w.releases > m ? w.releases : m), 0))
const latest = computed(() => weeks.value.at(-1)?.releases ?? 0)

async function load(): Promise<void> {
  loading.value = true
  try {
    const r = await api.overviewWeekly()
    weeks.value = r.weeks
  } catch {
    weeks.value = []
  } finally {
    loading.value = false
  }
}
onMounted(() => {
  void load()
})

// SVG 折线路径（260×70 viewBox）
const VB_W = 260
const VB_H = 70
const PAD_Y = 8
const points = computed(() => {
  if (!weeks.value.length) return ''
  const max = Math.max(1, peak.value)
  const stepX = weeks.value.length > 1 ? VB_W / (weeks.value.length - 1) : VB_W
  return weeks.value
    .map((w, i) => {
      const x = i * stepX
      const y = VB_H - PAD_Y - (w.releases / max) * (VB_H - PAD_Y * 2)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' L')
})

const linePath = computed(() => (points.value ? `M${points.value}` : ''))
const areaPath = computed(() =>
  points.value ? `M${points.value} L${VB_W},${VB_H} L0,${VB_H} Z` : '',
)

const firstWeek = computed(() => weeks.value[0]?.week ?? '—')
const lastWeek = computed(() => weeks.value.at(-1)?.week ?? '—')
</script>

<template>
  <section class="wx-surface p-5 space-y-3" role="region" aria-label="近 8 周发布节奏">
    <header class="flex items-center justify-between">
      <h3 class="text-[13px] font-semibold flex items-center gap-2" style="color: var(--wx-t1)">
        <i aria-hidden="true" class="i-carbon-chart-line text-[var(--wx-info)]" />
        近 8 周发布节奏
        <span
          v-if="weeks.length"
          class="text-[10px] font-mono px-1.5 py-0.5 rounded"
          style="background-color: var(--wx-bg-elev); color: var(--wx-t3)"
        >
          {{ weeks.length }} 周
        </span>
      </h3>
      <span class="text-[10px] font-mono" style="color: var(--wx-t3)">
        合计 <span style="color: var(--wx-accent)">{{ total }}</span> · 峰值 {{ peak }}
      </span>
    </header>

    <div
      v-if="loading && !weeks.length"
      class="h-[70px] flex items-center justify-center text-[11px] font-mono"
      style="color: var(--wx-t3)"
    >
      加载中…
    </div>
    <div
      v-else-if="!weeks.length"
      class="h-[70px] flex items-center justify-center text-[11px] font-mono"
      style="color: var(--wx-t3)"
    >
      暂无周数据
    </div>
    <template v-else>
      <svg
        :viewBox="`0 0 ${VB_W} ${VB_H}`"
        class="w-full"
        preserveAspectRatio="none"
        aria-label="近 8 周发布折线"
        role="img"
      >
        <defs>
          <linearGradient id="wx-spark-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" :stop-color="`var(--wx-spark-stroke)`" stop-opacity="0.3" />
            <stop offset="1" :stop-color="`var(--wx-spark-stroke)`" stop-opacity="0" />
          </linearGradient>
        </defs>
        <path :d="areaPath" fill="url(#wx-spark-grad)" stroke="none" />
        <path
          :d="linePath"
          fill="none"
          stroke="var(--wx-spark-stroke)"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <div class="flex justify-between text-[10px] font-mono" style="color: var(--wx-t3)">
        <span>{{ firstWeek }}</span>
        <span>最新 {{ latest }} 次</span>
        <span>{{ lastWeek }}</span>
      </div>
    </template>
  </section>
</template>
