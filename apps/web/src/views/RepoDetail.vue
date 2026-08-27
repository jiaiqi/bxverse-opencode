<script setup lang="ts">
// RepoDetail.vue —— 仓库详情（文件 / 版本日志 / 设置）

import type { ReleaseRecord, RepoStatus } from '@bxverse/shared'
import { useProjectsStore } from '../stores/projects'
import { api } from '../api'
import { formatDate } from '../utils/format'
import MarkdownView from '../components/MarkdownView.vue'
import FileTree from '../components/FileTree.vue'
import FileViewer from '../components/FileViewer.vue'
import DirPicker from '../components/DirPicker.vue'
import GitTab from '../components/GitTab.vue'
import ErrorState from '../components/ErrorState.vue'
import { useDialog, useMessage } from 'naive-ui'

const route = useRoute()
const router = useRouter()
const projectsStore = useProjectsStore()
const dialog = useDialog()
const message = useMessage()

const pid = computed(() => String(route.params.pid))
const rid = computed(() => String(route.params.rid))
const repo = computed(() => projectsStore.repoById(pid.value, rid.value)?.repo ?? null)

const VALID_TABS = ['git', 'files', 'logs', 'settings'] as const
const tab = ref<'git' | 'files' | 'logs' | 'settings'>(
  VALID_TABS.includes(route.query.tab as (typeof VALID_TABS)[number]) ? (route.query.tab as 'git' | 'files' | 'logs' | 'settings') : 'git',
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
const releasesError = ref<string | null>(null)
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

function resetEdit() {
  if (!selectedRelease.value) return
  dialog.warning({
    title: '恢复自动草稿',
    content: '恢复为自动草稿将丢弃当前人工编辑，确定继续？',
    positiveText: '确定',
    negativeText: '取消',
    onPositiveClick: async () => {
      editSaving.value = true
      try {
        const updated = await api.editLog(selectedRelease.value!.id, { track: logTrack.value, action: 'reset' })
        applyUpdated(updated)
        editText.value = updated.logs[logTrack.value].content
        editing.value = false
      } catch (e) {
        message.error((e as Error).message)
      } finally {
        editSaving.value = false
      }
    },
  })
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
  releasesError.value = null
  try {
    const all = await api.releasesByScope(rid.value)
    const list = Array.isArray(all) ? all : [all]
    releases.value = list.filter(r => r.kind === 'repo')
    if (releases.value.length) selectedRelease.value = releases.value[0]
  } catch (e) {
    releasesError.value = (e as Error).message
  } finally {
    releasesLoading.value = false
  }
}

// 设置表单（扩展 R26：构建流水线与 package.json 版本源）
const settingsForm = reactive({
  name: '',
  displayName: '',
  buildCommand: '',
  outputDir: 'public',
  writeVersionFile: true,
  artifactDir: '',
  versionSource: 'derived' as 'derived' | 'packageJson',
  packageManager: '' as '' | 'pnpm' | 'npm' | 'yarn' | 'bun',
  installCommand: '',
  preBuildCommand: '',
  buildTimeoutMs: 600000,
  versionSyncCommit: 'package' as 'package' | 'none',
})
const saving = ref(false)

function openSettings() {
  if (!repo.value) return
  settingsForm.name = repo.value.name
  settingsForm.displayName = repo.value.displayName ?? ''
  settingsForm.buildCommand = repo.value.buildCommand ?? ''
  settingsForm.outputDir = repo.value.outputDir ?? 'public'
  settingsForm.writeVersionFile = repo.value.writeVersionFile ?? true
  settingsForm.artifactDir = repo.value.artifactDir ?? ''
  settingsForm.versionSource = repo.value.versionSource ?? 'derived'
  settingsForm.packageManager = (repo.value.packageManager ?? '') as '' | 'pnpm' | 'npm' | 'yarn' | 'bun'
  settingsForm.installCommand = repo.value.installCommand ?? ''
  settingsForm.preBuildCommand = repo.value.preBuildCommand ?? ''
  settingsForm.buildTimeoutMs = repo.value.buildTimeoutMs ?? 600000
  settingsForm.versionSyncCommit = repo.value.versionSyncCommit ?? 'package'
}

async function saveSettings() {
  if (!repo.value) return
  saving.value = true
  try {
    await projectsStore.updateRepo(pid.value, rid.value, {
      name: settingsForm.name.trim() || undefined,
      displayName: settingsForm.displayName.trim() || undefined,
      buildCommand: settingsForm.buildCommand || undefined,
      outputDir: settingsForm.outputDir,
      writeVersionFile: settingsForm.writeVersionFile,
      artifactDir: settingsForm.artifactDir.trim() || undefined,
      versionSource: settingsForm.versionSource,
      packageManager: settingsForm.packageManager || undefined,
      installCommand: settingsForm.installCommand || undefined,
      preBuildCommand: settingsForm.preBuildCommand || undefined,
      buildTimeoutMs: settingsForm.buildTimeoutMs,
      versionSyncCommit: settingsForm.versionSyncCommit,
    })
    message.success('设置已保存')
  } catch (e) {
    message.error((e as Error).message)
  } finally {
    saving.value = false
  }
}

function confirmRemove() {
  if (!repo.value) return
  dialog.warning({
    title: '移除仓库',
    content: `确定将「${repo.value.name}」移出本项目？${repo.value.path.includes('\\.bxverse\\') || repo.value.path.includes('/.bxverse/') ? '（克隆接入的仓库可勾选同时删除本地克隆目录）' : '（本地路径接入，仅移除管理记录，不触碰磁盘文件）'}`,
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
  <div class="page max-w-6xl space-y-4">
    <template v-if="repo">
      <!-- 仓库工作台顶栏 (Glass Panel Repo Header) -->
      <div class="glass-panel p-4 rounded-2xl flex items-center justify-between gap-3 flex-wrap">
        <div class="flex items-center gap-3 min-w-0">
          <button
            class="p-1.5 rounded-lg bg-surface-alt hover:bg-surface-hover text-text-2 hover:text-text-1 border border-border flex items-center gap-1 text-xs font-mono transition-colors cursor-pointer"
            @click="router.push(`/project/${pid}`)"
          >
            <i aria-hidden="true" class="i-carbon-arrow-left text-12px" />
            <span>返回项目</span>
          </button>
          <div class="h-4 w-px bg-border shrink-0" />
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-bold text-sm text-text-1 truncate">{{ repo.displayName || repo.name }}</span>
              <span v-if="repo.displayName" class="text-xs text-text-3 font-mono">({{ repo.name }})</span>
              <span v-if="status" class="chip code-text text-11px">
                <i aria-hidden="true" class="i-carbon-git-branch text-brand-500" /> {{ status.branch }}
              </span>
              <StatusBadge v-if="status?.changed" type="changed" :count="status.commits.length" />
              <StatusBadge v-if="status && status.dirty > 0" type="dirty" :count="status.dirty" />
            </div>
            <div class="text-[11px] font-mono text-text-3 truncate mt-0.5" :title="repo.path">{{ repo.path }}</div>
          </div>
        </div>

        <!-- 4 大子 Tab 切换器 -->
        <div class="flex items-center gap-1 p-1 rounded-xl bg-surface-alt border border-border shrink-0">
          <button
            v-for="st in [
              { id: 'git', label: 'Git 提交流与 Diff', icon: 'i-carbon-git-commit' },
              { id: 'files', label: '文件树与查看器', icon: 'i-carbon-folder' },
              { id: 'logs', label: '版本日志历史', icon: 'i-carbon-file-text' },
              { id: 'settings', label: '仓库独立设置', icon: 'i-carbon-settings' }
            ]"
            :key="st.id"
            class="px-3 py-1.5 rounded-lg text-xs font-mono font-medium flex items-center gap-1.5 transition-[background-color,border-color,color,box-shadow] cursor-pointer border-0"
            :class="tab === st.id ? 'bg-surface text-brand-600 font-bold border border-border shadow-xs' : 'text-text-3 hover:text-text-1 bg-transparent'"
            @click="tab = st.id as any"
          >
            <i aria-hidden="true" class="text-13px" :class="st.icon" />
            <span>{{ st.label }}</span>
          </button>
        </div>
      </div>

      <!-- 4 大子 Tab 视口内容 -->
      <div class="glass-panel rounded-2xl overflow-hidden min-h-[500px]">
        <!-- 1. Git 提交流与 Diff -->
        <div v-show="tab === 'git'" class="p-4">
          <GitTab :project-id="pid" :repo-id="rid" />
        </div>

        <!-- 2. 文件树与代码查看器 -->
        <div v-show="tab === 'files'" class="flex h-140">
          <div class="w-72 shrink-0 border-r border-border overflow-y-auto">
            <FileTree :pid="pid" :rid="rid" @select="p => selectedFile = p" />
          </div>
          <div class="flex-1 min-w-0">
            <FileViewer :pid="pid" :rid="rid" :path="selectedFile" />
          </div>
        </div>

        <!-- 3. 版本更新日志 -->
        <div v-show="tab === 'logs'" class="flex h-140">
          <div class="w-80 shrink-0 border-r border-border overflow-y-auto">
            <div v-if="releasesLoading" class="p-6 text-center text-text-3"><NSpin size="small" /></div>
            <div v-else-if="releasesError" class="p-4">
              <ErrorState title="加载失败" :reason="releasesError" hint="请稍后重试">
                <template #actions>
                  <NButton size="small" type="primary" @click="loadAll">重试</NButton>
                </template>
              </ErrorState>
            </div>
            <div v-else-if="releases.length === 0" class="p-4">
              <div class="text-sm text-text-3 text-center py-8 font-mono">暂无发布记录</div>
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
                <div class="code-text text-sm text-text-1 font-bold" translate="no">{{ r.version }}</div>
                <div class="text-xs text-text-3 mt-0.5 font-mono">{{ formatDate(r.date) }} · {{ r.stats.commits }} 提交</div>
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
              <span class="text-xs text-text-3 font-mono">{{ selectedRelease.stats.commits }} 提交 · +{{ selectedRelease.stats.insertions }} / -{{ selectedRelease.stats.deletions }}</span>
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
              <MarkdownView v-else-if="selectedRelease" :content="selectedRelease.logs[logTrack].content" :max-lines="800" />
            </div>
          </div>
        </div>

        <!-- 4. 仓库独立设置 -->
        <div v-show="tab === 'settings'" class="p-6 max-w-xl space-y-5">
          <div>
            <div class="text-sm font-medium text-text-1 mb-1 font-sans">本地绝对路径</div>
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
            </NFormItem>
            <NFormItem label="写入版本文件">
              <NSwitch v-model:value="settingsForm.writeVersionFile" />
              <span class="ml-2 text-xs text-text-3">关闭后不写 version.json / version-history.json（零侵入）</span>
            </NFormItem>
            <NDivider class="!my-2">R26 构建流水线与版本源</NDivider>
            <div
              v-if="status?.repoKind === 'static'"
              class="mb-3 flex items-start gap-2 rounded-lg border border-border bg-surface-alt px-3 py-2 text-xs text-text-2"
            >
              <i aria-hidden="true" class="i-carbon-information text-info text-14px mt-0.5 shrink-0" />
              <span>
                检测到该仓库无 package.json（原生静态仓库，如 html / js / jquery）：版本走派生模式；
                未配置 install / 构建命令时自动跳过，产物备份可把源码目录直接设为产物目录。
              </span>
            </div>
            <NFormItem label="版本来源">
              <NSelect
                v-model:value="settingsForm.versionSource"
                :options="[{ label: '派生版本（默认）', value: 'derived' }, { label: 'package.json 权威', value: 'packageJson' }]"
                class="flex-1"
              />
              <span class="ml-2 text-[11px] text-text-3 shrink-0">package.json 写入 X.Y.Z 核心</span>
            </NFormItem>
            <NFormItem label="包管理器">
              <NSelect
                v-model:value="settingsForm.packageManager"
                clearable
                placeholder="自动探测（按锁文件）"
                :options="[{ label: 'pnpm', value: 'pnpm' }, { label: 'npm', value: 'npm' }, { label: 'yarn', value: 'yarn' }, { label: 'bun', value: 'bun' }]"
                class="flex-1"
              />
            </NFormItem>
            <NFormItem label="安装命令">
              <NInput v-model:value="settingsForm.installCommand" placeholder="默认按锁文件推导 frozen 命令；填 skip 可跳过" />
            </NFormItem>
            <NFormItem label="前置命令">
              <NInput v-model:value="settingsForm.preBuildCommand" placeholder="如：pnpm update / codegen（install 之后、build 之前）" />
            </NFormItem>
            <NFormItem label="构建超时">
              <NInputNumber v-model:value="settingsForm.buildTimeoutMs" :min="1000" :max="3600000" :step="1000" class="flex-1" />
              <span class="ml-2 text-xs text-text-3">毫秒（默认 600000）</span>
            </NFormItem>
            <NFormItem label="版本提交">
              <NSelect
                v-model:value="settingsForm.versionSyncCommit"
                :options="[{ label: '自动提交（仅 version 文件）', value: 'package' }, { label: '只写不提交', value: 'none' }]"
                class="flex-1"
              />
            </NFormItem>
          </NForm>
          <div class="flex items-center justify-between pt-3 border-t border-border">
            <NButton type="primary" :loading="saving" @click="saveSettings">保存设置</NButton>
            <NButton quaternary type="error" @click="confirmRemove">
              <template #icon><i aria-hidden="true" class="i-carbon-trash-can" /></template>
              移除仓库
            </NButton>
          </div>
        </div>
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
        <div class="flex justify-end">
          <NButton type="primary" size="small" @click="dirPickerOpen = false">确定</NButton>
        </div>
      </template>
    </NModal>
  </div>
</template>
