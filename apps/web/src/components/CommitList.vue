<script setup lang="ts">
// CommitList.vue —— 提交列表（类型图标/分类 chip/文件折叠）

import type { CommitInfo } from '@bxverse/shared'
import { COMMIT_TYPE_LABELS } from '@bxverse/shared'
import { COMMIT_TYPE_ICONS } from '../constants/icons'

const props = withDefaults(defineProps<{
  commits: CommitInfo[]
  showFiles?: boolean
  max?: number
}>(), {
  showFiles: true,
  max: undefined,
})

const emit = defineEmits<{ copy: [hash: string] }>()

const visible = computed(() => {
  const list = props.commits
  return props.max && list.length > props.max ? list.slice(0, props.max) : list
})
const hiddenCount = computed(() =>
  props.max ? Math.max(0, props.commits.length - props.max) : 0,
)
const expanded = ref(false)
const expandedFiles = ref<Set<string>>(new Set())

function toggleFiles(hash: string) {
  const next = new Set(expandedFiles.value)
  if (next.has(hash)) next.delete(hash)
  else next.add(hash)
  expandedFiles.value = next
}
</script>

<template>
  <div class="space-y-1">
    <div
      v-for="c in expanded ? commits : visible"
      :key="c.fullHash + c.subject"
      class="rounded-md px-2.5 py-2 hover:bg-surface-hover transition-colors duration-150"
    >
      <div class="flex items-center gap-2 min-w-0">
        <i class="text-14px shrink-0" :class="[COMMIT_TYPE_ICONS[c.type], c.breaking ? 'text-error' : 'text-text-3']" />
        <span class="chip shrink-0">{{ COMMIT_TYPE_LABELS[c.type] }}</span>
        <span v-if="c.scope" class="chip shrink-0 text-text-3">{{ c.scope }}</span>
        <span class="flex-1 truncate text-text-1 text-sm" :title="c.subject">
          {{ c.subject }}
        </span>
        <span v-if="c.breaking" class="chip shrink-0 text-error border-error/30 bg-error-soft">BREAKING</span>
        <span
          class="code-text text-text-3 shrink-0 cursor-pointer hover:text-brand-500 transition-colors duration-150"
          :title="c.fullHash"
          @click="emit('copy', c.fullHash)"
        >{{ c.hash.slice(0, 7) }}</span>
        <span class="text-xs text-text-3 shrink-0 hidden sm:inline">{{ c.author }} · {{ c.date }}</span>
        <i
          v-if="showFiles && c.files.length"
          class="i-carbon-chevron-down text-text-3 cursor-pointer transition-transform duration-150 shrink-0"
          :class="{ 'rotate-180': expandedFiles.has(c.fullHash) }"
          @click="toggleFiles(c.fullHash)"
        />
      </div>
      <div v-if="showFiles && expandedFiles.has(c.fullHash)" class="ml-7 mt-1.5 space-y-0.5">
        <div v-for="f in c.files" :key="f" class="flex items-center gap-1.5 text-xs text-text-3">
          <i class="i-carbon-document" />
          <span class="code-text truncate">{{ f }}</span>
        </div>
      </div>
    </div>
    <div v-if="hiddenCount && !expanded" class="text-center py-1">
      <button class="link text-sm" @click="expanded = true">展开全部 {{ hiddenCount }} 条</button>
    </div>
    <div v-if="hiddenCount && expanded" class="text-center py-1">
      <button class="link text-sm" @click="expanded = false">收起</button>
    </div>
  </div>
</template>
