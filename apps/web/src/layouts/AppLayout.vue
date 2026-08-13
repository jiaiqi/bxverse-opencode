<script setup lang="ts">
// AppLayout.vue —— 侧栏布局壳

import { useAppStore } from '../stores/app'
import { useProjectsStore } from '../stores/projects'
import { useUiStore } from '../stores/ui'
import AddProjectDialog from '../components/AddProjectDialog.vue'

const route = useRoute()
const router = useRouter()
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
    <!-- 侧栏 -->
    <aside
      class="flex flex-col shrink-0 bg-surface border-r border-border transition-all duration-200"
      :class="collapsed ? 'w-14' : 'w-58'"
    >
      <!-- Logo -->
      <div class="flex items-center gap-2.5 px-4 h-14 shrink-0" :class="collapsed ? 'justify-center px-0' : ''">
        <i class="i-carbon-cube text-22px text-brand-500 shrink-0" />
        <template v-if="!collapsed">
          <span class="font-semibold text-15px text-text-1">BX 版本管理台</span>
        </template>
      </div>

      <!-- 导航 -->
      <nav class="flex-1 overflow-y-auto px-2.5 py-2 space-y-1">
        <div
          class="sidebar-item"
          :class="{ 'sidebar-item-active': route.path === '/' }"
          @click="router.push('/')"
        >
          <i class="i-carbon-dashboard sidebar-icon" />
          <span v-if="!collapsed">总览</span>
        </div>

        <!-- 项目分组 -->
        <div v-if="!collapsed" class="flex items-center justify-between px-3 pt-4 pb-1">
          <span class="text-xs text-text-3">项目</span>
          <i
            class="i-carbon-add text-14px text-text-3 hover:text-brand-500 cursor-pointer transition-colors duration-150"
            title="新建项目"
            @click="showAddProject = true"
          />
        </div>
        <div v-else class="pt-4 pb-1 flex justify-center">
          <i
            class="i-carbon-add text-14px text-text-3 hover:text-brand-500 cursor-pointer transition-colors duration-150"
            title="新建项目"
            @click="showAddProject = true"
          />
        </div>
        <div
          v-for="p in projectsStore.items"
          :key="p.id"
          class="sidebar-item"
          :class="{ 'sidebar-item-active': route.params.id === p.id }"
          :title="p.name"
          @click="router.push(`/project/${p.id}`)"
        >
          <i class="i-carbon-catalog sidebar-icon" />
          <span v-if="!collapsed" class="flex-1 truncate">{{ p.name }}</span>
          <span
            v-if="projectsStore.overview?.projects.find(x => x.id === p.id)?.changedRepoCount"
            class="w-2 h-2 rounded-full bg-brand-500 shrink-0"
            title="有仓库待发布"
          />
        </div>
        <div v-if="!projectsStore.loading && projectsStore.items.length === 0" class="px-3 py-2 text-xs text-text-3">
          {{ collapsed ? '' : '暂无项目' }}
        </div>
      </nav>

      <!-- 底部 -->
      <div class="px-2.5 py-2 border-t border-border space-y-1 shrink-0">
        <div
          class="sidebar-item"
          :class="{ 'sidebar-item-active': route.path === '/settings' }"
          @click="router.push('/settings')"
        >
          <i class="i-carbon-settings sidebar-icon" />
          <span v-if="!collapsed">设置</span>
        </div>
        <div class="sidebar-item" :title="`主题：${appStore.themeMode}（点击切换）`" @click="cycleTheme">
          <i class="sidebar-icon" :class="themeIcon" />
          <span v-if="!collapsed" class="flex-1">主题</span>
          <span v-if="!collapsed" class="text-xs text-text-3">{{ appStore.themeMode }}</span>
        </div>
        <div class="sidebar-item" @click="uiStore.togglePalette(true)">
          <i class="i-carbon-search sidebar-icon" />
          <span v-if="!collapsed" class="flex-1">命令面板</span>
          <span v-if="!collapsed" class="text-xs text-text-3 border border-border rounded-sm px-1">Ctrl K</span>
        </div>
      </div>
    </aside>

    <!-- 内容区 -->
    <main class="flex-1 overflow-y-auto">
      <slot />
    </main>

    <AddProjectDialog v-model:show="showAddProject" />
  </div>
</template>
