<script setup lang="ts">
// FileViewer.vue —— 文件查看器（面包屑/复制/高亮/二进制/截断）

import hljs from 'highlight.js'
import { api } from '../api'
import { useMessage } from 'naive-ui'
import { useFsAccess } from '../composables/useFsAccess'
import LoadingState from './LoadingState.vue'

const props = defineProps<{
  pid: string
  rid: string
  path: string
}>()

const message = useMessage()
const fs = useFsAccess()
const content = ref<string | null>(null)
const meta = ref<{ size: number; lines: number; binary: boolean; truncated: boolean } | null>(null)
const loading = ref(false)

const lang = computed(() => {
  const ext = props.path.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    mts: 'typescript',
    vue: 'xml',
    json: 'json',
    jsonc: 'json',
    md: 'markdown',
    html: 'xml',
    htm: 'xml',
    css: 'css',
    scss: 'scss',
    less: 'less',
    yml: 'yaml',
    yaml: 'yaml',
    toml: 'ini',
    sh: 'bash',
    bash: 'bash',
    py: 'python',
    java: 'java',
    xml: 'xml',
    sql: 'sql',
  }
  return map[ext] ?? ''
})

const highlighted = computed(() => {
  if (!content.value || meta.value?.binary) return ''
  try {
    if (lang.value && hljs.getLanguage(lang.value)) {
      return hljs.highlight(content.value, { language: lang.value }).value
    }
    return hljs.highlightAuto(content.value).value
  } catch {
    return content.value
  }
})

async function load() {
  if (!props.path) return
  loading.value = true
  try {
    const f = await api.file(props.pid, props.rid, props.path)
    content.value = f.content
    meta.value = { size: f.size, lines: f.lines, binary: f.binary, truncated: f.truncated }
  } catch (e) {
    message.error((e as Error).message)
    content.value = null
    meta.value = null
  } finally {
    loading.value = false
  }
}

async function copyContent() {
  if (!content.value) return
  try {
    await navigator.clipboard.writeText(content.value)
    message.success('已复制到剪贴板')
  } catch (e) {
    message.error(`复制失败: ${(e as Error).message}`)
  }
}

/** 原生另存为下载当前文件（File System Access API，不支持时回退浏览器下载） */
const downloading = ref(false)
async function downloadFile() {
  if (!content.value || meta.value?.binary) return
  // 服务端对超大文件截断：下载的也是截断内容——必须显式提示，避免用户拿到「缺一半」的文件
  if (meta.value?.truncated) {
    message.warning(`文件过大已被服务端截断（仅前 ${meta.value.lines} 行），下载内容可能不完整`)
  }
  downloading.value = true
  try {
    const name = props.path.split('/').pop() ?? 'file.txt'
    const result = await fs.saveTextFile(name, content.value, 'application/octet-stream')
    if (result === 'native') message.success('已保存文件')
    else if (result === 'fallback') message.success('已开始下载')
  } finally {
    downloading.value = false
  }
}

watch(() => props.path, load, { immediate: true })

const segments = computed(() => props.path.split('/').filter(Boolean))
const fmtSize = (n: number): string =>
  n < 1024
    ? `${n} B`
    : n < 1024 * 1024
      ? `${(n / 1024).toFixed(1)} KB`
      : `${(n / 1024 / 1024).toFixed(1)} MB`
</script>

<template>
  <div class="flex flex-col h-full min-h-0">
    <!-- 工具栏 -->
    <div class="flex items-center gap-2 px-4 py-2.5 border-b border-border shrink-0">
      <div class="flex items-center gap-1 text-sm text-text-2 min-w-0 flex-1">
        <template v-for="(seg, i) in segments" :key="i">
          <span v-if="i > 0" class="text-text-3">/</span>
          <span :class="i === segments.length - 1 ? 'text-text-1 font-medium' : ''">{{ seg }}</span>
        </template>
      </div>
      <span v-if="meta" class="text-xs text-text-3 shrink-0">
        {{ fmtSize(meta.size) }} · {{ meta.lines }} 行
      </span>
      <button
        class="w-7 h-7 flex items-center justify-center rounded-md text-text-3 hover:bg-surface-hover hover:text-text-1 transition-colors duration-fast focus-ring"
        aria-label="下载文件（另存为）"
        :title="meta?.truncated ? '文件已截断，下载内容可能不完整' : '下载文件（另存为）'"
        :disabled="!content || meta?.binary"
        @click="downloadFile"
      >
        <i aria-hidden="true" class="i-carbon-download text-14px" />
      </button>
      <button
        class="w-7 h-7 flex items-center justify-center rounded-md text-text-3 hover:bg-surface-hover hover:text-text-1 transition-colors duration-fast focus-ring"
        aria-label="复制文件内容"
        :disabled="!content"
        @click="copyContent"
      >
        <i aria-hidden="true" class="i-carbon-copy text-14px" />
      </button>
    </div>

    <!-- 内容 -->
    <div class="flex-1 overflow-auto min-h-0">
      <div v-if="loading"><LoadingState pad="compact" /></div>
      <template v-else-if="meta?.binary">
        <div class="empty-wrap py-10">
          <i aria-hidden="true" class="i-carbon-document-blank text-40px text-text-3" />
          <div class="text-sm text-text-2">二进制文件不支持预览</div>
        </div>
      </template>
      <template v-else-if="content !== null">
        <div v-if="meta?.truncated" class="px-4 pt-3">
          <NAlert type="warning" :show-icon="true"> 文件过大，仅展示前 {{ meta.lines }} 行 </NAlert>
        </div>
        <pre
          class="m-0 p-4 text-13px leading-6 overflow-auto"
        ><code class="hljs font-mono" v-html="highlighted" /></pre>
      </template>
      <template v-else>
        <div class="empty-wrap py-10">
          <i aria-hidden="true" class="i-carbon-document text-40px text-text-3" />
          <div class="text-sm text-text-2">从左侧选择文件查看</div>
        </div>
      </template>
    </div>
  </div>
</template>
