<script setup lang="ts">
// LogEditor.vue —— 双轨日志编辑器（状态机 auto→edited→confirmed，每侧独立）

import type { LogState } from '@bxverse/shared'
import { EXTERNAL_SECTIONS } from '@bxverse/shared'
import type { CommitInfo } from '@bxverse/shared'
import MarkdownView from './MarkdownView.vue'
import DiffView from './DiffView.vue'
import StatusBadge from './StatusBadge.vue'
import { useMessage } from 'naive-ui'
import { api } from '../api'
import { useAppStore } from '../stores/app'

const props = withDefaults(defineProps<{
  track: 'internal' | 'external'
  title: string
  content: string
  autoDraft: string
  state: LogState
  /** 插入模板用的提交（external 时可用） */
  commits?: CommitInfo[]
  /** external 排除类型（模板生成用） */
  exclude?: string[]
}>(), {
  commits: () => [],
  exclude: () => [],
})

const emit = defineEmits<{
  'update:content': [v: string]
  confirm: []
  unconfirm: []
  reset: []
}>()

const message = useMessage()
const appStore = useAppStore()
const showDiff = ref(false)
const locked = computed(() => props.state === 'confirmed')

// ---------- AI 润色（多供应商 R21）：仅对外日志；启用且有生效供应商 + 已设密钥时可点 ----------
const polishing = ref(false)
const aiProviders = ref<{ id: string; enabled: boolean; hasKey: boolean }[]>([])
onMounted(async () => {
  try {
    aiProviders.value = await api.aiProviders()
  } catch {
    // 供应商列表拉取失败不阻塞编辑器
  }
})
const aiReady = computed(() => {
  const c = appStore.config
  if (!c?.ai.enabled) return false
  return aiProviders.value.some(p => p.enabled && p.hasKey)
})

async function onPolish() {
  const base = pendingInput ?? props.content
  if (!base.trim()) {
    message.warning('内容为空，无法润色')
    return
  }
  polishing.value = true
  try {
    const { content, provider } = await api.aiPolish(base)
    if (content && content !== base) {
      // 先落盘未提交的输入再整体替换，避免竞态丢字
      clearTimeout(debounceTimer)
      debounceTimer = undefined
      pendingInput = null
      emit('update:content', content)
      message.success(`已由「${provider ?? 'AI'}」生成润色草稿（仍须人工核对后确认）`)
    } else {
      message.info('润色结果与原文一致，未做替换')
    }
  } catch (e) {
    message.error((e as Error).message)
  } finally {
    polishing.value = false
  }
}

// internal 默认折叠只读，点「编辑」展开
const expanded = ref(false)
watch(
  () => props.track,
  () => {
    expanded.value = props.track === 'external'
    showDiff.value = false
  },
  { immediate: true },
)

// ---------- 本地编辑缓冲：超长日志（数 MB）受控写回 textarea 每次 O(n) DOM 更新 ----------
// textarea 完全非受控（无 value 绑定，输入零 JS 干预）；挂载/展开/外部重置时手动同步一次。
const rawTa = ref<HTMLTextAreaElement | null>(null)
const syncedTa = (): HTMLTextAreaElement | undefined => rawTa.value ?? undefined
onMounted(() => {
  const el = syncedTa()
  if (el && el.value !== props.content) el.value = props.content
})
watch(
  () => expanded.value,
  async (v) => {
    if (v) {
      // textarea 在 expanded 变化后挂载（v-else 分支），须等 DOM 渲染完再写入初始内容
      await nextTick()
      const el = syncedTa()
      if (el && el.value !== props.content) el.value = props.content
    }
  },
)
watch(
  () => props.content,
  (v) => {
    const el = syncedTa()
    if (el && el.value !== v) el.value = v
  },
)

// ---------- 编辑防抖：超长日志（数万行）每次击键全量渲染预览会卡死主线程 ----------
const INPUT_DEBOUNCE_MS = 250
let pendingInput: string | null = null
let debounceTimer: ReturnType<typeof setTimeout> | undefined

function onInput(v: string) {
  pendingInput = v
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    if (pendingInput !== null) {
      emit('update:content', pendingInput)
      pendingInput = null
    }
  }, INPUT_DEBOUNCE_MS)
}

/** 立即提交未落盘的输入（confirm/模板插入前调用，避免丢最后输入） */
function flushInput(): void {
  clearTimeout(debounceTimer)
  debounceTimer = undefined
  if (pendingInput !== null) {
    emit('update:content', pendingInput)
    pendingInput = null
  }
}

function onConfirm() {
  const text = pendingInput ?? props.content
  flushInput()
  if (!text.trim()) {
    message.warning('内容为空，无法确认')
    return
  }
  emit('confirm')
}

function onReset() {
  clearTimeout(debounceTimer)
  debounceTimer = undefined
  pendingInput = null
  emit('reset')
}

// ---------- 折叠摘要：internal 未展开时只渲染前 N 行，不全文渲染 ----------
const COLLAPSED_PREVIEW_LINES = 24

/** 总行数（O(n) 计数，不分配数组） */
const lineCount = computed(() => {
  const s = props.content
  if (!s) return 0
  let n = 0
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) === 10) n++
  }
  return n + 1
})

const collapsedPreview = computed(() => {
  const s = props.content
  let cut = -1
  let count = 0
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) === 10) {
      count++
      if (count >= COLLAPSED_PREVIEW_LINES) {
        cut = i
        break
      }
    }
  }
  return cut === -1 ? s : s.slice(0, cut)
})

