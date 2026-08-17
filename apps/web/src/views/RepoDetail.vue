<script setup lang="ts">
// RepoDetail.vue —— 仓库详情（文件 / 版本日志 / 设置）

import type { ReleaseRecord, RepoStatus } from '@bxverse/shared'
import { useProjectsStore } from '../stores/projects'
import { api } from '../api'
import { formatDate } from '../utils/format'
import PageHeader from '../components/PageHeader.vue'
import StatusBadge from '../components/StatusBadge.vue'
import MarkdownView from '../components/MarkdownView.vue'
import FileTree from '../components/FileTree.vue'
import FileViewer from '../components/FileViewer.vue'
import DirPicker from '../components/DirPicker.vue'
import { useDialog, useMessage } from 'naive-ui'

const route = useRoute()
const router = useRouter()
const projectsStore = useProjectsStore()
const dialog = useDialog()
const message = useMessage()

const pid = computed(() => String(route.params.pid))
const rid = computed(() => String(route.params.rid))
const { repo } = computed(() => projectsStore.repoById(pid.value, rid.value)).value

const VALID_TABS = ['files', 'logs', 'settings'] as const
const tab = ref<'files' | 'logs' | 'settings'>(
  VALID_TABS.includes(route.query.tab as (typeof VALID_TABS)[number]) ? (route.query.tab as 'files' | 'logs' | 'settings') : 'files',
)

// Tab 状态同步 URL（刷新/分享保持状态）
watch(tab, (t) => {
  if (String(route.query.tab ?? '') !== t) {
    void router.replace({ query: { ...route.query, tab: t } })
  }
})
watch(
  () => route.query.tab,
  (v) => {
    if (v && VALID_TABS.includes(v as (typeof VALID_TABS)[number]) && v !== tab.value) {
      tab.value = v as 'files' | 'logs' | 'settings'
    }
  },
)
const status = ref<RepoStatus | null>(null)
const statusLoading = ref(true)
const releases = ref<ReleaseRecord[]>([])
const releasesLoading = ref(false)
const dirPickerOpen = ref(false)

const selectedFile = ref('')
const logTrack = ref<'external' | 'internal'>('external')
const selectedRelease = ref<ReleaseRecord | null>(null)

// ---------- 历史发布日志人工编辑（api.editLog，server history.ts 已实现） ----------
const editing = ref(false)
const editText = ref('')
const editSaving = ref(false)

function startEdit() {
  if (!selectedRelease.value) return
  editText.value = selectedRelease.value.logs[logTrack.value].content
  editing.value = true
}

function cancelEdit() {
  editing.value = false
  editText.value = ''
}

function applyUpdated(updated: ReleaseRecord) {
  const idx = releases.value.findIndex(r => r.id === updated.id)
  if (idx !== -1) releases.value[idx] = updated
  selectedRelease.value = updated
}

async function saveEdit() {
  if (!selectedRelease.value) return
  editSaving.value = true
  try {
    const updated = await api.editLog(selectedRelease.value.id, { track: logTrack.value, action: 'edit', content: editText.value })
    applyUpdated(updated)
    message.success('日志已保存（状态「已编辑」，仍可继续确认）')
    editing.value = false
  } catch (e) {
    message.error((e as Error).message)
  } finally {
    editSaving.value = false
  }
}

async function confirmEdit() {
  if (!selectedRelease.value) return
  editSaving.value = true
  try {
    const updated = await api.editLog(selectedRelease.value.id, { track: logTrack.value, action: 'confirm' })
    applyUpdated(updated)
    message.success('日志已确认')
  } catch (e) {
    message.error((e as Error).message)
  } finally {
    editSaving.value = false
  }
}

async function resetEdit() {
  if (!selectedRelease.value) return
  if (!window.confirm('恢复为自动草稿将丢弃当前人工编辑，确定继续？')) return
  editSaving.value = true
  try {
    const updated = await api.editLog(selectedRelease.value.id, { track: logTrack.value, action: 'reset' })
    applyUpdated(updated)
    editText.value = updated.logs[logTrack.value].content
    editing.value = false
  } catch (e) {
    message.error((e as Error).message)
  } finally {
    editSaving.value = false
  }
}

