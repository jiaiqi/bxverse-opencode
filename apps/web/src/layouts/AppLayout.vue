<script setup lang="ts">
// AppLayout.vue —— 全景驾驶舱布局壳（次世代深空暗夜架构）

import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useMessage } from 'naive-ui'

import { useProjectsStore } from '../stores/projects'
import { useUiStore } from '../stores/ui'
import AddProjectDialog from '../components/AddProjectDialog.vue'
import AddRepoDialog from '../components/AddRepoDialog.vue'

const route = useRoute()
const router = useRouter()
const projectsStore = useProjectsStore()
const uiStore = useUiStore()
const message = useMessage()

const showAddProject = ref(false)
const showAddRepo = ref(false)
const showProjectMenu = ref(false)
const syncing = ref(false)
const projectTriggerEl = ref<HTMLElement | null>(null)
const projectMenuEl = ref<HTMLElement | null>(null)
const focusedIdx = ref(-1)

// 优先读取 route.params.pid（仓库详情页 /repo/:pid/:rid），其次 route.params.id（项目详情页 /project/:id），最后回退到首个项目
const currentProjectId = computed(() =>
  String(route.params.pid || route.params.id || projectsStore.items[0]?.id || ''),
)
const currentProject = computed(
  () => projectsStore.byId(currentProjectId.value) || projectsStore.items[0] || null,
)

const navItems = computed(() => [
  { id: 'dashboard', to: '/', icon: 'i-carbon-dashboard', label: '总览看板', shortLabel: '看板' },
  {
    id: 'project',
    to: currentProject.value ? `/project/${currentProject.value.id}` : '/',
    icon: 'i-carbon-catalog',
    label: '项目与仓库',
    shortLabel: '项目台',
  },
  {
    id: 'release',
    to: currentProject.value ? `/project/${currentProject.value.id}/release` : '/',
    icon: 'i-carbon-rocket',
    label: '统一发版向导',
    shortLabel: '发版向导',
  },
  {
    id: 'backups',
    to: currentProject.value ? `/project/${currentProject.value.id}/backups` : '/',
    icon: 'i-carbon-security',
    label: '备份审计对比',
    shortLabel: '审计比',
  },
  {
    id: 'settings',
    to: '/settings',
    icon: 'i-carbon-settings',
    label: '系统与 AI 中枢',
    shortLabel: '设置',
  },
])
function selectProject(id: string) {
  showProjectMenu.value = false
  focusedIdx.value = -1
  router.push(`/project/${id}`)
  // 将焦点还给触发按钮，便于键盘继续操作
  nextTick(() => projectTriggerEl.value?.focus())
}

function focusMenuItem(idx: number) {
  const el = projectMenuEl.value?.querySelectorAll<HTMLElement>('[role="menuitem"]')[idx]
  el?.focus()
}

function openProjectMenu() {
  showProjectMenu.value = true
  nextTick(() => {
    const items = projectsStore.items
    let start = items.findIndex((p) => p.id === currentProject.value?.id)
    if (start < 0) start = 0
    focusedIdx.value = start
    focusMenuItem(start)
  })
}

function closeProjectMenu(returnFocus = true) {
  showProjectMenu.value = false
  focusedIdx.value = -1
  if (returnFocus) nextTick(() => projectTriggerEl.value?.focus())
}

function openAddProjectFromMenu() {
  showAddProject.value = true
  closeProjectMenu(true)
}

function onTriggerKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && showProjectMenu.value) {
    e.preventDefault()
    closeProjectMenu(true)
    return
  }
  if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    if (!showProjectMenu.value) openProjectMenu()
    else {
      const idx = focusedIdx.value >= 0 ? focusedIdx.value : 0
      focusMenuItem(idx)
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (!showProjectMenu.value) openProjectMenu()
  }
}

function onMenuKeydown(e: KeyboardEvent) {
  const len = projectsStore.items.length
  if (len === 0) return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    focusedIdx.value = (focusedIdx.value + 1) % len
    focusMenuItem(focusedIdx.value)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    focusedIdx.value = (focusedIdx.value - 1 + len) % len
    focusMenuItem(focusedIdx.value)
  } else if (e.key === 'Home') {
    e.preventDefault()
    focusedIdx.value = 0
    focusMenuItem(0)
  } else if (e.key === 'End') {
    e.preventDefault()
    focusedIdx.value = len - 1
    focusMenuItem(len - 1)
  } else if (e.key === 'Escape') {
    e.preventDefault()
    closeProjectMenu(true)
  } else if (e.key === 'Tab') {
    closeProjectMenu(false)
  }
}

