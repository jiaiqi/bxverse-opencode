<script setup lang="ts">
// StatusBadge.vue —— 状态徽标统一实现（禁止散落自绘）

import type { LogState } from '@bxverse/shared'

const props = withDefaults(defineProps<{
  type?: 'changed' | 'dirty' | 'local' | 'version' | 'pushed' | 'scheme' | 'bump' | 'error' | 'log'
  label?: string
  logState?: LogState
  count?: number
  pushed?: boolean
  bump?: string
}>(), {
  type: undefined,
})

const style = computed(() => {
  if (props.type === 'log' || props.logState) {
    const s = props.logState
    if (s === 'confirmed') return { cls: 'chip text-success border-success/30 bg-success-soft', text: '已确认' }
    if (s === 'edited') return { cls: 'chip chip-info', text: '已编辑' }
    return { cls: 'chip', text: '自动草稿' }
  }
  switch (props.type) {
    case 'changed':
      return { cls: 'chip chip-brand', text: `${props.count ?? 0} 提交` }
    case 'dirty':
      return { cls: 'chip chip-error', text: `未提交 ${props.count ?? 0}` }
    case 'local':
      return { cls: 'chip', text: '纯本地' }
    case 'version':
      return { cls: 'chip', text: props.label ?? '' }
    case 'pushed':
      return props.pushed
        ? { cls: 'chip text-success border-success/30 bg-success-soft', text: '已推送' }
        : { cls: 'chip chip-warn', text: '未推送' }
    case 'scheme':
      return { cls: 'chip', text: props.label ?? '' }
    case 'bump':
      return props.bump === 'major'
        ? { cls: 'chip chip-brand', text: '重大' }
        : props.bump === 'minor'
          ? { cls: 'chip chip-info', text: '次版本' }
          : { cls: 'chip', text: '补丁' }
    case 'error':
      return { cls: 'chip chip-error', text: '失败' }
    default:
      return { cls: 'chip', text: props.label ?? '' }
  }
})
</script>

<template>
  <span :class="style.cls">
    <i
      v-if="type === 'changed'"
      aria-hidden="true"
      class="i-carbon-git-commit"
    />
    <i
      v-else-if="type === 'dirty'"
      aria-hidden="true"
      class="i-carbon-warning-alt"
    />
    <i
      v-else-if="type === 'local'"
      aria-hidden="true"
      class="i-carbon-cloud-off"
    />
    <i
      v-else-if="type === 'pushed' && pushed"
      aria-hidden="true"
      class="i-carbon-cloud-upload"
    />
    <i
      v-else-if="type === 'error'"
      aria-hidden="true"
      class="i-carbon-error"
    />
    {{ style.text }}
  </span>
</template>
