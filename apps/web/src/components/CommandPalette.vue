<script setup lang="ts">
// CommandPalette.vue —— Ctrl+K 命令面板（模糊匹配/键盘导航）

import { useAppStore } from '../stores/app'
import { useProjectsStore } from '../stores/projects'
import { useUiStore } from '../stores/ui'

const router = useRouter()
const appStore = useAppStore()
const projectsStore = useProjectsStore()
const uiStore = useUiStore()

interface Command {
  group: string
  title: string
  icon: string
  keywords: string
  run: () => void
}

const query = ref('')
const activeIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)

const commands = computed<Command[]>(() => {
  const list: Command[] = [
    { group: '页面', title: '总览', icon: 'i-carbon-dashboard', keywords: 'overview dashboard', run: () => router.push('/') },
    { group: '页面', title: '设置', icon: 'i-carbon-settings', keywords: 'settings', run: () => router.push('/settings') },
  ]
  for (const p of projectsStore.items) {
    list.push({
      group: '项目',
      title: p.name,
      icon: 'i-carbon-catalog',
      keywords: `project ${p.name}`,
      run: () => router.push(`/project/${p.id}`),
    })
    list.push({
      group: '发布',
      title: `发布项目：${p.name}`,
      icon: 'i-carbon-rocket',
      keywords: `release publish ${p.name}`,
      run: () => router.push(`/project/${p.id}/release`),
    })
    for (const r of p.repos) {
      list.push({
        group: '仓库',
        title: `${p.name} / ${r.name}`,
        icon: 'i-carbon-git-branch',
        keywords: `repo ${r.name}`,
        run: () => router.push(`/repo/${p.id}/${r.id}`),
      })
    }
  }
  list.push({
    group: '发布',
    title: '开始发布',
    icon: 'i-carbon-rocket',
    keywords: 'release publish',
    run: () => {
      const p = projectsStore.items.find(x => (projectsStore.overview?.projects.find(o => o.id === x.id)?.changedRepoCount ?? 0) > 0)
      if (p) router.push(`/project/${p.id}/release`)
    },
  })
  list.push({
    group: '系统',
    title: '重看新手引导',
    icon: 'i-carbon-help',
    keywords: 'onboarding guide tour yindao',
    run: () => uiStore.toggleOnboarding(true),
  })
  list.push({
    group: '系统',
    title: '切换主题',
    icon: 'i-carbon-screen',
    keywords: 'theme dark light',
    run: () => appStore.setTheme(appStore.isDark ? 'light' : 'dark'),
  })
  return list
})

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return commands.value
  // 模糊匹配：标题中字符按顺序出现即命中（支持缩写）
  return commands.value
    .map((c) => ({ c, score: fuzzyScore(c.title, q) || (c.keywords.toLowerCase().includes(q) ? 1 : 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.c)
})

/** 简单 fuzzy：标题中字符按 q 的顺序出现；连续命中 +2；命中数 / q.length */
function fuzzyScore(title: string, q: string): number {
  if (!q) return 0
  const t = title.toLowerCase()
  let ti = 0
  let qi = 0
  let run = 0
  let score = 0
  while (ti < t.length && qi < q.length) {
    if (t[ti] === q[qi]) {
      run += 1
      score += run > 1 ? 2 : 1
      qi += 1
    } else {
      run = 0
    }
    ti += 1
  }
  if (qi < q.length) return 0 // 未完全匹配
  // 短查询权重更高（精确匹配）
  return score * (1 + (q.length <= 3 ? 0.5 : 0))
}

const grouped = computed(() => {
  const map = new Map<string, Command[]>()
  for (const c of filtered.value) {
    if (!map.has(c.group)) map.set(c.group, [])
    map.get(c.group)!.push(c)
  }
  return [...map.entries()]
})

watch(() => uiStore.paletteOpen, (open) => {
  if (open) {
    query.value = ''
    activeIndex.value = 0
    nextTick(() => inputRef.value?.focus())
  }
})

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIndex.value = Math.min(activeIndex.value + 1, filtered.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIndex.value = Math.max(activeIndex.value - 1, 0)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const cmd = filtered.value[activeIndex.value]
    if (cmd) {
      uiStore.togglePalette(false)
      cmd.run()
    }
  } else if (e.key === 'Escape') {
    uiStore.togglePalette(false)
  }
}

