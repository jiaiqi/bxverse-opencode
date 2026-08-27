<script setup lang="ts">
// StatCard.vue —— 现代精密仪器统计指标卡
withDefaults(defineProps<{
  label: string
  value: string | number
  subLabel?: string
  icon?: string
  accent?: boolean
  color?: 'emerald' | 'cyan' | 'amber' | 'purple' | 'orange'
}>(), {
  icon: 'i-carbon-cube',
  accent: false,
  color: 'emerald',
})
</script>

<template>
  <div
    class="p-4 rounded-xl border transition-[border-color,background-color,box-shadow] duration-150 relative overflow-hidden bg-surface hover:border-border-strong group"
    :class="[
      color === 'cyan' ? 'border-l-[3px] border-l-info' :
      color === 'amber' ? 'border-l-[3px] border-l-warning' :
      color === 'purple' ? 'border-l-[3px] border-l-[var(--bx-accent-purple)]' :
      color === 'orange' ? 'border-l-[3px] border-l-warning' :
      'border-l-[3px] border-l-brand-500',
      'border-border'
    ]"
  >
    <div class="flex items-center justify-between">
      <div class="text-[11px] font-mono uppercase tracking-wider text-text-3 font-semibold">{{ label }}</div>
      <div
        class="w-7 h-7 rounded-lg flex items-center justify-center text-14px shrink-0 transition-transform duration-150 group-hover:scale-105"
        :class="[
          color === 'cyan' ? 'bg-info-soft text-info' :
          color === 'amber' ? 'bg-warning-soft text-warning' :
          color === 'orange' ? 'bg-warning-soft text-warning' :
          color === 'purple' ? 'bg-[var(--bx-accent-purple-soft)] text-[var(--bx-accent-purple)]' :
          'bg-brand-soft text-brand-500'
        ]"
      >
        <i aria-hidden="true" :class="icon" />
      </div>
    </div>
    <div class="flex items-baseline gap-1.5 mt-2">
      <span class="text-2xl font-bold font-mono tracking-tight text-text-1">{{ value }}</span>
      <span v-if="subLabel" class="text-xs font-mono text-text-3 font-normal">{{ subLabel }}</span>
    </div>
  </div>
</template>
