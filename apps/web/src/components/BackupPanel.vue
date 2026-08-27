<script setup lang="ts">
// BackupPanel.vue —— 备份归档与对比面板（可嵌入 ProjectDetail ?tab=backups 与独立页复用）

import type { CompareResult, RepoBackupRef, BackupItem } from '@bxverse/shared'
import { api } from '../api'
import EmptyState from './EmptyState.vue'
import { formatDateTime, formatSize } from '../utils/format'
import { useBackup } from '../composables/useBackup'
import { h } from 'vue'
import { useProjectsStore } from '../stores/projects'
import { useDialog, useMessage } from 'naive-ui'

const props = defineProps<{ projectId: string }>()

const pid = computed(() => props.projectId)
const projectsStore = useProjectsStore()
const project = computed(() => projectsStore.byId(pid.value))
const dialog = useDialog()
const message = useMessage()

const {
  backupsByRepo,
  loading,
  usage,
  usageLoading,
  retentionForm,
  retentionSaving,
  cleanupLoading,
  load: loadBackups,
  loadUsage,
  loadRetention,
  saveRetention,
  doCleanup,
} = useBackup(() => pid.value)

const KIND_LABEL: Record<string, string> = {
  'source-bundle': '源码 bundle',
  'source-archive': '源码快照',
  artifact: '产物归档',
}
const KIND_ICON: Record<string, string> = {
  'source-bundle': 'i-carbon-git-branch',
  'source-archive': 'i-carbon-document',
  artifact: 'i-carbon-cube',
}

async function reload() {
  if (!project.value) return
  await Promise.all([loadBackups(project.value.repos), loadUsage()])
}

watch(() => props.projectId, async () => {
  if (!project.value) await projectsStore.load()
  await Promise.all([loadBackups(project.value?.repos ?? []), loadUsage(), loadRetention()])
}, { immediate: true })

onMounted(async () => {
  if (!project.value) await projectsStore.load()
  await Promise.all([loadBackups(project.value?.repos ?? []), loadUsage(), loadRetention()])
})

// 磁盘占用与保留策略 — 具名函数（原模板内联 300 字符 async 已抽离）
async function previewCleanup() {
  const r = await doCleanup(true)
  if (r.deleted.length) {
    panel.title = `清理预览 · 将删除 ${r.deleted.length} 份`
    panel.result = {
      kind: 'verify',
      files: r.deleted.map(d => ({ path: `${d.repoName} ${d.version}`, status: 'removed' as const, left: { size: d.items.reduce((s, i) => s + i.size, 0) } })),
      totals: { added: 0, removed: r.deleted.length, modified: 0, same: 0 },
    }
    panel.open = true
  } else {
    message.info('按当前策略无过期备份')
  }
}

async function executeCleanup() {
  const r = await doCleanup(false)
  message.success(`已清理 ${r.deleted.length} 份，释放 ${formatSize(r.freedBytes)}`)
  await reload()
}

async function handleSaveRetention() {
  try {
    await saveRetention()
    message.success('保留策略已保存')
  } catch (e) {
    message.error((e as Error).message)
  }
}

