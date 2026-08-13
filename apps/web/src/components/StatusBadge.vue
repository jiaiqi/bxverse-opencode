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
    if (s === 'confirmed') return { cls: 'text-success border-success/30 bg-success-soft', text: '已确认' }
    if (s === 'edited') return { cls: 'text-info border-info/30 bg-info-soft', text: '已编辑' }
    return { cls: 'text-text-3', text: '自动草稿' }
  }
  switch (props.type) {
    case 'changed':
      return { cls: 'text-brand-600 border-brand-200 bg-brand-soft', text: `${props.count ?? 0} 提交` }
    case 'dirty':
      return { cls: 'text-error border-error/30 bg-error-soft', text: `未提交 ${props.count ?? 0}` }
    case 'local':
      return { cls: 'text-text-3', text: '纯本地' }
    case 'version':
      return { cls: 'text-text-2', text: props.label ?? '' }
    case 'pushed':
      return props.pushed
        ? { cls: 'text-success border-success/30 bg-success-soft', text: '已推送' }
        : { cls: 'text-warning border-warning/30 bg-warning-soft', text: '未推送' }
    case 'scheme':
      return { cls: 'text-text-3', text: props.label ?? '' }
    case 'bump':
      return props.bump === 'major'
        ? { cls: 'text-brand-600 border-brand-200 bg-brand-soft', text: '重大' }
        : props.bump === 'minor'
          ? { cls: 'text-info border-info/30 bg-info-soft', text: '次版本' }
          : { cls: 'text-text-3', text: '补丁' }
    case 'error':
      return { cls: 'text-error border-error/30 bg-error-soft', text: '失败' }
    default:
      return { cls: 'text-text-3', text: props.label ?? '' }
  }
})
</script>

<template>
  <span class="chip" :class="style.cls">
    <i
      v-if="type === 'changed'"
      class="i-carbon-git-commit"
    />
    <i
      v-else-if="type === 'dirty'"
      class="i-carbon-warning-alt"
    />
    <i
      v-else-if="type === 'local'"
      class="i-carbon-cloud-off"
    />
    <i
      v-else-if="type === 'pushed' && pushed"
      class="i-carbon-cloud-upload"
    />
    <i
      v-else-if="type === 'error'"
      class="i-carbon-error"
    />
    {{ style.text }}
  </span>
</template>
