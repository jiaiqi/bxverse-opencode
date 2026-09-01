<script setup lang="ts">
// UltimateSidebar.vue —— design v2.0 ULTIMATE 左侧 nav（6 一级 + 项目子列表）
// 不替换既有 AppLayout 的 nav，挂在 AppLayout 主区左侧；Ultimate 视图内才显示

import { computed } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { useProjectsStore } from '../stores/projects'
import { useAppStore } from '../stores/app'

const route = useRoute()
const projectsStore = useProjectsStore()
const appStore = useAppStore()

const navItems = computed(() => [
  {
    id: 'dashboard',
    to: '/ultimate',
    label: '总览驾驶舱',
    short: '总览',
    icon: 'i-carbon-dashboard',
    active: route.path === '/ultimate',
  },
  {
    id: 'wizard',
    to: '/',
    label: '发布向导',
    short: '发布',
    icon: 'i-carbon-rocket',
    active: route.path === '/',
  },
  {
    id: 'history',
    to: '/feed',
    label: '历史与审计',
    short: '历史',
    icon: 'i-carbon-time',
    active: route.path === '/feed',
  },
  {
    id: 'matrix',
    to: '/matrix',
    label: '版本矩阵',
    short: '矩阵',
    icon: 'i-carbon-grid',
    active: route.path === '/matrix',
  },
  {
    id: 'cross',
    to: '/cross',
    label: '跨项目搜',
    short: '搜索',
    icon: 'i-carbon-search',
    active: route.path === '/cross',
  },
  {
    id: 'health',
    to: '/ops',
    label: '系统健康',
    short: '健康',
    icon: 'i-carbon-health-cross',
    active: route.path === '/ops',
  },
])

const projectList = computed(() =>
  (projectsStore.items as Array<{ id: string; name: string; changedRepoCount?: number }>).slice(
    0,
    8,
  ),
)
</script>

<template>
  <nav
    class="w-56 shrink-0 border-r border-[var(--wx-border)] bg-[var(--wx-bg-soft)] p-3 space-y-1 overflow-y-auto"
    aria-label="ULTIMATE 左侧导航"
  >
    <!-- 6 一级入口 -->
    <RouterLink
      v-for="n in navItems"
      :key="n.id"
      :to="n.to"
      class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-mono no-underline transition-colors"
      :class="
        n.active
          ? 'bg-[var(--wx-accent-soft)] text-[var(--wx-accent)] border border-[var(--wx-border-strong)]'
          : 'text-[var(--wx-t2)] hover:bg-[var(--wx-bg-elev)] hover:text-[var(--wx-t1)] border border-transparent'
      "
      :aria-current="n.active ? 'page' : undefined"
    >
      <i aria-hidden="true" :class="n.icon" class="text-14px" />
      <span class="truncate">{{ n.label }}</span>
    </RouterLink>

    <!-- 项目子列表 -->
    <div v-if="projectList.length" class="pt-3 mt-2 border-t border-[var(--wx-border)]">
      <div class="px-3 pb-1 text-[10px] uppercase tracking-wider text-[var(--wx-t3)] font-mono">
        项目 · {{ projectList.length }}
      </div>
      <RouterLink
        v-for="p in projectList"
        :key="p.id"
        :to="`/project/${p.id}`"
        class="flex items-center gap-2 px-3 py-1.5 rounded text-[11px] font-mono no-underline text-[var(--wx-t2)] hover:text-[var(--wx-t1)] hover:bg-[var(--wx-bg-elev)] transition-colors"
      >
        <span
          class="w-1.5 h-1.5 rounded-full shrink-0"
          :class="
            (p.changedRepoCount ?? 0) > 0
              ? 'bg-[var(--wx-accent)] animate-pulse'
              : 'bg-[var(--wx-t3)]'
          "
          aria-hidden="true"
        />
        <span class="truncate">{{ p.name }}</span>
      </RouterLink>
    </div>

    <!-- 底部 service banner 占位（v1.2.0 阶段 2 接 UltimateTopBar 替代） -->
    <div class="pt-3 mt-3 border-t border-[var(--wx-border)]">
      <div
        class="px-3 py-2 rounded text-[10px] font-mono text-[var(--wx-t3)] flex items-center gap-1.5"
      >
        <span
          class="w-1.5 h-1.5 rounded-full shrink-0"
          :class="appStore.booted ? 'bg-success' : 'bg-warning'"
        />
        <span>服务 {{ appStore.booted ? '运行中' : '检测中' }} :8899</span>
      </div>
    </div>
  </nav>
</template>