watch(showProjectMenu, (open) => {
  if (open) {
    nextTick(() => {
      const items = projectsStore.items
      let start = items.findIndex((p) => p.id === currentProject.value?.id)
      if (start < 0) start = 0
      focusedIdx.value = start
    })
  } else {
    focusedIdx.value = -1
  }
})

async function syncData(action: 'pull' | 'push') {
  syncing.value = true
  try {
    const result = await import('../api').then((m) => m.api.sync(action))
    message.success(
      result.ok
        ? `数据仓库 ${action === 'pull' ? '拉取' : '推送'} 成功`
        : `失败: ${String(result.message ?? '')}`,
    )
  } catch (e) {
    message.error((e as Error).message)
  } finally {
    syncing.value = false
  }
}

function triggerFastRelease() {
  if (currentProject.value) {
    router.push(`/project/${currentProject.value.id}/release`)
  } else {
    showAddProject.value = true
  }
}
</script>

<template>
  <!-- 文本默认可选（版本号/日志等需复制），仅交互组件按需禁选 -->
  <div class="flex flex-col h-screen overflow-hidden bg-bg font-sans text-text-1">
    <!-- a11y：键盘用户按 Tab 首键出现「跳到主内容」链接，跳过侧栏/顶栏直奔 main 区域 -->
    <a
      href="#main-content"
      class="skip-link fixed top-2 left-2 z-50 px-3 py-2 rounded-md bg-brand-500 text-[var(--bx-on-brand)] text-sm font-semibold shadow-lg -translate-y-16 focus:translate-y-0 transition-transform duration-fast ease-spring focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
      >跳到主内容</a
    >
    <!-- 顶栏全局控制台 -->
    <header
      class="h-12 border-b border-border bg-surface/90 backdrop-blur px-4 flex items-center justify-between shrink-0 z-30"
    >
      <!-- 左：Logo 与项目切换器 -->
      <div class="flex items-center gap-3">
        <RouterLink to="/" class="flex items-center gap-2 no-underline text-inherit cursor-pointer">
          <div
            class="w-6 h-6 rounded-md bg-gradient-to-br from-brand-400 via-info to-brand-600 flex items-center justify-center text-black font-bold text-xs shadow-sm"
          >
            <i aria-hidden="true" class="i-carbon-cube text-13px" />
          </div>
          <span class="font-bold tracking-tight text-text-1 font-mono text-sm">
            BXVERSE<span
              class="text-brand-500 ml-1 text-xs font-sans px-1.5 py-0.2 rounded bg-brand-soft border border-brand-200"
              >Next</span
            >
          </span>
        </RouterLink>

        <div class="h-4 w-px bg-border"></div>

        <!-- 项目选择器下拉：NPopover 接管外点/Esc 关闭，内部自绘保留视觉并补齐 a11y 与键盘循环 -->
        <NPopover
          v-model:show="showProjectMenu"
          trigger="click"
          placement="bottom-start"
          :show-arrow="false"
          :to="false"
          style="padding: 0; background: transparent; border: 0; box-shadow: none"
          content-style="padding: 0"
          :keep-alive-on-hover="false"
        >
          <template #trigger>
            <button
              ref="projectTriggerEl"
              :aria-expanded="showProjectMenu ? 'true' : 'false'"
              aria-haspopup="menu"
              aria-controls="project-menu"
              :aria-label="
                currentProject ? `当前项目 ${currentProject.name}，点击切换项目` : '请选择项目'
              "
              @keydown="onTriggerKeydown"
              class="flex items-center gap-2 px-2.5 py-1 rounded-md bg-surface-hover hover:bg-surface-alt border border-border text-xs transition-colors cursor-pointer text-text-1 focus-ring"
            >
              <span class="w-2 h-2 rounded-full bg-brand-500" aria-hidden="true"></span>
              <span class="font-medium text-text-1">{{
                currentProject ? currentProject.name : '请创建项目'
              }}</span>
              <span v-if="currentProject" class="font-mono text-text-3 text-[10px]">{{
                currentProject.version
              }}</span>
              <i aria-hidden="true" class="i-carbon-chevron-down text-text-3 text-12px" />
            </button>
          </template>
          <div
            id="project-menu"
            ref="projectMenuEl"
            role="menu"
            aria-label="项目切换菜单"
            tabindex="-1"
            class="w-72 bg-surface border border-border-strong rounded-xl shadow-lg p-2 bx-popover-in outline-none"
            @keydown="onMenuKeydown"
          >
            <div
              class="flex items-center justify-between px-2 py-1 text-[10px] font-mono text-text-3 uppercase"
            >
              <span>业务项目 ({{ projectsStore.items.length }})</span>
              <button
                tabindex="0"
                aria-label="新建项目"
                @click="openAddProjectFromMenu"
                class="text-brand-500 hover:underline flex items-center gap-0.5 bg-transparent border-0 cursor-pointer focus-ring rounded px-1"
              >
                <i aria-hidden="true" class="i-carbon-add text-12px" /> 新建项目
              </button>
            </div>

            <div class="space-y-1 my-1 max-h-60 overflow-y-auto" role="none">
              <button
                v-for="p in projectsStore.items"
                :key="p.id"
                role="menuitem"
                tabindex="-1"
                :aria-current="currentProject?.id === p.id ? 'true' : undefined"
                :aria-label="`切换到项目 ${p.name}`"
                @click="selectProject(p.id)"
                @keydown.enter.prevent="selectProject(p.id)"
                @keydown.space.prevent="selectProject(p.id)"
                class="flex items-center justify-between p-2 rounded-lg hover:bg-surface-hover cursor-pointer transition-colors w-full text-left border-0 bg-transparent focus-ring outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                :class="{
                  'bg-surface-hover border border-brand-300 text-brand-600':
                    currentProject?.id === p.id,
                }"
              >
                <div class="flex items-center gap-2 truncate">
                  <span
                    class="w-1.5 h-1.5 rounded-full"
                    :class="currentProject?.id === p.id ? 'bg-brand-500' : 'bg-text-3'"
                    aria-hidden="true"
                  ></span>
                  <div class="truncate">
                    <div class="text-xs truncate font-semibold text-text-1">{{ p.name }}</div>
                    <div class="text-[10px] font-mono text-text-3 truncate">
                      {{ p.repos.length }} 个工程 · {{ p.version }}
                    </div>
                  </div>
                </div>
                <i aria-hidden="true" class="i-carbon-chevron-right text-text-3 text-12px" />
              </button>
            </div>
          </div>
        </NPopover>
      </div>

      <!-- 中：全系统命令面板搜索框 (Ctrl+K) -->
      <div class="flex-1 max-w-md mx-4">
        <button
          @click="uiStore.togglePalette(true)"
          class="w-full flex items-center justify-between px-3 py-1 rounded-md bg-surface-alt hover:bg-surface-hover border border-border text-text-3 text-xs transition-[background-color,border-color,color] cursor-pointer focus-ring"
        >
          <div class="flex items-center gap-2">
            <i aria-hidden="true" class="i-carbon-search text-text-3" />
            <span>搜索仓库、操作、版本或输入指令…</span>
          </div>
          <kbd
            class="px-1.5 py-0.5 text-[10px] font-mono rounded bg-surface border border-border text-text-3"
            >Ctrl K</kbd
          >
        </button>
      </div>

      <!-- 右：快捷操作、AI 状态、数据仓库同步、一键发版 -->
      <div class="flex items-center gap-2.5">
        <!-- 接入仓库快捷按钮 -->
        <button
          v-if="currentProject"
          @click="showAddRepo = true"
          class="flex items-center gap-1 px-2.5 py-1 rounded-md bg-surface-hover hover:bg-surface-alt border border-border text-xs text-info hover:text-text-1 transition-colors cursor-pointer focus-ring"
          title="向当前项目接入新 Git 仓库"
        >
          <i aria-hidden="true" class="i-carbon-branch text-12px" />
          <span>接入仓库</span>
        </button>

        <!-- 新建项目 -->
        <button
          @click="showAddProject = true"
          class="flex items-center gap-1 px-2.5 py-1 rounded-md bg-surface-hover hover:bg-surface-alt border border-border text-xs text-text-2 hover:text-text-1 transition-colors cursor-pointer focus-ring"
          title="创建新业务项目"
        >
          <i aria-hidden="true" class="i-carbon-add text-12px text-brand-500" />
          <span>新建项目</span>
        </button>

        <!-- 数据仓库 Git 同步 -->
        <div
          class="flex items-center gap-1 bg-surface-hover border border-border rounded-md px-1.5 py-0.5 text-xs font-mono text-text-3"
        >
          <button
            @click="syncData('pull')"
            :disabled="syncing"
            class="p-0.5 hover:text-text-1 bg-transparent border-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-ring rounded"
            title="从远程数据仓库拉取 (git pull)"
            aria-label="拉取数据仓库"
          >
            <i aria-hidden="true" class="i-carbon-cloud-download text-12px" />
          </button>
          <button
            @click="syncData('push')"
            :disabled="syncing"
            class="p-0.5 hover:text-text-1 bg-transparent border-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-ring rounded"
            title="向远程数据仓库推送 (git push)"
            aria-label="推送数据仓库"
          >
            <i aria-hidden="true" class="i-carbon-cloud-upload text-12px" />
          </button>
        </div>

        <!-- 守护进程 -->
        <div
          class="flex items-center gap-1.5 text-[11px] font-mono text-text-3 px-2 py-0.5 rounded bg-surface-hover border border-border"
        >
          <span class="w-1.5 h-1.5 rounded-full bg-brand-500"></span>
          <span>127.0.0.1:8899</span>
        </div>

        <div class="h-4 w-px bg-border"></div>

        <!-- 一键统一发布大按钮 -->
        <button
          @click="triggerFastRelease"
          class="btn-primary h-7.5 px-3.5 text-xs font-bold font-mono focus-ring"
        >
          <i aria-hidden="true" class="i-carbon-rocket text-13px" />
          <span>统一发版</span>
        </button>
      </div>
    </header>

    <!-- 核心全景工作台主体（左侧导航 + 视口） -->
    <div class="flex-1 flex overflow-hidden">
      <!-- 极简模式左导航 -->
      <nav
        class="w-16 border-r border-border bg-surface flex flex-col items-center py-3 justify-between shrink-0"
      >
        <div class="space-y-3">
          <RouterLink
            v-for="nav in navItems"
            :key="nav.id"
            :to="nav.to"
            class="w-10 h-10 rounded-xl flex flex-col items-center justify-center transition-[background-color,border-color,color,box-shadow,transform] group relative no-underline text-inherit cursor-pointer"
            :class="
              route.path === nav.to ||
              (nav.id === 'project' &&
                route.path.startsWith('/project/') &&
                !route.path.includes('/release') &&
                !route.path.includes('/backups')) ||
              (nav.id === 'release' && route.path.includes('/release')) ||
              (nav.id === 'backups' && route.path.includes('/backups'))
                ? 'bg-brand-soft text-brand-600 border border-brand-200 font-semibold'
                : 'text-text-3 hover:bg-surface-hover hover:text-text-1 border border-transparent'
            "
            :title="nav.label"
          >
            <i aria-hidden="true" class="text-16px" :class="nav.icon" />
            <span class="text-[9px] font-mono mt-0.5">{{ nav.shortLabel }}</span>
          </RouterLink>
        </div>

        <div class="space-y-2">
          <button
            @click="uiStore.toggleOnboarding(true)"
            class="w-10 h-10 rounded-xl flex items-center justify-center text-text-3 hover:bg-surface-hover hover:text-text-1 cursor-pointer bg-transparent border-0 focus-ring"
            title="重看新手引导（M5-08）"
            aria-label="重看新手引导"
          >
            <i aria-hidden="true" class="i-carbon-help text-16px" />
          </button>
          <RouterLink
            to="/settings"
            class="w-10 h-10 rounded-xl flex items-center justify-center text-text-3 hover:bg-surface-hover hover:text-text-1 no-underline"
            :class="{ 'bg-brand-soft text-brand-600': route.path === '/settings' }"
            title="系统与 AI 设置"
          >
            <i aria-hidden="true" class="i-carbon-settings text-16px" />
          </RouterLink>
        </div>
      </nav>

      <!-- 主视口内容区 -->
      <main id="main-content" class="flex-1 overflow-y-auto bg-bg" tabindex="-1">
        <slot />
      </main>
    </div>

    <AddProjectDialog v-model:show="showAddProject" @saved="projectsStore.load()" />
    <AddRepoDialog
      v-if="currentProject"
      v-model:show="showAddRepo"
      :project-id="currentProject.id"
      @added="projectsStore.load()"
    />
  </div>
</template>
