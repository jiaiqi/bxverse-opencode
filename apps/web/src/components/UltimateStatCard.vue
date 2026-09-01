<script setup lang="ts">
// UltimateStatCard.vue —— design v2.0 ULTIMATE 4 张 KPI 卡（复用 .stat-card-wx + countUp + stagger）
// 5 张改为 4 张主指标（管理项目 / 托管仓库 / 待发布变动 / 备份覆盖率），与 design v2.0 截图一致

withDefaults(
  defineProps<{
    label: string
    value: string | number
    subLabel?: string
    icon?: string
    /** 命中状态：true 时显示底栏渐变线（design 第六轮 D-3） */
    hot?: boolean
    /** stagger 入场延迟：父组件按 idx 注入 */
    staggerDelayMs?: number
  }>(),
  {
    icon: 'i-carbon-cube',
    hot: false,
    staggerDelayMs: 0,
  },
)
</script>

<template>
  <div
    class="stat-card-wx stagger-item"
    :class="hot ? 'hot' : ''"
    :style="{ '--stagger-delay': staggerDelayMs + 'ms' }"
    role="group"
    :aria-label="label"
  >
    <div class="stat-label-wx flex items-center justify-between">
      <span>{{ label }}</span>
      <i aria-hidden="true" :class="icon" class="opacity-70" />
    </div>
    <div v-if="typeof value === 'number'" v-count-up="value" class="stat-value-wx">0</div>
    <div v-else class="stat-value-wx">{{ value }}</div>
    <div v-if="subLabel" class="stat-sub-wx">{{ subLabel }}</div>
  </div>
</template>
