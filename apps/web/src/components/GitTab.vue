<script setup lang="ts">
// GitTab.vue —— 仓库内 Git 面板（R22）
// - 状态：branch / ahead-behind / 脏文件清单（已暂存 / 未暂存 / 未追踪）
// - 操作：暂存 / 撤销暂存 / 拉取 / 推送 / 提交（支持 AI 生成 Conventional Commits 信息）
// - 文件 diff 侧栏 + AI 解读已暂存差异

import { onMounted, ref, computed } from 'vue'
import type { GitFileDiff, GitFileStatus, GitStatus, AiExplainDiffResult } from '@bxverse/shared'
import { api } from '../api'
import { useMessage } from 'naive-ui'
import ErrorState from './ErrorState.vue'

const props = defineProps<{ projectId: string; repoId: string }>()
const message = useMessage()

const status = ref<GitStatus | null>(null)
const statusLoading = ref(false)
const statusError = ref<string | null>(null)
const selectedPath = ref<string | null>(null)
const selectedDiff = ref<GitFileDiff | null>(null)
const diffLoading = ref(false)

// ---------- 提交弹窗 ----------
const commitModal = reactive({
  open: false,
  subject: '',
  body: '',
  generating: false,
  submitting: false,
})
const commitSummary = computed(() => {
  if (!status.value) return ''
  const s = status.value
  const staged = s.files.filter(f => f.staged)
  const counts = { M: 0, A: 0, D: 0, R: 0, '?': 0 } as Record<string, number>
  for (const f of staged) {
    const key = f.untracked ? '?' : (f.indexStatus || 'M')
    counts[key] = (counts[key] ?? 0) + 1
  }
  return staged.map(f => `${f.indexStatus}${f.workStatus} ${f.path}`).join('\n')
})

// ---------- AI 解读 ----------
const explainResult = ref<AiExplainDiffResult | null>(null)
const explainLoading = ref(false)

// ---------- 操作 ----------
async function loadStatus() {
  statusLoading.value = true
  statusError.value = null
  try {
    status.value = await api.gitStatus(props.projectId, props.repoId)
  } catch (e) {
    statusError.value = (e as Error).message
    status.value = null
    message.error((e as Error).message)
  } finally {
    statusLoading.value = false
  }
}

async function selectFile(path: string) {
  selectedPath.value = path
  selectedDiff.value = null
  diffLoading.value = true
  explainResult.value = null
  try {
    const file = status.value?.files.find(f => f.path === path)
    const range = file?.untracked ? 'untracked' : (file?.staged ? 'staged' : 'unstaged')
    selectedDiff.value = await api.gitDiff(props.projectId, props.repoId, path, range)
  } catch (e) {
    message.error((e as Error).message)
  } finally {
    diffLoading.value = false
  }
}

async function stage(paths: string[]) {
  try {
    await api.gitStage(props.projectId, props.repoId, { paths })
    message.success('已暂存')
    await loadStatus()
    if (selectedPath.value && paths.includes(selectedPath.value)) await selectFile(selectedPath.value)
  } catch (e) {
    message.error((e as Error).message)
  }
}

async function unstage(paths: string[]) {
  try {
    await api.gitUnstage(props.projectId, props.repoId, { paths })
    message.success('已撤销暂存')
    await loadStatus()
    if (selectedPath.value && paths.includes(selectedPath.value)) await selectFile(selectedPath.value)
  } catch (e) {
    message.error((e as Error).message)
  }
}

async function stageAll() {
  try {
    await api.gitStage(props.projectId, props.repoId, { all: true })
    message.success('已暂存全部')
    await loadStatus()
  } catch (e) {
    message.error((e as Error).message)
  }
}

async function unstageAll() {
  try {
    await api.gitUnstage(props.projectId, props.repoId, { all: true })
    message.success('已撤销暂存')
    await loadStatus()
  } catch (e) {
    message.error((e as Error).message)
  }
}

