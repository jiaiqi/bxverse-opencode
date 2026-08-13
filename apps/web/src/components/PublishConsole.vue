<script setup lang="ts">
// PublishConsole.vue —— SSE 实时控制台（事件分级着色、自动滚动、断线提示）

import { api } from '../api'
import type { PublishEventLike } from '../api'

const props = defineProps<{
  taskId: string
}>()

const emit = defineEmits<{
  event: [e: PublishEventLike]
  finished: [result: { releaseId: string | null; version: string; failedRepos: string[] } | null]
  failed: [message: string]
}>()

const lines = ref<{ key: number; type: string; repoId?: string; message: string }[]>([])
const follow = ref(true)
const retryCount = ref(0)
const disconnectMsg = ref('')
const listRef = ref<HTMLDivElement | null>(null)
let seq = 0
let cancel: (() => void) | undefined

const styleOf = (type: string): { prefix: string; cls: string } => {
  switch (type) {
    case 'step':
      return { prefix: '▸', cls: 'text-brand-500 font-medium' }
    case 'repo-start':
      return { prefix: '▶', cls: 'text-info' }
    case 'repo-done':
      return { prefix: '✓', cls: 'text-success' }
    case 'repo-error':
      return { prefix: '✗', cls: 'text-error' }
    case 'done':
      return { prefix: '★', cls: 'text-success font-medium' }
    case 'error':
      return { prefix: '✗', cls: 'text-error font-medium' }
    case 'log':
    default:
      return { prefix: '$', cls: 'text-text-2' }
  }
}

function subscribe(): void {
  cancel = api.subscribePublish(
    props.taskId,
    (e) => {
      disconnectMsg.value = ''
      retryCount.value = 0
      lines.value.push({ key: ++seq, type: e.type, repoId: e.repoId, message: e.message })
      if (lines.value.length > 1000) lines.value = lines.value.slice(-1000)
      emit('event', e)
      if (e.type === 'done') {
        const data = (e.data ?? {}) as { releaseId?: string | null; version?: string; failedRepos?: string[] }
        emit('finished', {
          releaseId: data.releaseId ?? null,
          version: data.version ?? '',
          failedRepos: data.failedRepos ?? [],
        })
      } else if (e.type === 'error') {
        emit('failed', e.message)
      }
      nextTick(scrollToBottom)
    },
    () => {
      retryCount.value += 1
      disconnectMsg.value = `连接断开，正在重连（第 ${retryCount.value} 次）…`
      setTimeout(subscribe, 3000)
    },
  )
}

function scrollToBottom(): void {
  if (!follow.value || !listRef.value) return
  listRef.value.scrollTop = listRef.value.scrollHeight
}

function onScroll(): void {
  const el = listRef.value
  if (!el) return
  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200
  if (!nearBottom) follow.value = false
  else follow.value = true
}

onMounted(subscribe)
onScopeDispose(() => cancel?.())

/** 仅阶段变化（step/done/error）进入 aria-live 播报 */
const stageAnnouncement = computed(() => {
  const stage = [...lines.value].reverse().find(l => ['step', 'done', 'error'].includes(l.type))
  return stage ? stage.message : ''
})
</script>

<template>
  <div class="border border-border rounded-md overflow-hidden">
    <div class="flex items-center gap-2.5 px-3.5 py-2 bg-surface-alt border-b border-border text-xs">
      <i aria-hidden="true" class="i-carbon-terminal text-text-3" />
      <span class="code-text text-text-2">task {{ taskId }}</span>
      <span class="flex-1" />
      <NButton size="tiny" quaternary :type="follow ? 'primary' : 'default'" @click="follow = !follow; if (follow) scrollToBottom()">
        <template #icon><i aria-hidden="true" class="i-carbon-arrow-down" /></template>
        {{ follow ? '跟随输出' : '已暂停跟随' }}
      </NButton>
    </div>
    <div
      ref="listRef"
      class="console-wrap h-90 overflow-y-auto rounded-none border-none! m-0!"
      aria-live="off"
      @scroll.passive="onScroll"
    >
      <div v-if="lines.length === 0" class="text-text-3">等待事件流…</div>
      <div v-for="l in lines" :key="l.key" class="log-line flex gap-2" :class="styleOf(l.type).cls">
        <span class="shrink-0 w-4 text-center">{{ styleOf(l.type).prefix }}</span>
        <span class="shrink-0 text-text-3">{{ l.repoId ? `[${l.repoId.slice(0, 8)}]` : '' }}</span>
        <span class="flex-1 break-all">{{ l.message }}</span>
      </div>
    </div>
    <div v-if="disconnectMsg" class="px-3.5 py-2 border-t border-border text-xs text-warning">
      <i aria-hidden="true" class="i-carbon-renew mr-1" />{{ disconnectMsg }}
    </div>
    <!-- 阶段变化播报（读屏友好，避免逐行轰炸） -->
    <span class="sr-only" role="status" aria-live="polite">{{ stageAnnouncement }}</span>
  </div>
</template>
