<script setup lang="ts">
// RuntimeStatus.vue —— 本地服务连接状态 chip（借鉴 repoverse）

import { useRuntimeStatus } from '../composables/useRuntimeStatus'

const { status, version, errorMessage, check } = useRuntimeStatus()

const display = computed(() => {
  if (status.value === 'connected') {
    return { label: '本地服务已连接', icon: 'i-carbon-checkmark-filled', cls: 'text-success' }
  }
  if (status.value === 'unavailable') {
    return { label: '本地服务未连接', icon: 'i-carbon-warning-alt', cls: 'text-warning' }
  }
  return { label: '检测本地服务…', icon: 'i-carbon-renew animate-spin', cls: 'text-text-3' }
})
</script>

<template>
  <button
    class="focus-ring"
    :class="
      status === 'connected'
        ? 'status-pill'
        : status === 'unavailable'
          ? 'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-colors duration-150 bg-warning-soft'
          : 'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-colors duration-150 bg-surface-hover'
    "
    aria-label="重新检测服务状态"
    :title="status === 'connected' ? `bxverse v${version}` : errorMessage"
    @click="check"
  >
    <span v-if="status === 'connected'" class="pulse" />
    <i v-else aria-hidden="true" class="text-13px" :class="[display.icon, display.cls]" />
    <span :class="display.cls">{{ display.label }}</span>
  </button>
</template>
