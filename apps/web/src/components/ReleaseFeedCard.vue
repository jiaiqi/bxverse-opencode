<script setup lang="ts">
// ReleaseFeedCard.vue —— D 方向 跨项目升级日志单条卡片
// 项目徽标 + 版本 + 日期 + external 日志（MarkdownView 渲染）+ 展开/收起

import type { AggregateFeedItem } from '@bxverse/shared'
import { ref, computed } from 'vue'
import MarkdownView from './MarkdownView.vue'

const props = defineProps<{ item: AggregateFeedItem }>()

const expanded = ref(false)
const previewLength = 240

const previewContent = computed(() => {
  const c = props.item.externalContent
  if (c.length <= previewLength) return c
  return c.slice(0, previewLength) + '…'
})
const isLong = computed(() => props.item.externalContent.length > previewLength)
</script>

<template>
  <article
    class="p-4 rounded-xl border border-border bg-surface hover:border-border-strong transition-[border-color] duration-base"
  >
    <!-- 顶部：项目徽标 + 版本 + 日期 + 状态 -->
    <header class="flex items-center gap-3 mb-2">
      <div
        class="w-8 h-8 rounded-lg bg-brand-soft text-brand-500 flex items-center justify-center font-bold text-xs shrink-0 border border-brand-200"
      >
        {{ item.projectName.slice(0, 1) }}
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <code class="font-mono text-sm font-bold text-text-1">{{ item.version }}</code>
          <span class="text-text-3 text-xs">·</span>
          <RouterLink
            :to="`/project/${item.projectId}`"
            class="text-xs text-brand-500 hover:underline truncate max-w-[200px]"
          >
            {{ item.projectName }}
          </RouterLink>
          <span v-if="item.deprecated" class="chip chip-error text-[10px]" aria-label="已废弃"
            >已废弃</span
          >
        </div>
        <div class="text-[11px] text-text-3 mt-0.5">
          {{ item.date.slice(0, 10) }} · {{ item.commitCount }} 提交 · bump={{ item.bump }}
        </div>
      </div>
    </header>

    <!-- 涉及仓库 -->
    <div v-if="item.repos.length > 0" class="flex flex-wrap gap-1.5 mb-2">
      <RouterLink
        v-for="r in item.repos"
        :key="r.repoId"
        :to="`/repo/${item.projectId}/${r.repoId}`"
        class="font-mono text-[10px] px-1.5 py-0.5 rounded border border-border bg-surface-alt text-text-2 hover:border-brand-500 hover:text-brand-500 transition-colors"
      >
        {{ r.repoName }}@{{ r.version }}
      </RouterLink>
    </div>

    <!-- 外部日志（MarkdownView 渲染） -->
    <div class="text-text-2 text-xs leading-relaxed">
      <MarkdownView v-if="expanded || !isLong" :content="item.externalContent" />
      <template v-else>
        <MarkdownView :content="previewContent" />
        <button
          type="button"
          class="mt-2 text-brand-500 hover:underline text-[11px]"
          @click="expanded = true"
        >
          展开全文 →
        </button>
      </template>
      <button
        v-if="expanded && isLong"
        type="button"
        class="mt-2 text-text-3 hover:text-brand-500 text-[11px]"
        @click="expanded = false"
      >
        ← 收起
      </button>
    </div>
  </article>
</template>
