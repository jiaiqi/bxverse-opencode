<script setup lang="ts">
// CrossProjectCard.vue —— C 方向 跨项目搜索单条结果卡片
// 三种 type 展示不同字段：
//   commit: 短 hash + 所在 release + subject 摘要 + 跳 RepoDetail
//   version: 版本号 + 发布日期 + deprecated 标识 + 跳 ProjectDetail
//   name: 项目/仓库名 + 描述 + 跳对应目标

import type { CrossSearchResult } from '@bxverse/shared'
import { computed } from 'vue'

const props = defineProps<{ result: CrossSearchResult }>()

const projectLink = computed(() => `/project/${props.result.projectId}`)
const repoLink = computed(() =>
  props.result.projectId && props.result.repoId
    ? `/repo/${props.result.projectId}/${props.result.repoId}`
    : null,
)
const typeLabel = computed(() => {
  if (props.result.type === 'commit') return 'commit'
  if (props.result.type === 'version') return 'version'
  return 'name'
})
const typeColor = computed(() => {
  if (props.result.type === 'commit') return 'text-brand-500 border-brand-200 bg-brand-soft'
  if (props.result.type === 'version') return 'text-info border-info/30 bg-info-soft'
  return 'text-warn border-warn/30 bg-warn-soft'
})
</script>

<template>
  <div
    class="p-4 rounded-xl border border-border bg-surface hover:border-border-strong transition-[border-color,box-shadow] duration-base ease-spring flex items-start gap-4"
  >
    <!-- 类型 chip -->
    <span
      class="font-mono text-[10px] font-bold px-2 py-0.5 rounded border shrink-0 mt-0.5"
      :class="typeColor"
    >
      {{ typeLabel }}
    </span>

    <!-- 主内容 -->
    <div class="flex-1 min-w-0">
      <!-- commit 命中：短 hash + 仓库 -->
      <template v-if="result.type === 'commit'">
        <div class="flex items-center gap-2 mb-1">
          <code class="font-mono text-sm font-bold text-text-1">{{ result.shortCommit }}</code>
          <span class="text-text-3 text-xs">·</span>
          <RouterLink
            v-if="repoLink"
            :to="repoLink"
            class="text-xs text-brand-500 hover:underline truncate"
          >
            {{ result.repoName }}
          </RouterLink>
        </div>
        <div v-if="result.hint" class="text-[11px] text-text-3 truncate">
          {{ result.hint }}
        </div>
      </template>

      <!-- version 命中：版本号 + deprecated -->
      <template v-else-if="result.type === 'version'">
        <div class="flex items-center gap-2 mb-1">
          <code class="font-mono text-sm font-bold text-text-1">{{ result.version }}</code>
          <span v-if="result.hint?.includes('已废弃')" class="chip chip-error text-[10px]"
            >已废弃</span
          >
        </div>
        <div v-if="result.hint" class="text-[11px] text-text-3 truncate">
          {{ result.hint }}
        </div>
      </template>

      <!-- name 命中：项目/仓库名 -->
      <template v-else>
        <div class="flex items-center gap-2 mb-1">
          <span class="font-bold text-sm text-text-1 truncate">{{
            result.repoName ?? result.projectName
          }}</span>
        </div>
        <div v-if="result.hint" class="text-[11px] text-text-3 truncate">
          {{ result.hint }}
        </div>
      </template>
    </div>

    <!-- 右侧跳转：项目名 RouterLink -->
    <RouterLink
      :to="projectLink"
      class="text-[11px] text-text-3 hover:text-brand-500 transition-colors shrink-0 mt-0.5 max-w-[120px] truncate"
    >
      → {{ result.projectName }}
    </RouterLink>
  </div>
</template>
