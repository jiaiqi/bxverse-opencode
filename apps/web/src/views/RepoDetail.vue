<script setup lang="ts">
// RepoDetail.vue —— 仓库详情（文件 / 版本日志 / 设置）

import type { ReleaseRecord, RepoStatus } from '@bxverse/shared'
import { useProjectsStore } from '../stores/projects'
import { api } from '../api'
import PageHeader from '../components/PageHeader.vue'
import StatusBadge from '../components/StatusBadge.vue'
import MarkdownView from '../components/MarkdownView.vue'
import FileTree from '../components/FileTree.vue'
import FileViewer from '../components/FileViewer.vue'
import { useDialog, useMessage } from 'naive-ui'

const route = useRoute()
const router = useRouter()
const projectsStore = useProjectsStore()
const dialog = useDialog()
const message = useMessage()

const pid = computed(() => String(route.params.pid))
const rid = computed(() => String(route.params.rid))
const { repo } = computed(() => projectsStore.repoById(pid.value, rid.value)).value

const tab = ref<'files' | 'logs' | 'settings'>('files')
const status = ref<RepoStatus | null>(null)
const statusLoading = ref(true)
const releases = ref<ReleaseRecord[]>([])
const releasesLoading = ref(false)

const selectedFile = ref('')
const logTrack = ref<'external' | 'internal'>('external')
const selectedRelease = ref<ReleaseRecord | null>(null)

async function loadAll() {
  statusLoading.value = true
  releasesLoading.value = true
  try {
    status.value = await projectsStore.repoStatus(pid.value, rid.value, true)
  } catch (e) {
    message.error((e as Error).message)
  } finally {
    statusLoading.value = false
  }
  try {
    const all = await api.releasesByScope(rid.value)
    const list = Array.isArray(all) ? all : [all]
    releases.value = list.filter(r => r.kind === 'repo')
    if (releases.value.length) selectedRelease.value = releases.value[0]
  } finally {
    releasesLoading.value = false
  }
}

// 设置表单
const settingsForm = reactive({
  name: '',
  buildCommand: '',
  outputDir: 'public',
  writeVersionFile: true,
})
const saving = ref(false)

function openSettings() {
  if (!repo) return
  settingsForm.name = repo.name
  settingsForm.buildCommand = repo.buildCommand ?? ''
  settingsForm.outputDir = repo.outputDir ?? 'public'
  settingsForm.writeVersionFile = repo.writeVersionFile ?? true
}

async function saveSettings() {
  if (!repo) return
  saving.value = true
  try {
    await projectsStore.updateRepo(pid.value, rid.value, {
      name: settingsForm.name.trim() || undefined,
      buildCommand: settingsForm.buildCommand || undefined,
      outputDir: settingsForm.outputDir,
      writeVersionFile: settingsForm.writeVersionFile,
    })
    message.success('设置已保存')
  } catch (e) {
    message.error((e as Error).message)
  } finally {
    saving.value = false
  }
}

function confirmRemove() {
  if (!repo) return
  dialog.warning({
    title: '移除仓库',
    content: `确定将「${repo.name}」移出本项目？${repo.path.includes('\\.bxverse\\') || repo.path.includes('/.bxverse/') ? '（克隆接入的仓库可勾选同时删除本地克隆目录）' : '（本地路径接入，仅移除管理记录，不触碰磁盘文件）'}`,
    positiveText: '移除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await projectsStore.removeRepo(pid.value, rid.value)
        message.success('仓库已移除')
        router.push(`/project/${pid.value}`)
      } catch (e) {
        message.error((e as Error).message)
      }
    },
  })
}

async function copyRemote() {
  if (!repo?.remote) return
  await navigator.clipboard.writeText(repo.remote)
  message.success('已复制')
}

watch([pid, rid], async () => {
  if (!projectsStore.byId(pid.value)) await projectsStore.load()
  selectedFile.value = ''
  selectedRelease.value = null
  openSettings()
  await loadAll()
}, { immediate: true })

watch(tab, (t) => {
  if (t === 'settings') openSettings()
})
</script>

