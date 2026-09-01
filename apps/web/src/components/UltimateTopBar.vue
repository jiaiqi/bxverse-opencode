<script setup lang="ts">
// UltimateTopBar.vue —— design v2.0 ULTIMATE 顶栏（面包屑 + 队列状态 + 主题切换 + 同步/发布/新建）

import { computed } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import { useAppStore } from '../stores/app'
import { usePublishStore } from '../stores/publish'

const router = useRouter()
const appStore = useAppStore()
const publishStore = usePublishStore()

const currentTheme = computed(() => appStore.themeStyle ?? 'wenxi')
const isBusy = computed(() => publishStore.phase === 'running' || publishStore.phase === 'planning')

function setTheme(t: 'wenxi' | 'indigo'): void {
  appStore.setThemeStyle(t)
}
</script>

<template>
  <header
    class="h-14 shrink-0 flex items-center gap-4 px-6 border-b"
    style="background-color: var(--wx-bg-soft); border-color: var(--wx-border); color: var(--wx-t1)"
  >
    <!-- 面包屑 -->
    <div class="text-[13px] text-[var(--wx-t3)] flex items-center gap-1.5 min-w-0">
      <RouterLink to="/ultimate" class="hover:text-[var(--wx-t1)] no-underline">
        bxverse
      </RouterLink>
      <span class="mx-1.5">/</span>
      <span class="text-[var(--wx-t1)] font-medium truncate">总览驾驶舱</span>
    </div>

    <!-- 队列状态 chip（useQueueStore.busy 决定"空闲/执行中"） -->
    <div
      class="chip flex items-center gap-1.5 ml-1"
      :class="isBusy ? 'tag-warn' : 'bg-[var(--wx-accent-soft)] text-[var(--wx-accent)]'"
    >
      <span
        class="w-1.5 h-1.5 rounded-full"
        :class="isBusy ? 'bg-warning animate-pulse' : 'bg-[var(--wx-accent)] animate-pulse'"
      />
      <span>{{ isBusy ? '执行中' : '队列空闲' }}</span>
    </div>

    <div class="flex-1" />

    <!-- 主题切换（wenxi / indigo） -->
    <div
      class="flex items-center rounded-full p-0.5 gap-0.5"
      style="background-color: var(--wx-bg-elev); border: 1px solid var(--wx-border)"
      role="group"
      aria-label="主题切换 wenxi 与 indigo"
    >
      <button
        type="button"
        :aria-pressed="currentTheme === 'wenxi'"
        class="px-3 py-0.5 rounded-full text-[10px] font-mono transition-colors"
        :class="
          currentTheme === 'wenxi'
            ? 'bg-[var(--wx-accent-soft)] text-[var(--wx-accent)]'
            : 'text-[var(--wx-t3)] hover:text-[var(--wx-t1)]'
        "
        @click="setTheme('wenxi')"
      >
        wenxi
      </button>
      <button
        type="button"
        :aria-pressed="currentTheme === 'indigo'"
        class="px-3 py-0.5 rounded-full text-[10px] font-mono transition-colors"
        :class="
          currentTheme === 'indigo'
            ? 'bg-[var(--wx-accent-soft)] text-[var(--wx-accent)]'
            : 'text-[var(--wx-t3)] hover:text-[var(--wx-t1)]'
        "
        @click="setTheme('indigo')"
      >
        indigo
      </button>
    </div>

    <!-- 同步数据 / 快速发布 / 新建项目 -->
    <button
      type="button"
      class="btn-g text-[12px] px-3 py-1.5 flex items-center gap-1.5 border border-[var(--wx-border)] rounded-md hover:border-[var(--wx-border-strong)] transition-colors"
      style="color: var(--wx-t1)"
      title="同步项目数据（重新拉取 projects / overview）"
      @click="router.push('/').then(() => router.push('/ultimate'))"
    >
      <i aria-hidden="true" class="i-carbon-renew" />
      <span>同步数据</span>
    </button>
    <RouterLink
      to="/"
      class="btn-p text-[12px] px-3 py-1.5 flex items-center gap-1.5 rounded-md no-underline transition-colors"
      style="background-color: var(--wx-accent); color: var(--wx-bg); font-weight: 600"
      title="快速发布向导"
    >
      <i aria-hidden="true" class="i-carbon-rocket" />
      <span>快速发布</span>
    </RouterLink>
    <RouterLink
      to="/"
      class="btn-g text-[12px] px-3 py-1.5 flex items-center gap-1.5 border border-[var(--wx-border)] rounded-md no-underline transition-colors hover:border-[var(--wx-border-strong)]"
      style="color: var(--wx-t1)"
      title="新建项目"
    >
      <i aria-hidden="true" class="i-carbon-add" />
      <span>新建项目</span>
    </RouterLink>
  </header>
</template>