const flatActive = (groupIdx: number, itemIdx: number): number => {
  let n = 0
  for (let g = 0; g < grouped.value.length; g++) {
    const items = grouped.value[g][1]
    if (g < groupIdx) n += items.length
    else return n + itemIdx
  }
  return n
}
</script>

<template>
  <NModal
    :show="uiStore.paletteOpen"
    :closable="true"
    :aria-label="`命令面板，共 ${commands.length} 项`"
    @update:show="(v: boolean) => uiStore.togglePalette(v)"
    transform-origin="center"
  >
    <div class="w-160 max-w-90vw rounded-lg bg-surface border border-border shadow-lg overflow-hidden">
      <div class="flex items-center gap-2.5 px-4 h-12 border-b border-border">
        <i aria-hidden="true" class="i-carbon-search text-text-3 text-16px" />
        <input
          ref="inputRef"
          v-model="query"
          class="flex-1 bg-transparent rounded-md text-text-1 text-sm placeholder-text-3 outline-none focus:ring-2 focus:ring-brand-500"
          :aria-label="`搜索命令、项目、仓库（共 ${commands.length} 项）`"
          placeholder="搜索命令、项目、仓库…（支持模糊匹配）"
          autocomplete="off"
          spellcheck="false"
          role="combobox"
          aria-autocomplete="list"
          aria-controls="palette-listbox"
          :aria-expanded="true"
          :aria-activedescendant="filtered.length ? `cmd-${activeIndex}` : undefined"
          @keydown="onKeydown"
        />
        <span class="text-[10px] text-text-3 border border-border rounded-sm px-1 py-0.5">Esc</span>
      </div>
      <div
        id="palette-listbox"
        class="max-h-96 overflow-y-auto py-2"
        role="listbox"
        :aria-label="`搜索结果 ${filtered.length} 项`"
      >
        <template v-for="(group, gi) in grouped" :key="group[0]">
          <div class="px-4 pt-2 pb-1 text-xs text-text-3" role="presentation">{{ group[0] }}</div>
          <template v-for="(cmd, ii) in group[1]" :key="cmd.title">
            <button
              :id="`cmd-${flatActive(gi, ii)}`"
              role="option"
              :aria-selected="flatActive(gi, ii) === activeIndex ? 'true' : 'false'"
              class="w-full flex items-center gap-2.5 mx-2 px-3 h-9 rounded-md cursor-pointer transition-colors duration-100 focus-ring"
              :class="flatActive(gi, ii) === activeIndex ? 'bg-brand-soft text-brand-600' : 'text-text-2 hover:bg-surface-hover'"
              @mouseenter="activeIndex = flatActive(gi, ii)"
              @click="uiStore.togglePalette(false); cmd.run()"
            >
              <i aria-hidden="true" class="text-15px shrink-0" :class="cmd.icon" />
              <span class="flex-1 truncate text-left text-sm">{{ cmd.title }}</span>
              <span v-if="cmd.group" class="text-[10px] text-text-3 font-mono shrink-0 hidden md:inline">{{ cmd.group }}</span>
            </button>
          </template>
        </template>
        <div
          v-if="filtered.length === 0"
          class="px-4 py-8 text-center text-sm text-text-3"
          role="status"
          aria-live="polite"
        >
          没有匹配的命令 · 试试「<span class="text-text-2">发布</span>」「<span class="text-text-2">设置</span>」或项目名
        </div>
      </div>
      <div class="flex items-center gap-4 px-4 h-9 border-t border-border text-xs text-text-3" aria-hidden="true">
        <span><b class="text-text-2">↑↓</b> 选择</span>
        <span><b class="text-text-2">Enter</b> 执行</span>
        <span><b class="text-text-2">Esc</b> 关闭</span>
        <span class="ml-auto">{{ filtered.length }} / {{ commands.length }}</span>
      </div>
    </div>
  </NModal>
</template>