async function doPush() {
  try {
    const r = await api.gitPush(props.projectId, props.repoId)
    message.success(r.output || '已推送')
    await loadStatus()
  } catch (e) {
    message.error((e as Error).message)
  }
}

async function doPull() {
  try {
    const r = await api.gitPull(props.projectId, props.repoId)
    message.success(r.output || '已拉取')
    await loadStatus()
  } catch (e) {
    message.error((e as Error).message)
  }
}

function openCommit() {
  if (!status.value || status.value.summary.staged === 0) {
    message.warning('暂存区为空，请先暂存需要提交的文件')
    return
  }
  commitModal.subject = ''
  commitModal.body = ''
  commitModal.open = true
}

async function aiCommitMessage() {
  if (!status.value) return
  commitModal.generating = true
  try {
    const fileSummary = status.value.files
      .filter(f => f.staged)
      .map(f => `${f.indexStatus}${f.workStatus} ${f.path}`)
      .join('\n')
    const r = await api.aiCommitMessage({ fileSummary, diff: await stagedDiff() })
    commitModal.subject = r.subject
    commitModal.body = r.body
    message.success(`已由「${r.provider ?? 'AI'}」生成`)
  } catch (e) {
    message.error((e as Error).message)
  } finally {
    commitModal.generating = false
  }
}

async function stagedDiff(): Promise<string> {
  if (!status.value) return ''
  const staged = status.value.files.filter(f => f.staged)
  const parts: string[] = []
  for (const f of staged.slice(0, 6)) {
    try {
      const r = await api.gitDiff(props.projectId, props.repoId, f.path, 'staged')
      parts.push(r.patch)
    } catch { /* 跳过 */ }
  }
  return parts.join('\n\n')
}

async function submitCommit() {
  if (!commitModal.subject.trim()) {
    message.warning('请填写提交标题')
    return
  }
  commitModal.submitting = true
  try {
    const r = await api.gitCommit(props.projectId, props.repoId, { subject: commitModal.subject, body: commitModal.body })
    message.success(`已提交：${r.hash}`)
    commitModal.open = false
    await loadStatus()
  } catch (e) {
    message.error((e as Error).message)
  } finally {
    commitModal.submitting = false
  }
}

async function aiExplain() {
  if (!selectedDiff.value) return
  explainResult.value = null
  explainLoading.value = true
  try {
    const r = await api.aiExplainDiff({ filePath: selectedDiff.value.path, diff: selectedDiff.value.patch })
    explainResult.value = r
  } catch (e) {
    message.error((e as Error).message)
  } finally {
    explainLoading.value = false
  }
}



function statusClass(f: GitFileStatus): string {
  if (f.untracked) return 'chip chip-info'
  if (f.indexStatus === ' ' && f.workStatus !== ' ') return 'chip chip-warning'
  if (f.indexStatus !== ' ') return 'chip chip-success'
  return 'chip'
}

function statusLabel(f: GitFileStatus): string {
  if (f.untracked) return '新增'
  return f.indexStatus === ' ' ? '未暂存' : '已暂存'
}

onMounted(loadStatus)
</script>

