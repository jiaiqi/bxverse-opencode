<script setup lang="ts">
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import { api } from '../api'
import { useMessage } from 'naive-ui'

const props = withDefaults(
  defineProps<{
    releaseId: string
    content: string
    version?: string
    repos?: { id: string; name: string; remote?: string }[]
    projectId?: string
    size?: 'tiny' | 'small' | 'medium'
  }>(),
  {
    version: '',
    repos: () => [],
    projectId: '',
    size: 'small',
  },
)

const message = useMessage()
const isOffline = ref(!navigator.onLine)
function updateOnline() {
  isOffline.value = !navigator.onLine
}
onMounted(() => {
  window.addEventListener('online', updateOnline)
  window.addEventListener('offline', updateOnline)
})
onBeforeUnmount(() => {
  window.removeEventListener('online', updateOnline)
  window.removeEventListener('offline', updateOnline)
})

const md = new MarkdownIt({
  html: false,
  linkify: true,
  highlight: (code: string, lang: string): string => {
    try {
      if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang }).value
      return hljs.highlightAuto(code).value
    } catch {
      return md.utils.escapeHtml(code)
    }
  },
})

const selectedRepoId = ref(props.repos[0]?.id ?? '')
const provider = ref<'github' | 'gitee'>('github')
const syncing = ref(false)

watch(
  () => props.repos,
  (v) => {
    if (!selectedRepoId.value && v.length) selectedRepoId.value = v[0].id
  },
  { immediate: true },
)

const canSync = computed(() => !isOffline.value && !!props.releaseId && !!selectedRepoId.value && !!props.content.trim())

async function copyMarkdown() {
  try {
    await navigator.clipboard.writeText(props.content)
    message.success('已复制 Markdown')
  } catch (e) {
    message.error(`复制失败: ${(e as Error).message}`)
  }
}

function downloadText(filename: string, data: string, mime = 'text/plain') {
  const blob = new Blob([data], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function exportMd() {
  const name = props.version ? `${props.version}.md` : 'release-note.md'
  downloadText(name, props.content, 'text/markdown')
  message.success(`已导出 ${name}`)
}

function exportHtml() {
  const htmlBody = md.render(props.content || '')
  const title = props.version ? `Release ${props.version}` : 'Release Note'
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${md.utils.escapeHtml(title)}</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{max-width:780px;margin:32px auto;padding:0 20px;font-family:system-ui,-apple-system,Segoe UI,Roboto,PingFang SC,Hiragino Sans GB,Microsoft YaHei,Helvetica Neue,Arial,sans-serif;line-height:1.7;color:#1F2328}pre{background:#F6F8FA;padding:12px;border-radius:8px;overflow:auto}code{font-family:ui-monospace,SF Mono,Cascadia Code,Consolas,monospace}h1{border-bottom:1px solid #E5E7EB;padding-bottom:.3em}</style><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css"></head><body>${htmlBody}</body></html>`
  const name = props.version ? `${props.version}.html` : 'release-note.html'
  downloadText(name, html, 'text/html')
  message.success(`已导出 ${name}`)
}

async function syncRelease() {
  if (!props.releaseId) {
    message.warning('缺少发布记录 ID')
    return
  }
  if (!selectedRepoId.value) {
    message.warning('请选择目标仓库')
    return
  }
  if (isOffline.value) {
    message.warning('离线环境无法同步 Release（需联网与远程仓库）')
    return
  }
  syncing.value = true
  try {
    const res = await api.publishReleaseNote(props.releaseId, {
      repoId: selectedRepoId.value,
      provider: provider.value,
      body: props.content,
    })
    const note = res.action === 'created' ? '已创建 Release' : '已更新 Release'
    message.success(`${note}：${res.tag} → ${res.provider}${res.url ? `（${res.url}）` : ''}`)
  } catch (e) {
    const err = e as { message?: string; code?: string }
    // 400 未配置 token 时后端返回 VALIDATION，前端给出可操作提示
    if (String(err.code ?? '').includes('VALIDATION') && String(err.message ?? '').includes('token')) {
      message.error(`${err.message}（请在 ~/.bxverse/credentials.json 配置 releaseTokens.${provider.value}）`)
    } else {
      message.error((e as Error).message ?? '同步失败')
    }
  } finally {
    syncing.value = false
  }
}
</script>

<template>
  <div class="flex items-center gap-2 flex-wrap">
    <NButton :size="size" quaternary @click="copyMarkdown">
      <template #icon><i aria-hidden="true" class="i-carbon-copy" /></template>
      复制 Markdown
    </NButton>
    <NButton :size="size" quaternary @click="exportMd">
      <template #icon><i aria-hidden="true" class="i-carbon-document" /></template>
      导出 .md
    </NButton>
    <NButton :size="size" quaternary @click="exportHtml">
      <template #icon><i aria-hidden="true" class="i-carbon-html-reference" /></template>
      导出 .html
    </NButton>

    <div class="flex items-center gap-1.5 ml-1 pl-3 border-l border-border">
      <NSelect
        v-if="repos.length > 1"
        v-model:value="selectedRepoId"
        :options="repos.map(r => ({ label: r.name, value: r.id }))"
        size="small"
        placeholder="目标仓库"
        class="min-w-[140px]"
        :consistent-menu-width="false"
      />
      <NSelect
        v-model:value="provider"
        :options="[{ label: 'GitHub', value: 'github' }, { label: 'Gitee', value: 'gitee' }]"
        size="small"
        class="min-w-[118px]"
        placeholder="平台"
      />
      <NTooltip :disabled="!isOffline">
        <template #trigger>
          <NButton
            :size="size"
            type="primary"
            secondary
            :loading="syncing"
            :disabled="!canSync"
            @click="syncRelease"
          >
            <template #icon><i aria-hidden="true" class="i-carbon-cloud-upload" /></template>
            同步到 Release
          </NButton>
        </template>
        离线环境或未配置远程，无法同步 Release
      </NTooltip>
    </div>
  </div>
</template>
