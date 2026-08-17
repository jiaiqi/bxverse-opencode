<script setup lang="ts">
// App.vue —— 全局 Provider + 布局壳

import { RouterView } from 'vue-router'
import { darkTheme, NConfigProvider, NDialogProvider, NMessageProvider, NNotificationProvider, useOsTheme } from 'naive-ui'
import { darkThemeOverrides, lightThemeOverrides, wenxiThemeOverrides } from './theme'
import { useAppStore } from './stores/app'
import { useUiStore } from './stores/ui'
import { useProjectsStore } from './stores/projects'
import AppLayout from './layouts/AppLayout.vue'
import CommandPalette from './components/CommandPalette.vue'
import { applyPwa } from './pwa/register'

const appStore = useAppStore()
const uiStore = useUiStore()
const projectsStore = useProjectsStore()
const osTheme = useOsTheme()

// R20 主题风格：wenxi 为纯深色玻璃拟态套件（theme=dark + wenxiThemeOverrides）；indigo 走亮/暗双套件
const naiveTheme = computed(() => (appStore.themeStyle === 'wenxi' ? darkTheme : appStore.isDark ? darkTheme : null))
const naiveOverrides = computed(() =>
  appStore.themeStyle === 'wenxi' ? wenxiThemeOverrides : appStore.isDark ? darkThemeOverrides : lightThemeOverrides,
)

const bootError = ref('')
const booting = ref(true)

onMounted(async () => {
  try {
    await appStore.boot()
    // PWA 运行时开关（M5-01）：启动即按配置注册/注销 SW
    void applyPwa(appStore.config?.pwa.enabled ?? true)
    await Promise.allSettled([projectsStore.load(), projectsStore.loadOverview()])
  } catch (e) {
    bootError.value = (e as Error).message
  } finally {
    booting.value = false
  }
})

// 设置页修改 PWA 开关后即时生效（配置变更 → 注册/注销）
watch(
  () => appStore.pwaEnabled,
  (v) => {
    void applyPwa(v)
  },
)

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
    :theme="naiveTheme"
    :theme-overrides="naiveOverrides"
    :locale="null"
    :date-locale="null"
  >
    <NMessageProvider placement="top-right">
      <NDialogProvider>
        <NNotificationProvider>
          <template v-if="booting">
              <div class="flex h-screen items-center justify-center gap-3 bg-bg">
                <div class="flex flex-col items-center gap-4">
                  <span class="sb-logo-mark w-11 h-11 rounded-xl"><i aria-hidden="true" class="i-carbon-cube text-18px" /></span>
                  <span class="text-text-3 text-sm">正在连接本地服务…</span>
                </div>
              </div>
            </template>
            <template v-else-if="bootError">
              <div class="empty-wrap">
                <span class="e-ic"><i aria-hidden="true" class="i-carbon-cloud-off text-24px text-text-3" /></span>
                <div class="text-lg font-semibold text-text-1">无法连接 BX 版本管理台服务</div>
                <div class="text-sm text-text-3 max-w-md">{{ bootError }}</div>
                <button class="btn-primary mt-2" @click="() => { bootError = ''; booting = true; appStore.boot().catch(e => { bootError = e.message }).finally(() => { booting = false }) }">
                  <i aria-hidden="true" class="i-carbon-renew" /> 重试
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
