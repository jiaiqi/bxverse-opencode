<script setup lang="ts">
// AppLayout.vue —— 侧栏 + 顶栏布局壳（R20 顶栏：页标题/命令面板/服务状态/主题/同步/新建）

import { RouterLink } from 'vue-router'
import { useMessage } from 'naive-ui'
import { useAppStore } from '../stores/app'
import { useProjectsStore } from '../stores/projects'
import { useUiStore } from '../stores/ui'
import AddProjectDialog from '../components/AddProjectDialog.vue'
import RuntimeStatus from '../components/RuntimeStatus.vue'

const route = useRoute()
const appStore = useAppStore()
const projectsStore = useProjectsStore()
const uiStore = useUiStore()
const message = useMessage()
const showAddProject = ref(false)
const syncing = ref(false)
const collapsed = ref(false)

const pageTitle = computed(() => String(route.meta.title ?? ''))

const themeTarget = computed(() => {
  // wenxi 风格下点击切回 indigo（保留当前 mode 语义）；indigo 下循环 mode
  if (appStore.themeStyle === 'wenxi') return null
  const mode = appStore.themeMode
  return mode === 'light' ? 'dark' : mode === 'dark' ? 'system' : 'light'
})
const themeIcon = computed(() => {
  if (appStore.themeStyle === 'wenxi') return 'i-carbon-color-palette'
  return appStore.themeMode === 'light' ? 'i-carbon-sun' : appStore.themeMode === 'dark' ? 'i-carbon-moon' : 'i-carbon-screen'
})
const themeLabel = computed(() => {
  if (appStore.themeStyle === 'wenxi') return 'WenXi'
  return appStore.themeMode
})
const themeTitle = computed(() =>
  appStore.themeStyle === 'wenxi' ? '主题风格：WenXi 深色玻璃拟态（点击切回靛蓝套件）' : `主题：${appStore.themeMode}（点击切换）`,
)

async function cycleTheme() {
  if (appStore.themeStyle === 'wenxi') {
    await appStore.setThemeStyle('indigo')
    return
  }
  await appStore.setTheme(themeTarget.value as 'light' | 'dark' | 'system')
}

async function syncData() {
  syncing.value = true
  try {
    const result = await import('../api').then(m => m.api.sync('pull'))
    message.success(result.ok ? '数据仓库已同步' : `同步失败：${String(result.message ?? '')}`)
  } catch (e) {
    message.error((e as Error).message)
  } finally {
    syncing.value = false
  }
}
</script>

