<script setup lang="ts">
// LoadingState.vue —— 加载占位统一组件
// 对齐 EmptyState/ErrorState 三态家族：44px 居中 spinner + 可选文字 + role=status/aria-live=polite
// 解决散落 13 处 py-6/8/10/12 + p-5/6/8/10 + NSpin 各自一套的视觉不一致

withDefaults(
  defineProps<{
    text?: string
    /** 块级（默认 padding=10）vs 行内（无 padding，水平排列） */
    variant?: 'block' | 'inline'
    /** Naive UI spin 尺寸 */
    size?: 'small' | 'medium' | 'large'
    /** 块级内边距覆盖（py-6/8/10/12 等历史值） */
    pad?: 'compact' | 'default' | 'loose'
  }>(),
  {
    text: '',
    variant: 'block',
    size: 'small',
    pad: 'default',
  },
)

const padClass: Record<'compact' | 'default' | 'loose', string> = {
  compact: 'py-6',
  default: 'py-10',
  loose: 'py-14',
}
</script>

<template>
  <div
    v-if="variant === 'block'"
    class="flex flex-col items-center justify-center gap-2 text-text-3"
    :class="padClass[pad]"
    role="status"
    aria-live="polite"
  >
    <NSpin :size="size" />
    <span v-if="text" class="text-sm">{{ text }}</span>
    <span v-else class="sr-only">加载中</span>
  </div>
  <div v-else class="inline-flex items-center gap-2 text-text-3" role="status" aria-live="polite">
    <NSpin :size="size" />
    <span v-if="text" class="text-sm">{{ text }}</span>
    <span v-else class="sr-only">加载中</span>
  </div>
</template>
