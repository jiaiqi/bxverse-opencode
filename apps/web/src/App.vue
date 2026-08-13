<script setup lang="ts">
// App.vue —— 全局 Provider + 布局壳

import { RouterView } from 'vue-router'
import { darkTheme, NConfigProvider, NDialogProvider, NMessageProvider, NNotificationProvider, useOsTheme } from 'naive-ui'
import { darkThemeOverrides, lightThemeOverrides } from './theme'
import { useAppStore } from './stores/app'
import { useUiStore } from './stores/ui'
import { useProjectsStore } from './stores/projects'
import AppLayout from './layouts/AppLayout.vue'
import CommandPalette from './components/CommandPalette.vue'

const appStore = useAppStore()
const uiStore = useUiStore()
const projectsStore = useProjectsStore()
const osTheme = useOsTheme()

const bootError = ref('')
const booting = ref(true)

onMounted(async () => {
  try {
    await appStore.boot()
    await Promise.allSettled([projectsStore.load(), projectsStore.loadOverview()])
  } catch (e) {
    bootError.value = (e as Error).message
  } finally {
    booting.value = false
  }
})

// 系统主题变化 → 重新解析（仅 system 模式生效）
watch(() => osTheme.value, () => {
  if (appStore.themeMode === 'system') appStore.applyTheme()
})

// Ctrl+K 命令面板
onMounted(() => {
  const handler = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault()
      uiStore.togglePalette(true)
    }
  }
  window.addEventListener('keydown', handler)
  onScopeDispose(() => window.removeEventListener('keydown', handler))
})
</script>

<template>
  <NConfigProvider
    :theme="appStore.isDark ? darkTheme : null"
    :theme-overrides="appStore.isDark ? darkThemeOverrides : lightThemeOverrides"
    :locale="null"
    :date-locale="null"
  >
    <NMessageProvider placement="top-right">
      <NDialogProvider>
        <NNotificationProvider>
          <template v-if="booting">
              <div class="flex h-screen items-center justify-center gap-3 bg-bg">
                <NSpin size="large" />
                <span class="text-text-3">正在连接本地服务…</span>
              </div>
            </template>
            <template v-else-if="bootError">
              <div class="empty-wrap">
                <i class="i-carbon-cloud-off text-48px text-text-3" />
                <div class="text-lg font-semibold text-text-1">无法连接 BX 版本管理台服务</div>
                <div class="text-sm text-text-3 max-w-md">{{ bootError }}</div>
                <button class="btn-primary" @click="() => { bootError = ''; booting = true; appStore.boot().catch(e => { bootError = e.message }).finally(() => { booting = false }) }">
                  <i class="i-carbon-renew" /> 重试
                </button>
              </div>
            </template>
            <AppLayout v-else>
              <RouterView v-slot="{ Component }">
                <Transition name="fade-slide" mode="out-in">
                  <component :is="Component" />
                </Transition>
              </RouterView>
            </AppLayout>
            <CommandPalette />
          </NNotificationProvider>
        </NDialogProvider>
      </NMessageProvider>
  </NConfigProvider>
</template>
