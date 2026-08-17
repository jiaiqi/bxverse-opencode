<script setup lang="ts">
// BackupManage.vue —— 项目备份与一致性对比（R19/M6）
// 每仓历次发布备份列表：下载 / 完整性校验 / 删除；两次发布间产物对比与源码对比；报告导出

import type { CompareResult, RepoBackupRef } from '@bxverse/shared'
import { useProjectsStore } from '../stores/projects'
import { api } from '../api'
import PageHeader from '../components/PageHeader.vue'
import EmptyState from '../components/EmptyState.vue'
import { formatDateTime } from '../utils/format'
import { useDialog, useMessage } from 'naive-ui'

const route = useRoute()
const router = useRouter()
const projectsStore = useProjectsStore()
const dialog = useDialog()
const message = useMessage()

const pid = computed(() => String(route.params.id))
const project = computed(() => projectsStore.byId(pid.value))

const loading = ref(true)
const backupsByRepo = ref<Record<string, RepoBackupRef[]>>({})

const KIND_LABEL: Record<string, string> = {
  'source-bundle': '源码 bundle',
  'source-archive': '源码快照',
  artifact: '产物归档',
}

/** 备份类型图标（对齐原型 .bi-kind 容器） */
const KIND_ICON: Record<string, string> = {
  'source-bundle': 'i-carbon-git-branch',
  'source-archive': 'i-carbon-document',
  artifact: 'i-carbon-cube',
}

async function load() {
  loading.value = true
  try {
    if (!projectsStore.byId(pid.value)) await projectsStore.load()
    const p = projectsStore.byId(pid.value)
    const next: Record<string, RepoBackupRef[]> = {}
    if (p) {
      await Promise.all(
        p.repos.map(async (repo) => {
          try {
            const { items } = await api.repoBackups(pid.value, repo.id)
            next[repo.id] = items
          } catch {
            next[repo.id] = []
          }
        }),
      )
    }
    backupsByRepo.value = next
  } finally {
    loading.value = false
  }
}

onMounted(load)

function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

// ---------- 下载 / 删除 / 校验 ----------
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
        await load()
      } catch (e) {
        message.error((e as Error).message)
      }
    },
  })
}

// ---------- 对比选择（最多两项，须同一仓库） ----------
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

// ---------- 对比与校验结果面板 ----------
const panel = reactive({
  open: false,
  title: '',
  loading: false,
  result: null as CompareResult | null,
})

const orderedSelected = computed(() =>
  [...selected.value].sort((a, b) => a.date.localeCompare(b.date)),
)

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
      panel.result = await api.repoDiff(
        pid.value,
        older.repoId,
        older.tag || older.commit,
        newer.tag || newer.commit,
      )
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

const STATUS_LABEL: Record<string, string> = {
  added: '新增',
  removed: '缺失',
  modified: '变更',
  same: '一致',
}

function exportReport() {
  const r = panel.result
  if (!r) return
  const rows = r.files
    .map(f => `| ${STATUS_LABEL[f.status] ?? f.status} | ${f.path} | ${f.left?.size ?? '—'} | ${f.right?.size ?? '—'} | ${f.insertions ?? '—'} | ${f.deletions ?? '—'} |`)
    .join('\n')
  const md = [
    `# 一致性对比报告`,
    ``,
    `- 类型：${panel.title}`,
    `- 左侧：${r.left ?? '—'}`,
    `- 右侧：${r.right ?? '—'}`,
    `- 汇总：新增 ${r.totals.added} / 缺失 ${r.totals.removed} / 变更 ${r.totals.modified} / 一致 ${r.totals.same}`,
    ``,
    `| 状态 | 文件 | 左侧大小 | 右侧大小 | 插入 | 删除 |`,
    `|---|---|---|---|---|---|`,
    rows,
    ``,
  ].join('\n')
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `对比报告-${Date.now()}.md`
  a.click()
  URL.revokeObjectURL(url)
}

/** 对比状态 → 四色 chip（新增/变更/一致/缺失） */
const STATUS_CHIP: Record<string, string> = {
  added: 'chip-brand',
  modified: 'chip-info',
  same: 'chip-dim',
  removed: 'chip-error',
}
const STATUS_PREFIX: Record<string, string> = {
  added: '+',
  modified: '~',
  same: '=',
  removed: '-',
}

const compareColumns = [
  {
    title: '状态',
    key: 'status',
    width: 70,
    render: (row: { status: string }) =>
      h('span', { class: `chip code-text ${STATUS_CHIP[row.status] ?? 'chip-dim'}` }, `${STATUS_PREFIX[row.status] ?? ''} ${STATUS_LABEL[row.status] ?? row.status}`),
  },
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
    leftSize: f.left?.size != null ? fmtBytes(f.left.size) : '—',
    rightSize: f.right?.size != null ? fmtBytes(f.right.size) : '—',
  })),
)
</script>