<template>
  <div class="grid grid-cols-12 gap-4">
    <!-- 左：状态列表 -->
    <div class="col-span-12 lg:col-span-7 card card-pad">
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2.5 flex-wrap">
          <span class="text-sm font-medium text-text-1">
            <i aria-hidden="true" class="i-carbon-branch text-brand-500" /> {{ status?.branch || 'HEAD' }}
          </span>
          <span v-if="status?.head" class="code-text text-xs text-text-3">{{ status.head }}</span>
          <span v-if="status && (status.ahead || status.behind)" class="text-xs text-text-2">
            <span v-if="status.ahead">↑{{ status.ahead }}</span>
            <span v-if="status.behind">↓{{ status.behind }}</span>
          </span>
        </div>
        <div class="flex items-center gap-1.5">
          <NButton size="tiny" quaternary :disabled="!status?.hasRemote" :title="status?.hasRemote ? '拉取 (--ff-only)' : '无远端'" @click="doPull">
            <template #icon><i aria-hidden="true" class="i-carbon-cloud-download" /></template>
            拉取
          </NButton>
          <NButton size="tiny" quaternary :disabled="!status?.hasRemote" :title="status?.hasRemote ? '推送' : '无远端'" @click="doPush">
            <template #icon><i aria-hidden="true" class="i-carbon-cloud-upload" /></template>
            推送
          </NButton>
          <NButton size="tiny" @click="openCommit" :disabled="!status || status.summary.staged === 0">
            <template #icon><i aria-hidden="true" class="i-carbon-checkmark" /></template>
            提交
          </NButton>
        </div>
      </div>

      <div class="flex items-center gap-3 text-xs text-text-2 mb-3">
        <span>已暂存 <span class="font-semibold text-text-1">{{ status?.summary.staged ?? 0 }}</span></span>
        <span>未暂存 <span class="font-semibold text-text-1">{{ status?.summary.unstaged ?? 0 }}</span></span>
        <span>未追踪 <span class="font-semibold text-text-1">{{ status?.summary.untracked ?? 0 }}</span></span>
        <NButton size="tiny" quaternary class="ml-auto" @click="loadStatus">刷新</NButton>
      </div>

      <div v-if="statusLoading" class="py-12 text-center"><NSpin size="small" /></div>
      <div v-else-if="statusError" class="py-6">
        <ErrorState title="加载失败" :reason="statusError" hint="请检查仓库状态或稍后重试">
          <template #actions>
            <NButton size="small" type="primary" @click="loadStatus">重试</NButton>
          </template>
        </ErrorState>
      </div>
      <div v-else-if="!status || status.files.length === 0" class="py-12 text-center text-xs text-text-3">
        <i aria-hidden="true" class="i-carbon-checkmark-outline text-2xl mb-2 block text-success" />
        工作区干净～无未提交变更
      </div>
      <div v-else>
        <div v-if="status.summary.staged > 0 || status.summary.unstaged > 0" class="flex items-center gap-2 mb-2">
          <NButton size="tiny" quaternary @click="stageAll" title="暂存全部">
            <i aria-hidden="true" class="i-carbon-add" /> 全部暂存
          </NButton>
          <NButton size="tiny" quaternary v-if="status.summary.staged > 0" @click="unstageAll" title="撤销全部暂存">
            <i aria-hidden="true" class="i-carbon-subtract" /> 全部撤销
          </NButton>
        </div>
        <ul role="list" class="divide-y divide-border">
          <li
            v-for="f in status.files"
            :key="f.path"
            class="py-2 flex items-center gap-2 group cursor-pointer hover:bg-surface-alt rounded px-2"
            :class="{ 'bg-surface-alt': selectedPath === f.path }"
            role="button"
            tabindex="0"
            :aria-label="`查看 ${f.path} 变更`"
            @click="selectFile(f.path)"
            @keydown.enter="selectFile(f.path)"
          >
            <span :class="statusClass(f)" class="shrink-0 text-11px">{{ statusLabel(f) }}</span>
            <span class="code-text text-13px truncate flex-1" :title="f.path">{{ f.path }}</span>
            <NButton
              v-if="f.staged"
              size="tiny"
              quaternary
              title="撤销暂存"
              @click.stop="unstage([f.path])"
            >
              <template #icon><i aria-hidden="true" class="i-carbon-subtract" /></template>
            </NButton>
            <NButton
              v-else
              size="tiny"
              quaternary
              title="暂存"
              @click.stop="stage([f.path])"
            >
              <template #icon><i aria-hidden="true" class="i-carbon-add" /></template>
            </NButton>
          </li>
        </ul>
      </div>
    </div>

    <!-- 右：diff + AI 解读 -->
    <div class="col-span-12 lg:col-span-5 card card-pad">
      <div class="flex items-center justify-between mb-3">
        <div class="text-sm font-medium text-text-1 truncate">
          {{ selectedPath ? selectedPath : '选择一个文件查看 diff' }}
        </div>
        <NButton v-if="selectedDiff" size="tiny" quaternary :loading="explainLoading" @click="aiExplain">
          <template #icon><i aria-hidden="true" class="i-carbon-sparkle" /></template>
          AI 解读
        </NButton>
      </div>

      <div v-if="!selectedPath" class="py-12 text-center text-xs text-text-3">
        <i aria-hidden="true" class="i-carbon-document-blank text-2xl mb-2 block" />
        点击左侧文件查看差异
      </div>
      <div v-else-if="diffLoading" class="py-12 text-center"><NSpin size="small" /></div>
      <div v-else-if="selectedDiff" class="space-y-3">
        <div v-if="explainResult" class="rounded-md border border-brand-soft bg-brand-soft/30 px-3 py-2.5 space-y-2">
          <div class="text-xs text-text-3 flex items-center justify-between">
            <span class="flex items-center gap-1.5">
              <i aria-hidden="true" class="i-carbon-sparkle text-brand-500" />
              AI 解读（由「{{ explainResult.provider ?? 'AI' }}」生成，仅供参考）
            </span>
          </div>
          <div class="text-13px text-text-1"><span class="font-medium">意图：</span>{{ explainResult.intent }}</div>
          <div v-if="explainResult.keyChanges.length">
            <div class="text-xs text-text-3 mb-1">关键变更</div>
            <ul class="text-13px text-text-2 space-y-0.5 list-disc pl-5">
              <li v-for="(k, i) in explainResult.keyChanges" :key="i">{{ k }}</li>
            </ul>
          </div>
          <div v-if="explainResult.risks.length">
            <div class="text-xs text-text-3 mb-1">潜在风险</div>
            <ul class="text-13px text-warning space-y-0.5 list-disc pl-5">
              <li v-for="(k, i) in explainResult.risks" :key="i">{{ k }}</li>
            </ul>
          </div>
        </div>
        <pre class="code-text text-xs bg-surface-alt rounded-md p-3 max-h-130 overflow-auto whitespace-pre-wrap break-all">{{ selectedDiff.patch }}<span v-if="selectedDiff.truncated" class="text-warning">\n... (diff 已截断，AI 解读可能不完整)</span></pre>
      </div>
    </div>

    <!-- 提交弹窗 -->
    <NModal v-model:show="commitModal.open" preset="card" title="提交" class="w-180 max-w-95vw">
      <div class="space-y-3">
        <div class="text-xs text-text-3">
          <span class="font-medium text-text-1">已暂存 {{ status?.summary.staged ?? 0 }} 个文件</span>
          <div class="flex items-center justify-between mb-1 mt-2">
            <span>提交信息（Conventional Commits）</span>
            <NButton size="tiny" quaternary :loading="commitModal.generating" @click="aiCommitMessage">
              <template #icon><i aria-hidden="true" class="i-carbon-sparkle" /></template>
              AI 生成
            </NButton>
          </div>
        </div>
        <div class="field">
          <label for="cm-sub">标题</label>
          <NInput id="cm-sub" v-model:value="commitModal.subject" placeholder="feat(scope): 简明描述" :input-props="{ autocomplete: 'off', spellcheck: 'false' }" />
        </div>
        <div class="field">
          <label for="cm-body">详细说明</label>
          <NInput id="cm-body" v-model:value="commitModal.body" type="textarea" :autosize="{ minRows: 4, maxRows: 10 }" placeholder="- 变更点 1&#10;- 变更点 2" />
        </div>
        <details v-if="commitSummary" class="text-xs text-text-3">
          <summary class="cursor-pointer">查看已暂存文件</summary>
          <pre class="code-text mt-2 bg-surface-alt rounded-md p-2 max-h-60 overflow-auto">{{ commitSummary }}</pre>
        </details>
      </div>
      <template #footer>
        <div class="flex justify-end gap-2.5">
          <NButton quaternary @click="commitModal.open = false">取消</NButton>
          <NButton type="primary" :loading="commitModal.submitting" @click="submitCommit">提交</NButton>
        </div>
      </template>
    </NModal>
  </div>
</template>
