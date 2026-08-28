<script setup lang="ts">
// EmptyState.vue —— 空状态引导
// 注意：action 事件不声明为 emits，父组件 @action 监听器才能落在 $attrs.onAction 上，
// 默认按钮据此只在父组件传入 @action 时渲染（修复旧版 v-if="emit" 恒真导致的无动作按钮）。

withDefaults(
  defineProps<{
    icon?: string
    title: string
    description?: string
  }>(),
  {
    icon: 'i-carbon-cube',
  },
)
</script>

<template>
  <div class="empty-wrap">
    <div class="e-ic">
      <i aria-hidden="true" class="text-24px" :class="icon" />
    </div>
    <div class="text-base font-semibold text-text-1">{{ title }}</div>
    <div v-if="description" class="text-sm text-text-3 max-w-md">{{ description }}</div>
    <slot name="action">
      <button v-if="$attrs.onAction" class="btn-primary mt-2 focus-ring" @click="$emit('action')">
        <i aria-hidden="true" class="i-carbon-add" /> 立即创建
      </button>
    </slot>
  </div>
</template>