<template>
  <div class="flex h-screen overflow-hidden">
    <!-- 跳过导航 -->
    <a href="#main-content" class="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:bg-surface focus:px-3 focus:py-2 focus:rounded-md focus:border focus:border-brand-500">
      跳到主内容
    </a>

    <!-- 侧栏 -->
    <aside
      class="sidebar flex flex-col shrink-0 bg-surface border-r border-border transition-[width] duration-200"
      :class="collapsed ? 'w-14' : 'w-58'"
    >
      <!-- Logo -->
      <RouterLink to="/" class="flex items-center gap-2.5 px-4 h-14 shrink-0 no-underline hover:bg-surface-hover transition-colors duration-150" :class="collapsed ? 'justify-center px-0' : ''">
        <span class="sb-logo-mark"><i aria-hidden="true" class="i-carbon-cube text-13px" /></span>
        <template v-if="!collapsed">
          <span class="font-semibold text-13.5px text-text-1 leading-4 whitespace-nowrap">
            BX 版本管理台
            <small class="block text-10px font-normal text-text-3 tracking-widest font-mono">BXVERSE · LOCAL</small>
          </span>
        </template>
      </RouterLink>

      <!-- 导航 -->
      <nav class="flex-1 overflow-y-auto px-2.5 py-2 space-y-1" aria-label="主导航">
        <RouterLink
          to="/"
          class="sidebar-item no-underline"
          :class="{ 'sidebar-item-active': route.path === '/' }"
        >
          <i aria-hidden="true" class="i-carbon-dashboard sidebar-icon" />
          <span v-if="!collapsed">总览</span>
        </RouterLink>

        <!-- 项目分组 -->
        <div v-if="!collapsed" class="flex items-center justify-between px-3 pt-4 pb-1">
          <span class="text-xs text-text-3">项目</span>
          <button
            class="w-6 h-6 flex items-center justify-center rounded-md text-text-3 hover:text-brand-500 hover:bg-surface-hover transition-colors duration-150 bg-transparent"
            aria-label="新建项目"
            @click="showAddProject = true"
          >
            <i aria-hidden="true" class="i-carbon-add text-14px" />
          </button>
        </div>
        <div v-else class="pt-4 pb-1 flex justify-center">
          <button
            class="w-6 h-6 flex items-center justify-center rounded-md text-text-3 hover:text-brand-500 hover:bg-surface-hover transition-colors duration-150 bg-transparent"
            aria-label="新建项目"
            @click="showAddProject = true"
          >
            <i aria-hidden="true" class="i-carbon-add text-14px" />
          </button>
        </div>
        <RouterLink
          v-for="p in projectsStore.items"
          :key="p.id"
          :to="`/project/${p.id}`"
          class="sidebar-item no-underline"
          :class="{ 'sidebar-item-active': route.params.id === p.id }"
          :title="p.name"
        >
          <i aria-hidden="true" class="i-carbon-catalog sidebar-icon" />
          <span v-if="!collapsed" class="flex-1 truncate">{{ p.name }}</span>
          <span
            v-if="projectsStore.overview?.projects.find(x => x.id === p.id)?.changedRepoCount"
            class="w-2 h-2 rounded-full bg-brand-500 shrink-0"
            title="有仓库待发布"
          />
        </RouterLink>
        <div v-if="!projectsStore.loading && projectsStore.items.length === 0" class="px-3 py-2 text-xs text-text-3">
          {{ collapsed ? '' : '暂无项目' }}
        </div>
      </nav>

      <!-- 底部 -->
      <div class="sb-foot px-2.5 py-2 border-t border-border space-y-1 shrink-0">
        <RouterLink
          to="/settings"
          class="sidebar-item w-full text-left no-underline"
          :class="{ 'sidebar-item-active': route.path === '/settings' }"
        >
          <i aria-hidden="true" class="i-carbon-settings sidebar-icon" />
          <span v-if="!collapsed" class="flex-1">设置</span>
        </RouterLink>
        <button class="sidebar-item w-full text-left" :title="themeTitle" @click="cycleTheme">
          <i aria-hidden="true" class="sidebar-icon" :class="themeIcon" />
          <span v-if="!collapsed" class="flex-1">主题</span>
          <span v-if="!collapsed" class="text-xs text-text-3">{{ themeLabel }}</span>
        </button>
        <button class="sidebar-item w-full text-left" @click="uiStore.togglePalette(true)">
          <i aria-hidden="true" class="i-carbon-search sidebar-icon" />
          <span v-if="!collapsed" class="flex-1">命令面板</span>
          <span v-if="!collapsed" class="sb-kbd">Ctrl K</span>
        </button>
      </div>
    </aside>

    <!-- 顶栏 + 内容区 -->
    <div class="flex-1 flex flex-col min-w-0">
      <header class="topbar flex items-center gap-3 px-6 h-14 shrink-0 bg-surface border-b border-border">
        <div class="flex items-baseline gap-2 min-w-0">
          <span class="text-14px font-semibold text-text-1 truncate">{{ pageTitle }}</span>
          <span v-if="!collapsed" class="hidden md:block text-11px text-text-3 whitespace-nowrap">BX 版本管理台 · 本地</span>
        </div>
        <div class="flex-1" />

        <!-- 命令面板搜索（Ctrl+K） -->
        <button
          class="hidden md:flex items-center gap-2 h-8 px-3.5 rounded-[var(--bx-radius-md)] text-xs text-text-3 border border-border bg-surface-hover hover:border-border-strong hover:text-text-2 transition-[border-color,box-shadow] duration-140 ease-[cubic-bezier(0.23,1,0.32,1)] focus-ring w-56"
          @click="uiStore.togglePalette(true)"
        >
          <i aria-hidden="true" class="i-carbon-search text-13px" />
          搜索项目 / 仓库 / 版本…
          <span class="sb-kbd ml-auto">Ctrl K</span>
        </button>

        <RuntimeStatus />

        <div class="w-px h-5 bg-border shrink-0" aria-hidden="true" />

        <button
          class="w-8 h-8 flex items-center justify-center rounded-md text-text-3 hover:text-text-1 hover:bg-surface-hover transition-colors duration-150 focus-ring"
          :title="themeTitle"
          aria-label="切换主题"
          @click="cycleTheme"
        >
          <i aria-hidden="true" class="text-16px" :class="themeIcon" />
        </button>

        <button
          class="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-[var(--bx-radius-btn)] text-xs text-text-2 border border-border hover:border-border-strong hover:text-text-1 hover:bg-surface-hover transition-colors duration-150 focus-ring"
          :disabled="syncing"
          @click="syncData"
        >
          <i aria-hidden="true" class="i-carbon-renew text-13px" :class="{ 'animate-spin': syncing }" />
          <span class="hidden lg:inline">同步数据</span>
        </button>

        <button class="btn-primary h-8 px-3.5 text-xs" @click="showAddProject = true">
          <i aria-hidden="true" class="i-carbon-add text-13px" />
          <span class="hidden lg:inline">新建项目</span>
        </button>
      </header>

      <main id="main-content" class="flex-1 overflow-y-auto" tabindex="-1">
        <slot />
      </main>
    </div>

    <AddProjectDialog v-model:show="showAddProject" />
  </div>
</template>
