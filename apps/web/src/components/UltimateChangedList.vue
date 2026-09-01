<script setup lang="ts">
// UltimateChangedList.vue —— design v2.0 ULTIMATE 待发布变动 list（5 仓 + 提交数 + 分支 + 版本 chip + 红字未提交改动）
// 数据来源：OverviewData.changedRepos（projects/{id}/overview 端点）

import { computed } from 'vue'
import { useProjectsStore } from '../stores/projects'
import type { OverviewData } from '@bxverse/shared'

const props = defineProps<{
  changedRepos: OverviewData['changedRepos']
}>()

const projectsStore = useProjectsStore()

const grouped = computed(() => {
  // 5 仓以内显示（按 commits 数降序）
  const sorted = [...props.changedRepos].sort((a, b) => b.commits - a.commits).slice(0, 5)
  return sorted.map((r) => ({
    ...r,
    projectName: projectsStore.items.find((p) => p.id === r.projectId)?.name ?? r.projectName,
  }))
})
</script>

<template>
  <section class="wx-surface p-5 space-y-3" role="region" aria-label="待发布变动">
    <header class="flex items-center justify-between mb-1">
      <h3 class="text-[14px] font-semibold flex items-center gap-2" style="color: var(--wx-t1)">
        <i aria-hidden="true" class="i-carbon-document-multiple text-[var(--wx-accent)]" />
        待发布变动
        <span
          v-if="grouped.length"
          class="text-[10px] font-mono px-1.5 py-0.5 rounded"
          style="background-color: var(--wx-accent-soft); color: var(--wx-accent)"
        >
          {{ grouped.length }} 仓
        </span>
      </h3>
      <RouterLink
        to="/feed"
        class="text-[11px] no-underline transition-colors"
        style="color: var(--wx-accent)"
        title="跳到跨项目 feed 看完整变更"
      >
        跨项目 feed →
      </RouterLink>
    </header>

    <ul v-if="grouped.length" class="divide-y" style="border-color: var(--wx-border)">
      <li
        v-for="r in grouped"
        :key="r.repoId"
        class="flex items-center gap-3 py-2.5 px-2 rounded transition-colors"
        style="border-color: var(--wx-border)"
      >
        <span
          class="w-2 h-2 rounded-full shrink-0"
          style="background-color: var(--wx-accent)"
          :class="r.commits > 0 ? 'animate-pulse' : ''"
          aria-hidden="true"
        />
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-[12px] font-medium" style="color: var(--wx-t1)">
              {{ r.repoName }}
            </span>
            <span class="text-[10px] font-mono" style="color: var(--wx-t3)">
              · {{ r.projectName }}
            </span>
          </div>
          <div class="text-[10px] font-mono mt-0.5" style="color: var(--wx-t3)">
            {{ r.commits }} 个新提交 · head
            <code class="font-mono" style="color: var(--wx-t2)">{{ r.head.slice(0, 7) }}</code>
          </div>
        </div>
        <RouterLink
          :to="`/repo/${r.projectId}/${r.repoId}`"
          class="px-2 py-1 rounded text-[10px] font-mono no-underline border transition-colors"
          style="border-color: var(--wx-border); color: var(--wx-t1)"
          :title="`打开仓库 ${r.repoName}`"
        >
          分支巡检 →
        </RouterLink>
      </li>
    </ul>

    <div v-else class="text-[12px] text-center py-6" style="color: var(--wx-t3)">
      暂无待发布变动
    </div>
  </section>
</template>