<template>
  <div class="page">
    <template v-if="repo">
      <PageHeader
        :title="repo.name"
        back-to="`/project/${pid}`"
        icon="i-carbon-git-branch"
      >
        <template #badges>
          <span v-if="status" class="chip">
            <i class="i-carbon-git-branch" /> {{ status.branch }}
          </span>
          <StatusBadge v-if="status?.changed" type="changed" :count="status.commits.length" />
          <StatusBadge v-if="status && status.dirty > 0" type="dirty" :count="status.dirty" />
          <StatusBadge v-if="status && !status.hasRemote" type="local" />
        </template>
        <span v-if="repo.remote" class="chip code-text max-w-60 truncate" :title="repo.remote">
          {{ repo.remote }}
          <i class="i-carbon-copy cursor-pointer hover:text-brand-500" @click="copyRemote" />
        </span>
      </PageHeader>

      <div class="card">
        <NTabs v-model:value="tab" type="line" animated>
          <NTabPane name="files" tab="文件">
            <div class="flex h-140 -m-5 mt-4">
              <div class="w-72 shrink-0 border-r border-border overflow-y-auto">
                <FileTree :pid="pid" :rid="rid" @select="p => selectedFile = p" />
              </div>
              <div class="flex-1 min-w-0">
                <FileViewer :pid="pid" :rid="rid" :path="selectedFile" />
              </div>
            </div>
          </NTabPane>

          <NTabPane name="logs" tab="版本日志">
            <div class="flex h-140 -m-5 mt-4">
              <div class="w-80 shrink-0 border-r border-border overflow-y-auto">
                <div v-if="releasesLoading" class="p-6 text-center text-text-3"><NSpin size="small" /></div>
                <div v-else-if="releases.length === 0" class="p-4">
                  <div class="text-sm text-text-3 text-center py-8">暂无发布记录</div>
                </div>
                <div v-else class="py-2">
                  <div
                    v-for="r in releases"
                    :key="r.id"
                    class="px-4 py-2.5 cursor-pointer transition-colors duration-100 border-l-2"
                    :class="selectedRelease?.id === r.id ? 'bg-brand-soft border-brand-500' : 'border-transparent hover:bg-surface-hover'"
                    @click="selectedRelease = r"
                  >
                    <div class="code-text text-sm text-text-1">{{ r.version }}</div>
                    <div class="text-xs text-text-3 mt-0.5">{{ r.date.slice(0, 10) }} · {{ r.stats.commits }} 提交</div>
                  </div>
                </div>
              </div>
              <div class="flex-1 min-w-0 flex flex-col">
                <div v-if="selectedRelease" class="px-5 py-3 border-b border-border flex items-center gap-2.5 shrink-0">
                  <NRadioGroup v-model:value="logTrack" size="small">
                    <NRadioButton value="external">对外</NRadioButton>
                    <NRadioButton value="internal">对内</NRadioButton>
                  </NRadioGroup>
                  <StatusBadge type="log" :log-state="selectedRelease.logs[logTrack].state" />
                  <span class="flex-1" />
                  <span class="text-xs text-text-3">{{ selectedRelease.stats.commits }} 提交 · +{{ selectedRelease.stats.insertions }} / -{{ selectedRelease.stats.deletions }}</span>
                </div>
                <div class="flex-1 overflow-y-auto p-5">
                  <MarkdownView v-if="selectedRelease" :content="selectedRelease.logs[logTrack].content" />
                </div>
              </div>
            </div>
          </NTabPane>

          <NTabPane name="settings" tab="设置">
            <div class="max-w-xl py-2 space-y-5">
              <div>
                <div class="text-sm font-medium text-text-1 mb-1">本地路径</div>
                <div class="code-text text-13px text-text-2 bg-surface-alt border border-border rounded-md px-3 py-2">{{ repo.path }}</div>
              </div>
              <NForm label-placement="left" label-width="110">
                <NFormItem label="名称">
                  <NInput v-model:value="settingsForm.name" placeholder="仓库名称" />
                </NFormItem>
                <NFormItem label="构建命令">
                  <NInput v-model:value="settingsForm.buildCommand" placeholder="如：pnpm build（发版前执行，可留空）" />
                </NFormItem>
                <NFormItem label="产物目录">
                  <NInput v-model:value="settingsForm.outputDir" placeholder="public" />
                </NFormItem>
                <NFormItem label="写入版本文件">
                  <NSwitch v-model:value="settingsForm.writeVersionFile" />
                  <span class="ml-2 text-xs text-text-3">关闭后不写 version.json / version-history.json（零侵入）</span>
                </NFormItem>
              </NForm>
              <div class="flex items-center justify-between">
                <NButton type="primary" :loading="saving" @click="saveSettings">保存设置</NButton>
                <NButton quaternary type="error" @click="confirmRemove">
                  <template #icon><i class="i-carbon-trash-can" /></template>
                  移除仓库
                </NButton>
              </div>
            </div>
          </NTabPane>
        </NTabs>
      </div>
    </template>
    <div v-else-if="projectsStore.loading" class="p-10 text-center text-text-3">
      <NSpin size="small" />
    </div>
    <NResult v-else status="404" title="仓库不存在" description="可能已被移除" class="mt-10">
      <template #footer>
        <NButton @click="router.push(`/project/${pid}`)">返回项目</NButton>
      </template>
    </NResult>
  </div>
</template>
