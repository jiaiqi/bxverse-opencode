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
  <div class="card card-pad stat-card flex items-center gap-4" :class="{ accent }">
    <div class="stat-ic" :class="accent ? 'bg-brand-soft text-brand-500 border-brand-200' : ''">
      <i aria-hidden="true" class="text-20px" :class="icon" />
    </div>
    <div class="min-w-0">
      <div class="stat-value" :class="{ 'text-brand-500': accent }">{{ value }}</div>
      <div class="stat-label">{{ label }}</div>
    </div>
  </div>
</template>
