<script setup lang="ts">
// StatCard.vue —— 统计卡

withDefaults(defineProps<{
  label: string
  value: string | number
  icon?: string
  accent?: boolean
}>(), {
  icon: 'i-carbon-cube',
  accent: false,
})
</script>

<template>
  <div class="card card-pad flex items-center gap-4">
    <div
      class="w-11 h-11 flex items-center justify-center rounded-md text-20px"
      :class="accent ? 'bg-brand-soft text-brand-500' : 'bg-surface-alt text-text-2'"
    >
      <i :class="icon" />
    </div>
    <div class="min-w-0">
      <div class="stat-value" :class="{ 'text-brand-500': accent }">{{ value }}</div>
      <div class="stat-label">{{ label }}</div>
    </div>
  </div>
</template>