// 下载 / 删除
async function downloadItem(ref: RepoBackupRef, kind: string) {
  try {
    const { blob, filename } = await api.backupDownload(ref.releaseId, ref.repoId, kind)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    message.error((e as Error).message)
  }
}
function confirmRemove(ref: RepoBackupRef) {
  dialog.warning({
    title: '删除备份',
    content: `确定删除「${ref.repoName}」${ref.version} 的全部备份文件与元数据？此操作不可恢复。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await api.deleteBackup(ref.releaseId, ref.repoId)
        message.success('备份已删除')
        await reload()
      } catch (e) {
        message.error((e as Error).message)
      }
    },
  })
}

// 对比选择
const selected = ref<RepoBackupRef[]>([])
function isSelected(r: RepoBackupRef): boolean {
  return selected.value.some(s => s.releaseId === r.releaseId && s.repoId === r.repoId)
}
function toggleSelect(r: RepoBackupRef) {
  if (isSelected(r)) {
    selected.value = selected.value.filter(s => !(s.releaseId === r.releaseId && s.repoId === r.repoId))
    return
  }
  if (selected.value.length >= 2) {
    message.warning('最多选择两次发布进行对比')
    return
  }
  if (selected.value.length === 1 && selected.value[0].repoId !== r.repoId) {
    message.warning('请选择同一仓库的两次发布')
    return
  }
  selected.value = [...selected.value, r]
}
const canCompare = computed(() => selected.value.length === 2)
const orderedSelected = computed(() => [...selected.value].sort((a, b) => a.date.localeCompare(b.date)))

const panel = reactive({ open: false, title: '', loading: false, result: null as CompareResult | null })
async function runCompare(kind: 'artifact' | 'source') {
  const [older, newer] = orderedSelected.value
  panel.title = kind === 'artifact' ? '产物对比' : '源码对比'
  panel.open = true
  panel.loading = true
  panel.result = null
  try {
    if (kind === 'artifact') {
      panel.result = await api.compareBackups({
        kind: 'artifact',
        left: { releaseId: older.releaseId, repoId: older.repoId },
        right: { releaseId: newer.releaseId, repoId: newer.repoId },
      })
    } else {
      panel.result = await api.repoDiff(pid.value, older.repoId, older.tag || older.commit, newer.tag || newer.commit)
    }
  } catch (e) {
    message.error((e as Error).message)
    panel.open = false
  } finally {
    panel.loading = false
  }
}
async function runVerify(ref: RepoBackupRef) {
  panel.title = `完整性校验 · ${ref.repoName} ${ref.version}`
  panel.open = true
  panel.loading = true
  panel.result = null
  try {
    panel.result = await api.verifyBackup(ref.releaseId, ref.repoId)
  } catch (e) {
    message.error((e as Error).message)
    panel.open = false
  } finally {
    panel.loading = false
  }
}
const STATUS_LABEL: Record<string, string> = { added: '新增', removed: '缺失', modified: '变更', same: '一致' }
function exportReport() {
  const r = panel.result
  if (!r) return
  const rows = r.files.map(f => `| ${STATUS_LABEL[f.status] ?? f.status} | ${f.path} | ${f.left?.size ?? '—'} | ${f.right?.size ?? '—'} | ${f.insertions ?? '—'} | ${f.deletions ?? '—'} |`).join('\n')
  const md = [`# 一致性对比报告`, ``, `- 类型：${panel.title}`, `- 左侧：${r.left ?? '—'}`, `- 右侧：${r.right ?? '—'}`, `- 汇总：新增 ${r.totals.added} / 缺失 ${r.totals.removed} / 变更 ${r.totals.modified} / 一致 ${r.totals.same}`, ``, `| 状态 | 文件 | 左侧大小 | 右侧大小 | 插入 | 删除 |`, `|---|---|---|---|---|---|`, rows, ``].join('\n')
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `对比报告-${Date.now()}.md`
  a.click()
  URL.revokeObjectURL(url)
}
const STATUS_CHIP: Record<string, string> = { added: 'chip-brand', modified: 'chip-info', same: 'chip-dim', removed: 'chip-error' }
const STATUS_PREFIX: Record<string, string> = { added: '+', modified: '~', same: '=', removed: '-' }
const compareColumns = [
  { title: '状态', key: 'status', width: 70, render: (row: { status: string }) => h('span', { class: `chip code-text ${STATUS_CHIP[row.status] ?? 'chip-dim'}` }, `${STATUS_PREFIX[row.status] ?? ''} ${STATUS_LABEL[row.status] ?? row.status}`) },
  { title: '文件', key: 'path', ellipsis: { tooltip: true } },
  { title: '插入', key: 'insertions', width: 70 },
  { title: '删除', key: 'deletions', width: 70 },
  { title: '左侧大小', key: 'leftSize', width: 100 },
  { title: '右侧大小', key: 'rightSize', width: 100 },
]
const compareRows = computed(() =>
  (panel.result?.files ?? []).map(f => ({
    status: f.status,
    path: f.path,
    insertions: f.insertions != null ? String(f.insertions) : '—',
    deletions: f.deletions != null ? String(f.deletions) : '—',
    leftSize: f.left?.size != null ? formatSize(f.left.size) : '—',
    rightSize: f.right?.size != null ? formatSize(f.right.size) : '—',
  })),
)

// 恢复（M7 收口：默认路径/白名单提示/冲突策略/版本号二次确认/恢复审计）
const restoreState = reactive({
  open: false,
  kind: '' as string,
  targetDir: '',
  overwrite: false,
  confirm: '',
  loading: false,
  ref: null as RepoBackupRef | null,
})
const bxHome = ref('')
onMounted(async () => {
  try {
    const h = await api.health()
    bxHome.value = h.home ?? ''
  } catch {
    // 获取失败时留空，用户手动输入绝对路径
  }
})
/** 版本号二次确认通过才解锁恢复按钮 */
const restoreConfirmed = computed(
  () => !!restoreState.ref && restoreState.confirm.trim() === restoreState.ref.version,
)
function openRestore(ref: RepoBackupRef) {
  restoreState.ref = ref
  restoreState.kind = ref.items.find(i => ['source-bundle', 'source-archive', 'artifact'].includes(i.kind))?.kind ?? ''
  // 默认恢复到 BX_HOME/restores/{version}-{repoName}（服务端白名单要求位于 BX_HOME 内）
  const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, '-')
  restoreState.targetDir = bxHome.value
    ? `${bxHome.value}\\restores\\${safe(ref.version)}-${safe(ref.repoName)}`
    : ''
  restoreState.overwrite = false
  restoreState.confirm = ''
  restoreState.open = true
}
async function doRestore() {
  if (!restoreState.ref || !restoreState.kind || !restoreState.targetDir.trim()) {
    message.warning('请选择类型并填写目标绝对路径')
    return
  }
  if (!restoreConfirmed.value) {
    message.warning(`请输入版本号 ${restoreState.ref.version} 以确认恢复`)
    return
  }
  restoreState.loading = true
  try {
    const r = await api.backupRestore({
      releaseId: restoreState.ref.releaseId,
      repoId: restoreState.ref.repoId,
      kind: restoreState.kind,
      targetDir: restoreState.targetDir.trim(),
      overwrite: restoreState.overwrite,
    })
    message.success(`已恢复到 ${restoreState.targetDir.trim()}（第 ${r.restores} 次恢复，已入审计）`)
    restoreState.open = false
    await reload()
  } catch (e) {
    message.error((e as Error).message)
  } finally {
    restoreState.loading = false
  }
}
function pickDirectory() {
  // 浏览器无法拿到目录绝对路径（File System Access 只给句柄），保留为提示性入口
  message.info('浏览器无法读取目录绝对路径，请手动输入（须位于 BX_HOME 白名单内）')
}
</script>

<template>
  <div class="space-y-5">
    <!-- 磁盘占用与保留策略 -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div class="glass-panel p-4 rounded-2xl">
        <div class="flex items-center justify-between mb-2">
          <span class="text-sm font-medium flex items-center gap-1.5"><i class="i-carbon-data--base" /> 磁盘占用</span>
          <NButton size="tiny" :loading="usageLoading" @click="loadUsage()">刷新</NButton>
        </div>
        <div v-if="usage" class="space-y-1 text-xs">
          <div>总计：<span class="font-mono font-medium">{{ formatSize(usage.totalBytes) }}</span> · {{ usage.totalCount }} 份</div>
          <div v-for="r in usage.byRepo" :key="r.repoId" class="flex justify-between">
            <span class="truncate">{{ r.repoName }}</span>
            <span class="font-mono">{{ r.count }} 份 · {{ formatSize(r.bytes) }}</span>
          </div>
          <div v-if="usage.byRepo.length === 0" class="text-text-3">暂无备份</div>
        </div>
        <div v-else class="text-xs text-text-3">加载中…</div>
        <div class="flex gap-2 mt-3">
          <NButton size="tiny" :loading="cleanupLoading" @click="previewCleanup">预览清理</NButton>
          <NButton size="tiny" type="warning" :loading="cleanupLoading" @click="executeCleanup">执行清理</NButton>
        </div>
      </div>
      <div class="glass-panel p-4 rounded-2xl">
        <div class="text-sm font-medium mb-2 flex items-center gap-1.5"><i class="i-carbon-settings" /> 保留策略（按仓库）</div>
        <div class="grid grid-cols-3 gap-2">
          <div>
            <div class="text-xs text-text-3 mb-1">保留份数</div>
            <NInputNumber v-model:value="retentionForm.keepLast" placeholder="不限" :min="1" size="small" clearable />
          </div>
          <div>
            <div class="text-xs text-text-3 mb-1">最大 MB</div>
            <NInputNumber v-model:value="retentionForm.maxBytesMB" placeholder="不限" :min="1" size="small" clearable />
          </div>
          <div>
            <div class="text-xs text-text-3 mb-1">保留天数</div>
            <NInputNumber v-model:value="retentionForm.keepDays" placeholder="不限" :min="1" size="small" clearable />
          </div>
        </div>
        <NButton size="small" type="primary" class="mt-3" :loading="retentionSaving" @click="handleSaveRetention">保存策略</NButton>
        <div class="text-xs text-text-3 mt-1">发布后自动按此策略清理；留空表示不限制</div>
      </div>
    </div>

    <!-- 对比操作栏 -->
    <div v-if="canCompare" class="glass-panel p-3 rounded-xl flex items-center gap-2 flex-wrap">
      <span class="text-xs text-text-2">已选: {{ orderedSelected[0].version }} ↔ {{ orderedSelected[1].version }}</span>
      <NButton type="primary" size="small" @click="runCompare('artifact')"><template #icon><i class="i-carbon-compare" /></template>产物对比</NButton>
      <NButton size="small" secondary @click="runCompare('source')"><template #icon><i class="i-carbon-git-compare" /></template>源码对比</NButton>
      <NButton quaternary size="small" @click="selected = []">清空</NButton>
    </div>

    <div v-if="loading" class="p-10 text-center text-text-3"><NSpin size="small" /></div>
    <template v-else-if="project">
      <div v-if="project.repos.length === 0" class="card"><EmptyState title="暂无仓库" description="接入仓库并发布后，这里将展示每次发布的备份。" /></div>
      <div v-else class="space-y-5">
        <section v-for="repo in project.repos" :key="repo.id" class="glass-panel p-5 rounded-2xl">
          <div class="flex items-center gap-2 mb-3">
            <i aria-hidden="true" class="i-carbon-git-branch text-brand-500" />
            <span class="font-medium text-sm">{{ repo.displayName || repo.name }}</span>
            <span class="chip">{{ backupsByRepo[repo.id]?.length ?? 0 }}</span>
            <span v-if="repo.artifactDir" class="code-text text-xs text-text-3">产物目录：{{ repo.artifactDir }}</span>
            <span v-else class="code-text text-xs text-text-3">未配置产物目录（仅源码备份）</span>
          </div>
          <div v-if="(backupsByRepo[repo.id]?.length ?? 0) === 0" class="py-4 text-center text-xs text-text-3">暂无备份——发布一次后自动生成</div>
          <div v-else class="space-y-2">
            <div v-for="r in backupsByRepo[repo.id]" :key="r.releaseId" class="flex items-center gap-3 px-3.5 py-3 rounded-[var(--bx-radius-md)] border bg-surface transition-[border-color,background-color] duration-150" :class="isSelected(r) ? 'border-brand-500 bg-brand-soft' : 'border-border hover:border-border-strong'">
              <NCheckbox :checked="isSelected(r)" @update:checked="toggleSelect(r)" />
              <span class="w-[34px] h-[34px] flex items-center justify-center rounded-[9px] bg-surface-alt border border-border text-text-3 shrink-0"><i class="text-16px" :class="KIND_ICON[r.items[0]?.kind ?? ''] ?? 'i-carbon-database'" /></span>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="code-text text-13px">{{ r.version }}</span>
                  <span class="text-xs text-text-3">{{ formatDateTime(r.date) }}</span>
                  <span v-if="r.tag" class="code-text text-xs text-text-3">{{ r.tag }}</span>
                </div>
                <div class="flex items-center gap-2 mt-1 flex-wrap">
                  <span v-for="item in r.items" :key="item.kind" class="chip">{{ KIND_LABEL[item.kind] ?? item.kind }} · {{ formatSize(item.size) }}</span>
                  <span v-if="r.restores?.length" class="chip chip-brand" :title="`最近恢复：${formatDateTime(r.restores[r.restores.length - 1].at)} → ${r.restores[r.restores.length - 1].targetDir}`">
                    已恢复 ×{{ r.restores.length }}
                  </span>
                </div>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                                <NDropdown
                  trigger="click"
                  :options="r.items.map((i: BackupItem) => ({ label: `下载 ${KIND_LABEL[i.kind] ?? i.kind}（${formatSize(i.size)}）`, key: i.kind }))" @select="(k: string) => downloadItem(r, k)">
                  <button class="w-7 h-7 flex items-center justify-center rounded-md text-text-3 hover:bg-surface-hover hover:text-text-1 transition-colors" aria-label="下载" title="下载"><i class="i-carbon-download" /></button>
                </NDropdown>
                <button class="w-7 h-7 flex items-center justify-center rounded-md text-text-3 hover:bg-surface-hover hover:text-text-1 transition-colors" aria-label="校验" title="校验" @click="runVerify(r)"><i class="i-carbon-checkmark-outline" /></button>
                <button class="w-7 h-7 flex items-center justify-center rounded-md text-text-3 hover:bg-surface-hover hover:text-text-1 transition-colors" aria-label="恢复" title="恢复到本地目录" @click="openRestore(r)"><i class="i-carbon-undo" /></button>
                <button class="w-7 h-7 flex items-center justify-center rounded-md text-text-3 hover:bg-error-soft hover:text-error transition-colors" aria-label="删除" title="删除" @click="confirmRemove(r)"><i class="i-carbon-trash-can" /></button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </template>

    <!-- 对比/校验结果 -->
    <NModal v-model:show="panel.open" preset="card" :title="panel.title" class="max-w-3xl" :bordered="false" style="width: min(90vw, 800px)">
      <div v-if="panel.loading" class="py-10 text-center text-text-3"><NSpin size="small" /> 正在对比…</div>
      <template v-else-if="panel.result">
        <div class="flex items-center gap-2 mb-3 flex-wrap">
          <span class="chip">新增 {{ panel.result.totals.added }}</span>
          <span class="chip">缺失 {{ panel.result.totals.removed }}</span>
          <span class="chip text-warning">变更 {{ panel.result.totals.modified }}</span>
          <span class="chip text-success">一致 {{ panel.result.totals.same }}</span>
          <div class="flex-1" />
          <NButton size="tiny" secondary @click="exportReport"><template #icon><i class="i-carbon-download" /></template>导出校验报告</NButton>
        </div>
        <NDataTable size="small" :columns="compareColumns" :data="compareRows" :max-height="420" :bordered="false" />
      </template>
    </NModal>

    <!-- 恢复（M7 收口） -->
    <NModal v-model:show="restoreState.open" preset="card" title="恢复备份到本地目录" style="width: min(90vw, 560px)" :bordered="false" aria-label="恢复备份">
      <div class="space-y-3">
        <div class="text-xs text-text-3 leading-relaxed">
          目标目录须位于 BX_HOME 白名单内{{ bxHome ? `（${bxHome} 及子目录）` : '' }}，不存在将自动创建；
          不触碰业务仓库（零侵入）。恢复成功会写入审计记录。
        </div>
        <div>
          <div class="text-xs text-text-2 mb-1">备份：{{ restoreState.ref?.repoName }} {{ restoreState.ref?.version }}</div>
          <NRadioGroup v-model:value="restoreState.kind">
            <NSpace>
              <NRadio v-for="it in restoreState.ref?.items ?? []" :key="it.kind" :value="it.kind">{{ KIND_LABEL[it.kind] ?? it.kind }} ({{ formatSize(it.size) }})</NRadio>
            </NSpace>
          </NRadioGroup>
        </div>
        <div>
          <div class="text-xs text-text-2 mb-1">目标绝对路径</div>
          <div class="flex gap-2">
            <NInput v-model:value="restoreState.targetDir" placeholder="BX_HOME 内的绝对路径…" class="flex-1" autocomplete="off" spellcheck="false" />
            <NButton secondary @click="pickDirectory">选择目录</NButton>
          </div>
        </div>
        <NCheckbox v-if="restoreState.kind !== 'source-bundle'" v-model:checked="restoreState.overwrite">
          目标目录非空时覆盖同名文件（快照/产物适用；bundle 走 git clone 仍要求空目录）
        </NCheckbox>
        <div>
          <div class="text-xs text-text-2 mb-1">
            二次确认：输入版本号 <span class="font-mono text-text-1">{{ restoreState.ref?.version }}</span> 解锁恢复
          </div>
          <NInput
            v-model:value="restoreState.confirm"
            :placeholder="`${restoreState.ref?.version ?? ''}…`"
            autocomplete="off"
            spellcheck="false"
            :status="restoreState.confirm && !restoreConfirmed ? 'error' : undefined"
          />
        </div>
      </div>
      <template #footer>
        <div class="flex justify-end gap-2">
          <NButton @click="restoreState.open = false">取消</NButton>
          <NButton type="primary" :loading="restoreState.loading" :disabled="!restoreConfirmed" @click="doRestore">开始恢复</NButton>
        </div>
      </template>
    </NModal>
  </div>
</template>