const templateOptions = computed(() => {
  const items = [
    { label: '（模板）各节标题', key: 'sections' },
    { label: '（模板）按类型插入全部提交', key: 'commits', disabled: props.commits.length === 0 },
  ]
  return items
})

function insertTemplate(key: string) {
  // 先取含未落盘输入的当前内容，一次 emit 完整结果（不丢最后输入）
  const base = pendingInput ?? props.content
  clearTimeout(debounceTimer)
  debounceTimer = undefined
  pendingInput = null
  if (key === 'sections') {
    const lines = EXTERNAL_SECTIONS.map(s => `## ${s.title}\n`).join('\n')
    emit('update:content', base ? `${base}\n${lines}` : lines)
  } else {
    const usable = props.commits.filter(c => !props.exclude.includes(c.type) || c.breaking)
    const groups = EXTERNAL_SECTIONS
      .map(s => ({ s, items: usable.filter(c => s.types.includes(c.type)) }))
      .filter(g => g.items.length > 0)
    const lines = groups
      .map(g => `## ${g.s.title}\n${g.items.map(c => `- ${c.breaking ? '**[BREAKING]**：' : ''}${c.subject}${c.scope ? `（${c.scope}）` : ''}`).join('\n')}`)
      .join('\n\n')
    emit('update:content', base ? `${base}\n\n${lines}` : lines)
    message.success('已插入提交模板')
  }
}
</script>

<template>
  <div class="border border-border rounded-md overflow-hidden">
    <!-- 头部：internal/external 统一操作区（确认/自动草稿/对比草稿始终可见） -->
    <div class="flex items-center gap-2.5 px-3.5 py-2.5 bg-surface-alt border-b border-border flex-wrap">
      <span class="text-sm font-medium text-text-1">{{ title }}</span>
      <StatusBadge type="log" :log-state="state" />
      <span class="flex-1" />
      <template v-if="track === 'internal'">
        <NButton size="tiny" quaternary @click="expanded = !expanded">
          <template #icon>
            <i aria-hidden="true" :class="expanded ? 'i-carbon-chevron-up' : 'i-carbon-edit'" />
          </template>
          {{ expanded ? '收起' : '编辑' }}
        </NButton>
      </template>
      <NButton size="tiny" quaternary :disabled="locked" @click="onReset">
        <template #icon><i aria-hidden="true" class="i-carbon-renew" /></template>
        自动草稿
      </NButton>
      <template v-if="track === 'external'">
        <NDropdown trigger="click" :options="templateOptions" @select="insertTemplate">
          <NButton size="tiny" quaternary :disabled="locked">
            <template #icon><i aria-hidden="true" class="i-carbon-text-new-line" /></template>
            插入模板
          </NButton>
        </NDropdown>
        <NButton
          v-if="aiReady"
          size="tiny"
          secondary
          type="primary"
          :loading="polishing"
          :disabled="locked"
          title="调用设置页配置的 AI 服务润色为面向用户的文案（仅生成草稿，仍须人工确认）"
          @click="onPolish"
        >
          <template #icon><i aria-hidden="true" class="i-carbon-sparkle" /></template>
          AI 润色
        </NButton>
      </template>
      <NButton size="tiny" quaternary @click="showDiff = !showDiff">
        <template #icon><i aria-hidden="true" class="i-carbon-compare" /></template>
        {{ showDiff ? '退出对比' : '对比草稿' }}
      </NButton>
      <NButton
        v-if="state !== 'confirmed'"
        size="tiny"
        type="primary"
        secondary
        @click="onConfirm"
      >
        <template #icon><i aria-hidden="true" class="i-carbon-checkmark" /></template>
        确认
      </NButton>
      <NButton v-else size="tiny" quaternary @click="emit('unconfirm')">
        <template #icon><i aria-hidden="true" class="i-carbon-close" /></template>
        解除确认
      </NButton>
    </div>

    <!-- 内容：对比草稿优先；internal 折叠显示摘要；否则编辑区 -->
    <template v-if="showDiff">
      <div class="p-3">
        <DiffView :before="autoDraft" :after="content" />
      </div>
    </template>
    <template v-else-if="track === 'internal' && !expanded">
      <div class="p-4">
        <MarkdownView :content="collapsedPreview" />
        <div
          v-if="lineCount > COLLAPSED_PREVIEW_LINES"
          class="mt-2.5 flex items-center gap-2 text-xs text-text-3 bg-surface-hover border border-border rounded-md px-3 py-2"
        >
          <i aria-hidden="true" class="i-carbon-document" />
          共 {{ lineCount.toLocaleString('zh-CN') }} 行 · {{ (content.length / 1024).toFixed(0) }} KB，点击「编辑」查看并修改全文
        </div>
      </div>
    </template>
    <template v-else-if="showDiff">
      <div class="p-3">
        <DiffView :before="autoDraft" :after="content" />
      </div>
    </template>
    <template v-else>
      <div class="grid grid-cols-2 divide-x divide-border h-90">
        <div class="min-w-0">
          <textarea
            ref="rawTa"
            :disabled="locked"
            placeholder="在此编辑日志内容…"
            autocomplete="off"
            spellcheck="false"
            class="h-full w-full bg-transparent resize-none outline-none p-3.5 font-mono text-13px leading-6 text-text-1"
            @input="onInput(($event.target as HTMLTextAreaElement).value)"
          ></textarea>
        </div>
        <div class="overflow-y-auto p-4" :class="{ 'opacity-60': locked }">
          <MarkdownView :content="content" :max-lines="800" />
        </div>
      </div>
    </template>
  </div>
</template>