// 编辑中切换内外轨 → 丢弃编辑态（内容按新轨重新可编辑）
watch(logTrack, () => {
  if (editing.value) cancelEdit()
})

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
  displayName: '',
  buildCommand: '',
  outputDir: 'public',
  writeVersionFile: true,
  artifactDir: '',
})
const saving = ref(false)

function openSettings() {
  if (!repo) return
  settingsForm.name = repo.name
  settingsForm.displayName = repo.displayName ?? ''
  settingsForm.buildCommand = repo.buildCommand ?? ''
  settingsForm.outputDir = repo.outputDir ?? 'public'
  settingsForm.writeVersionFile = repo.writeVersionFile ?? true
  settingsForm.artifactDir = repo.artifactDir ?? ''
}

async function saveSettings() {
  if (!repo) return
  saving.value = true
  try {
    await projectsStore.updateRepo(pid.value, rid.value, {
      name: settingsForm.name.trim() || undefined,
      displayName: settingsForm.displayName.trim() || undefined,
      buildCommand: settingsForm.buildCommand || undefined,
      outputDir: settingsForm.outputDir,
      writeVersionFile: settingsForm.writeVersionFile,
      artifactDir: settingsForm.artifactDir.trim() || undefined,
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
        :back-to="`/project/${pid}`"
        icon="i-carbon-git-branch"
      >
        <template #badges>
          <span v-if="status" class="chip">
            <i aria-hidden="true" class="i-carbon-git-branch" /> {{ status.branch }}
          </span>
          <StatusBadge v-if="status?.changed" type="changed" :count="status.commits.length" />
          <StatusBadge v-if="status && status.dirty > 0" type="dirty" :count="status.dirty" />
          <StatusBadge v-if="status && !status.hasRemote" type="local" />
        </template>
        <span v-if="repo.remote" class="chip code-text max-w-60 truncate" :title="repo.remote">
          {{ repo.remote }}
          <button
            type="button"
            class="shrink-0 inline-flex items-center justify-center text-text-3 transition-colors duration-140 hover:text-brand-500 focus-ring rounded"
            aria-label="复制远程地址"
            title="复制远程地址"
            @click="copyRemote"
          >
            <i aria-hidden="true" class="i-carbon-copy" />
          </button>
        </span>
      </PageHeader>

      <div class="card overflow-hidden">
        <NTabs v-model:value="tab" type="line" animated :pane-style="{ padding: '0' }">
          <NTabPane name="files" tab="文件">
            <div class="flex h-140">
              <div class="w-72 shrink-0 border-r border-border overflow-y-auto">
                <FileTree :pid="pid" :rid="rid" @select="p => selectedFile = p" />
              </div>
              <div class="flex-1 min-w-0">
                <FileViewer :pid="pid" :rid="rid" :path="selectedFile" />
              </div>
            </div>
          </NTabPane>

          <NTabPane name="logs" tab="版本日志">
            <div class="flex h-140">
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
                    role="button"
                    tabindex="0"
                    :aria-label="`查看 ${r.version} 发布记录`"
                    @click="selectedRelease = r"
                    @keydown.enter="selectedRelease = r"
                    @keydown.space.prevent="selectedRelease = r"
                  >
                    <div class="code-text text-sm text-text-1" translate="no">{{ r.version }}</div>
                    <div class="text-xs text-text-3 mt-0.5">{{ formatDate(r.date) }} · {{ r.stats.commits }} 提交</div>
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
                  <template v-if="editing">
                    <NButton size="tiny" secondary type="primary" :loading="editSaving" @click="saveEdit">保存</NButton>
                    <NButton size="tiny" quaternary :disabled="editSaving" @click="confirmEdit">确认</NButton>
                    <NButton size="tiny" quaternary :disabled="editSaving" @click="resetEdit">恢复自动草稿</NButton>
                    <NButton size="tiny" quaternary @click="cancelEdit">取消</NButton>
                  </template>
                  <NButton v-else size="tiny" quaternary @click="startEdit">
                    <template #icon><i aria-hidden="true" class="i-carbon-edit" /></template>
                    编辑日志
                  </NButton>
                  <span class="text-xs text-text-3">{{ selectedRelease.stats.commits }} 提交 · +{{ selectedRelease.stats.insertions }} / -{{ selectedRelease.stats.deletions }}</span>
                </div>
                <div class="flex-1 overflow-y-auto p-5">
                  <textarea
                    v-if="editing"
                    v-model="editText"
                    class="h-full w-full bg-transparent resize-none outline-none font-mono text-13px leading-6 text-text-1"
                    placeholder="在此编辑日志内容…"
                    autocomplete="off"
                    spellcheck="false"
                    aria-label="编辑发布日志"
                  />
                  <MarkdownView v-else-if="selectedRelease" :content="selectedRelease.logs[logTrack].content" />
                </div>
              </div>
            </div>
          </NTabPane>

          <NTabPane name="settings" tab="设置">
            <div class="p-5 max-w-xl space-y-5">
              <div>
                <div class="text-sm font-medium text-text-1 mb-1">本地路径</div>
                <div class="code-text text-13px text-text-2 bg-surface-alt border border-border rounded-md px-3 py-2">{{ repo.path }}</div>
              </div>
              <NForm label-placement="left" label-width="110">
                <NFormItem label="英文名">
                  <NInput v-model:value="settingsForm.name" placeholder="如：l-pc-front（app 标识）" />
                </NFormItem>
                <NFormItem label="中文名">
                  <NInput v-model:value="settingsForm.displayName" placeholder="如：PC 前端（可选，版本清单导出用）" />
                </NFormItem>
                <NFormItem label="构建命令">
                  <NInput v-model:value="settingsForm.buildCommand" placeholder="如：pnpm build（发版前执行，可留空）" />
                </NFormItem>
                <NFormItem label="产物目录">
                  <NInput v-model:value="settingsForm.outputDir" placeholder="public" />
                </NFormItem>
                <NFormItem label="备份产物目录">
                  <div class="flex items-center gap-2 w-full">
                    <NInput
                      v-model:value="settingsForm.artifactDir"
                      placeholder="如：dist（发布时归档备份，可留空）"
                    />
                    <NButton secondary size="small" @click="dirPickerOpen = true">
                      <template #icon><i aria-hidden="true" class="i-carbon-folder-open" /></template>
                      选择
                    </NButton>
                  </div>
                  <span class="text-xs text-text-3">发布时自动归档该目录（tar.gz + 哈希清单），未配置则跳过产物备份</span>
                </NFormItem>
                <NFormItem label="写入版本文件">
                  <NSwitch v-model:value="settingsForm.writeVersionFile" />
                  <span class="ml-2 text-xs text-text-3">关闭后不写 version.json / version-history.json（零侵入）</span>
                </NFormItem>
              </NForm>
              <div class="flex items-center justify-between">
                <NButton type="primary" :loading="saving" @click="saveSettings">保存设置</NButton>
                <NButton quaternary type="error" @click="confirmRemove">
                  <template #icon><i aria-hidden="true" class="i-carbon-trash-can" /></template>
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

    <!-- 产物目录树选择器（R19：仓库设置） -->
    <NModal
      v-model:show="dirPickerOpen"
      preset="card"
      title="选择备份产物目录"
      class="max-w-md"
      :bordered="false"
    >
      <DirPicker
        v-if="repo && dirPickerOpen"
        :pid="pid"
        :rid="rid"
        :model-value="settingsForm.artifactDir"
        @update:model-value="v => settingsForm.artifactDir = v"
      />
      <template #footer>
        <div class="flex justify-end gap-2">
          <NButton size="small" @click="dirPickerOpen = false">取消</NButton>
          <NButton size="small" type="primary" @click="dirPickerOpen = false">确定</NButton>
        </div>
      </template>
    </NModal>
  </div>
</template>
