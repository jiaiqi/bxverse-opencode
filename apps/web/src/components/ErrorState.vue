<script setup lang="ts">
// ErrorState.vue —— 错误态统一组件（对齐 EmptyState 家族）

withDefaults(
  defineProps<{
    icon?: string
    title: string
    reason?: string
    hint?: string
  }>(),
  {
    icon: 'i-carbon-warning',
  },
)
</script>

<template>
  <div class="empty-wrap">
    <div class="e-ic e-ic-error">
      <i aria-hidden="true" class="text-24px" :class="icon" />
    </div>
    <div class="text-base font-semibold text-text-1">{{ title }}</div>
    <div v-if="reason" class="text-sm text-text-2 max-w-md font-mono break-all">{{ reason }}</div>
    <div v-if="hint" class="text-xs text-text-3 max-w-md">{{ hint }}</div>
    <div class="flex items-center gap-2 mt-2">
      <slot name="actions" />
      <slot />
    </div>
  </div>
</template>
