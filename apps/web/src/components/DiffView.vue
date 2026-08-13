<script setup lang="ts">
// DiffView.vue —— 行级 diff（before=自动草稿 / after=当前内容）

import { diffLines } from '../utils/diff'

const props = withDefaults(defineProps<{
  before: string
  after: string
  labelBefore?: string
  labelAfter?: string
}>(), {
  labelBefore: '自动草稿',
  labelAfter: '当前内容',
})

const diff = computed(() => diffLines(props.before, props.after))
const stats = computed(() => {
  let add = 0
  let del = 0
  for (const d of diff.value) {
    if (d.type === 'add') add++
    else if (d.type === 'del') del++
  }
  return { add, del }
})
</script>

<template>
  <div class="border border-border rounded-md overflow-hidden">
    <div class="flex items-center gap-3 px-3 py-2 bg-surface-alt border-b border-border text-xs">
      <span class="text-text-3">{{ labelBefore }}</span>
      <span class="text-text-3">→</span>
      <span class="text-text-1">{{ labelAfter }}</span>
      <span class="flex-1" />
      <span class="chip text-success border-success/30 bg-success-soft">+{{ stats.add }}</span>
      <span class="chip text-error border-error/30 bg-error-soft">-{{ stats.del }}</span>
    </div>
    <div class="max-h-100 overflow-auto py-1">
      <div
        v-for="(d, i) in diff"
        :key="i"
        class="flex px-3 font-mono text-13px leading-6"
        :class="d.type === 'add' ? 'bg-success-soft' : d.type === 'del' ? 'bg-error-soft' : ''"
      >
        <span class="w-10 shrink-0 text-right pr-2 text-text-3 select-none">{{ i + 1 }}</span>
        <span class="w-4 shrink-0 text-center select-none" :class="d.type === 'add' ? 'text-success' : d.type === 'del' ? 'text-error' : 'text-text-3'">
          {{ d.type === 'add' ? '+' : d.type === 'del' ? '-' : ' ' }}
        </span>
        <span class="flex-1 whitespace-pre-wrap break-all" :class="d.type === 'del' ? 'text-error line-through decoration-error/50' : 'text-text-1'">{{ d.line || ' ' }}</span>
      </div>
    </div>
  </div>
</template>
