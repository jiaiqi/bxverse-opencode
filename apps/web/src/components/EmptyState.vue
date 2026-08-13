<script setup lang="ts">
// EmptyState.vue —— 空状态引导

withDefaults(defineProps<{
  icon?: string
  title: string
  description?: string
}>(), {
  icon: 'i-carbon-cube',
})

const emit = defineEmits<{ action: [] }>()
</script>

<template>
  <div class="empty-wrap">
    <i class="text-48px text-text-3" :class="icon" />
    <div class="text-base font-semibold text-text-1">{{ title }}</div>
    <div v-if="description" class="text-sm text-text-3 max-w-md">{{ description }}</div>
    <slot name="action">
      <button v-if="emit" class="btn-primary mt-2" @click="emit('action')">
        <i aria-hidden="true" class="i-carbon-add" /> 立即创建
      </button>
    </slot>
  </div>
</template>
