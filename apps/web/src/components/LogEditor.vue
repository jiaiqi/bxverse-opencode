<script setup lang="ts">
// LogEditor.vue —— 双轨日志编辑器（状态机 auto→edited→confirmed，每侧独立）

import type { LogState } from '@bxverse/shared'
import { EXTERNAL_SECTIONS } from '@bxverse/shared'
import type { CommitInfo } from '@bxverse/shared'
import MarkdownView from './MarkdownView.vue'
import DiffView from './DiffView.vue'
import StatusBadge from './StatusBadge.vue'
import { useMessage } from 'naive-ui'

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
const showDiff = ref(false)
const locked = computed(() => props.state === 'confirmed')

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

function onInput(v: string) {
  emit('update:content', v)
}

function onConfirm() {
  if (!props.content.trim()) {
    message.warning('内容为空，无法确认')
    return
  }
  emit('confirm')
}

const templateOptions = computed(() => {
  const items = [
    { label: '（模板）各节标题', key: 'sections' },
    { label: '（模板）按类型插入全部提交', key: 'commits', disabled: props.commits.length === 0 },
  ]
  return items
})

function insertTemplate(key: string) {
  if (key === 'sections') {
    const lines = EXTERNAL_SECTIONS.map(s => `## ${s.title}\n`).join('\n')
    emit('update:content', props.content ? `${props.content}\n${lines}` : lines)
  } else {
    const usable = props.commits.filter(c => !props.exclude.includes(c.type) || c.breaking)
    const groups = EXTERNAL_SECTIONS
      .map(s => ({ s, items: usable.filter(c => s.types.includes(c.type)) }))
      .filter(g => g.items.length > 0)
    const lines = groups
      .map(g => `## ${g.s.title}\n${g.items.map(c => `- ${c.breaking ? '**[BREAKING]**：' : ''}${c.subject}${c.scope ? `（${c.scope}）` : ''}`).join('\n')}`)
      .join('\n\n')
    emit('update:content', props.content ? `${props.content}\n\n${lines}` : lines)
    message.success('已插入提交模板')
  }
}
</script>

<template>
  <div class="border border-border rounded-md overflow-hidden">
    <!-- 头部 -->
    <div class="flex items-center gap-2.5 px-3.5 py-2.5 bg-surface-alt border-b border-border flex-wrap">
      <span class="text-sm font-medium text-text-1">{{ title }}</span>
      <StatusBadge type="log" :log-state="state" />
      <template v-if="track === 'internal' && !expanded">
        <NButton size="tiny" quaternary @click="expanded = true">
          <template #icon><i aria-hidden="true" class="i-carbon-edit" /></template>
          编辑
        </NButton>
      </template>
      <template v-else>
        <span class="flex-1" />
        <NButton size="tiny" quaternary :disabled="locked" @click="emit('reset')">
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
      </template>
    </div>

    <!-- 内容 -->
    <template v-if="track === 'internal' && !expanded">
      <div class="p-4">
        <MarkdownView :content="content" />
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
          <NInput
            type="textarea"
            :value="content"
            :disabled="locked"
            placeholder="在此编辑日志内容…"
            class="h-full! font-mono! text-13px!"
            :input-props="{ style: 'height: 100%;' }"
            @update:value="onInput"
          />
        </div>
        <div class="overflow-y-auto p-4" :class="{ 'opacity-60': locked }">
          <MarkdownView :content="content" />
        </div>
      </div>
    </template>
  </div>
</template>
