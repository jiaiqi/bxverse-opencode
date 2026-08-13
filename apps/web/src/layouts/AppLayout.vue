<script setup lang="ts">
// AppLayout.vue —— 侧栏布局壳

import { RouterLink } from 'vue-router'
import { useAppStore } from '../stores/app'
import { useProjectsStore } from '../stores/projects'
import { useUiStore } from '../stores/ui'
import AddProjectDialog from '../components/AddProjectDialog.vue'
import RuntimeStatus from '../components/RuntimeStatus.vue'

const route = useRoute()
const appStore = useAppStore()
const projectsStore = useProjectsStore()
const uiStore = useUiStore()
const showAddProject = ref(false)

const collapsed = ref(false)

const themeTarget = computed(() => {
  const mode = appStore.themeMode
  return mode === 'light' ? 'dark' : mode === 'dark' ? 'system' : 'light'
})
const themeIcon = computed(() =>
  appStore.themeMode === 'light' ? 'i-carbon-sun' : appStore.themeMode === 'dark' ? 'i-carbon-moon' : 'i-carbon-screen',
)

async function cycleTheme() {
  await appStore.setTheme(themeTarget.value)
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
      class="flex flex-col shrink-0 bg-surface border-r border-border transition-[width] duration-200"
      :class="collapsed ? 'w-14' : 'w-58'"
    >
      <!-- Logo -->
      <RouterLink to="/" class="flex items-center gap-2.5 px-4 h-14 shrink-0 no-underline hover:bg-surface-hover transition-colors duration-150" :class="collapsed ? 'justify-center px-0' : ''">
        <i aria-hidden="true" class="i-carbon-cube text-22px text-brand-500 shrink-0" />
        <template v-if="!collapsed">
          <span class="font-semibold text-15px text-text-1">BX 版本管理台</span>
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
            class="w-6 h-6 flex items-center justify-center rounded-md text-text-3 hover:text-brand-500 hover:bg-surface-hover transition-colors duration-150"
            aria-label="新建项目"
            @click="showAddProject = true"
          >
            <i aria-hidden="true" class="i-carbon-add text-14px" />
          </button>
        </div>
        <div v-else class="pt-4 pb-1 flex justify-center">
          <button
            class="w-6 h-6 flex items-center justify-center rounded-md text-text-3 hover:text-brand-500 hover:bg-surface-hover transition-colors duration-150"
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
      <div class="px-2.5 py-2 border-t border-border space-y-1 shrink-0">
        <div class="px-1.5 pb-1">
          <RuntimeStatus />
        </div>
        <RouterLink
          to="/settings"
          class="sidebar-item no-underline"
          :class="{ 'sidebar-item-active': route.path === '/settings' }"
        >
          <i aria-hidden="true" class="i-carbon-settings sidebar-icon" />
          <span v-if="!collapsed">设置</span>
        </RouterLink>
        <button class="sidebar-item w-full text-left" :title="`主题：${appStore.themeMode}（点击切换）`" @click="cycleTheme">
          <i aria-hidden="true" class="sidebar-icon" :class="themeIcon" />
          <span v-if="!collapsed" class="flex-1">主题</span>
          <span v-if="!collapsed" class="text-xs text-text-3">{{ appStore.themeMode }}</span>
        </button>
        <button class="sidebar-item w-full text-left" @click="uiStore.togglePalette(true)">
          <i aria-hidden="true" class="i-carbon-search sidebar-icon" />
          <span v-if="!collapsed" class="flex-1">命令面板</span>
          <span v-if="!collapsed" class="text-xs text-text-3 border border-border rounded-sm px-1">Ctrl&nbsp;K</span>
        </button>
      </div>
    </aside>

    <!-- 内容区 -->
    <main id="main-content" class="flex-1 overflow-y-auto" tabindex="-1">
      <slot />
    </main>

    <AddProjectDialog v-model:show="showAddProject" />
  </div>
</template>