<template>
  <div class="page">
    <PageHeader
      :title="`备份与对比 · ${project?.name ?? ''}`"
      description="每次发布自动备份源码与产物（元数据入数据仓库审计，大文件存本地 backups 目录）"
      :back-to="`/project/${pid}`"
      icon="i-carbon-document-protected"
    >
      <template v-if="canCompare">
        <span class="text-xs text-text-2 self-center">
          已选：{{ orderedSelected[0].version }} ↔ {{ orderedSelected[1].version }}
        </span>
        <NButton type="primary" @click="runCompare('artifact')">
          <template #icon><i aria-hidden="true" class="i-carbon-compare" /></template>
          产物对比
        </NButton>
        <NButton @click="runCompare('source')">
          <template #icon><i aria-hidden="true" class="i-carbon-git-compare" /></template>
          源码对比
        </NButton>
      </template>
    </PageHeader>

    <div v-if="loading" class="p-10 text-center text-text-3">
      <NSpin size="small" />
    </div>
    <template v-else-if="project">
      <NAlert type="info" :show-icon="true" class="mb-5">
        <div class="text-xs leading-5">
          源码快照遵循仓库 .gitignore（仅含已跟踪文件）；产物目录在各仓库「设置」中配置（未配置则发布时跳过产物备份）。
          勾选同一仓库的两次发布即可进行产物/源码对比，并导出校验报告。
        </div>
      </NAlert>

      <div v-if="project.repos.length === 0" class="card">
        <EmptyState title="暂无仓库" description="接入仓库并发布后，这里将展示每次发布的备份。" />
      </div>
      <div v-else class="space-y-5">
        <section v-for="repo in project.repos" :key="repo.id" class="card card-pad">
          <div class="flex items-center gap-2 mb-3">
            <i aria-hidden="true" class="i-carbon-git-branch text-brand-500" />
            <span class="font-medium text-sm">{{ repo.displayName || repo.name }}</span>
            <span class="chip">{{ backupsByRepo[repo.id]?.length ?? 0 }}</span>
            <span v-if="repo.artifactDir" class="code-text text-xs text-text-3">产物目录：{{ repo.artifactDir }}</span>
            <span v-else class="code-text text-xs text-text-3">未配置产物目录（仅源码备份）</span>
          </div>
          <div v-if="(backupsByRepo[repo.id]?.length ?? 0) === 0" class="py-4 text-center text-xs text-text-3">
            暂无备份——发布一次后自动生成
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="r in backupsByRepo[repo.id]"
              :key="r.releaseId"
              class="flex items-center gap-3 px-3.5 py-3 rounded-[var(--bx-radius-md)] border bg-surface transition-[border-color,background-color] duration-150"
              :class="isSelected(r) ? 'border-brand-500 bg-brand-soft' : 'border-border hover:border-border-strong'"
            >
              <NCheckbox :checked="isSelected(r)" @update:checked="toggleSelect(r)" />
              <!-- 类型图标容器（对齐原型 .bi-kind） -->
              <span class="w-[34px] h-[34px] flex items-center justify-center rounded-[9px] bg-surface-alt border border-border text-text-3 shrink-0">
                <i aria-hidden="true" class="text-16px" :class="KIND_ICON[r.items[0]?.kind ?? ''] ?? 'i-carbon-database'" />
              </span>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="code-text text-13px">{{ r.version }}</span>
                  <span class="text-xs text-text-3">{{ formatDateTime(r.date) }}</span>
                  <span v-if="r.tag" class="code-text text-xs text-text-3">{{ r.tag }}</span>
                </div>
                <div class="flex items-center gap-2 mt-1 flex-wrap">
                  <span
                    v-for="item in r.items"
                    :key="item.kind"
                    class="chip"
                  >
                    {{ KIND_LABEL[item.kind] ?? item.kind }} · {{ fmtBytes(item.size) }}
                  </span>
                </div>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <NDropdown
                  trigger="click"
                  :options="r.items.map(i => ({ label: `下载 ${KIND_LABEL[i.kind] ?? i.kind}（${fmtBytes(i.size)}）`, key: i.kind }))"
                  @select="(k: string) => downloadItem(r, k)"
                >
                  <button
                    class="w-7 h-7 flex items-center justify-center rounded-md text-text-3 hover:bg-surface-hover hover:text-text-1 transition-colors duration-150"
                    aria-label="下载"
                    title="下载"
                  >
                    <i aria-hidden="true" class="i-carbon-download" />
                  </button>
                </NDropdown>
                <button
                  class="w-7 h-7 flex items-center justify-center rounded-md text-text-3 hover:bg-surface-hover hover:text-text-1 transition-colors duration-150"
                  aria-label="校验"
                  title="校验"
                  @click="runVerify(r)"
                >
                  <i aria-hidden="true" class="i-carbon-checkmark-outline" />
                </button>
                <button
                  class="w-7 h-7 flex items-center justify-center rounded-md text-text-3 hover:bg-error-soft hover:text-error transition-colors duration-150"
                  aria-label="删除"
                  title="删除"
                  @click="confirmRemove(r)"
                >
                  <i aria-hidden="true" class="i-carbon-trash-can" />
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </template>
    <NResult v-else status="404" title="项目不存在" class="mt-10">
      <template #footer>
        <NButton @click="router.push('/')">返回总览</NButton>
      </template>
    </NResult>

    <!-- 对比/校验结果面板 -->
    <NModal
      v-model:show="panel.open"
      preset="card"
      :title="panel.title"
      class="max-w-3xl"
      :bordered="false"
      style="width: min(90vw, 800px)"
    >
      <div v-if="panel.loading" class="py-10 text-center text-text-3">
        <NSpin size="small" />
        正在对比…
      </div>
      <template v-else-if="panel.result">
        <div class="flex items-center gap-2 mb-3 flex-wrap">
          <span class="chip">新增 {{ panel.result.totals.added }}</span>
          <span class="chip">缺失 {{ panel.result.totals.removed }}</span>
          <span class="chip text-warning">变更 {{ panel.result.totals.modified }}</span>
          <span class="chip text-success">一致 {{ panel.result.totals.same }}</span>
          <div class="flex-1" />
          <NButton size="tiny" secondary @click="exportReport">
            <template #icon><i aria-hidden="true" class="i-carbon-download" /></template>
            导出校验报告
          </NButton>
        </div>
        <NDataTable
          size="small"
          :columns="compareColumns"
          :data="compareRows"
          :max-height="420"
          :bordered="false"
        />
      </template>
    </NModal>
  </div>
</template>
