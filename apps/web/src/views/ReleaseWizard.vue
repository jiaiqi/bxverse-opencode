<script setup lang="ts">
// ReleaseWizard.vue —— 发布向导六步（M4）

import type { RepoStatus, BranchAlignmentResult } from '@bxverse/shared'
import { useProjectsStore } from '../stores/projects'
import { usePublishStore } from '../stores/publish'
import PageHeader from '../components/PageHeader.vue'
import StatusBadge from '../components/StatusBadge.vue'
import EmptyState from '../components/EmptyState.vue'
import LogEditor from '../components/LogEditor.vue'
import PublishConsole from '../components/PublishConsole.vue'
import { useDialog, useMessage } from 'naive-ui'
import type { PublishEventLike } from '../api'
import { api } from '../api'
import VersionExportDropdown from '../components/VersionExportDropdown.vue'

const route = useRoute()
const router = useRouter()
const projectsStore = useProjectsStore()
const store = usePublishStore()
const dialog = useDialog()
const message = useMessage()

const projectId = computed(() => String(route.params.id))
const project = computed(() => projectsStore.byId(projectId.value))

// ==================== 步骤 1：检测变更 ====================
const statuses = ref<Map<string, RepoStatus | null>>(new Map())
/** 步骤 1：检测失败的仓库（repoId → 原因）。失败必须显式呈现（红条 + 错误信息），
 *  绝不能冒认为「已同步」，否则用户会基于错误信息跳过该仓库的发布。 */
const failedRepos = ref<Map<string, string>>(new Map())
const detecting = ref(true)

// 并发上限：仓库多时避免一次性拉起 N 个 git 进程（均 fresh=true）
const DETECT_CONCURRENCY = 4

async function detect() {
  if (!project.value) return
  detecting.value = true
  statuses.value = new Map()
  failedRepos.value = new Map()
  commitsShowAllRepos.value = new Set()
  const repos = [...project.value.repos]
  let idx = 0
  const worker = async () => {
    while (idx < repos.length) {
      const repo = repos[idx++]
      try {
        const st = await projectsStore.repoStatus(projectId.value, repo.id, true)
        statuses.value.set(repo.id, st)
      } catch (e) {
        statuses.value.set(repo.id, null)
        failedRepos.value.set(repo.id, (e as Error).message || '检测失败')
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(DETECT_CONCURRENCY, repos.length) }, () => worker()))
  statuses.value = new Map(statuses.value)
  failedRepos.value = new Map(failedRepos.value)
  detecting.value = false
}

/** 单仓库重试（失败行内按钮） */
async function detectRepo(repoId: string) {
  const repo = project.value?.repos.find(r => r.id === repoId)
  if (!repo) return
  statuses.value.set(repoId, null)
  failedRepos.value.delete(repoId)
  failedRepos.value = new Map(failedRepos.value)
  try {
    const st = await projectsStore.repoStatus(projectId.value, repo.id, true)
    statuses.value.set(repoId, st)
  } catch (e) {
    failedRepos.value.set(repoId, (e as Error).message || '检测失败')
  }
  statuses.value = new Map(statuses.value)
  failedRepos.value = new Map(failedRepos.value)
}

const failedRepoIds = computed(() => [...failedRepos.value.keys()])

const changedRepoIds = computed(() => {
  if (!project.value) return []
  return project.value.repos.filter(r => statuses.value.get(r.id)?.changed).map(r => r.id)
})

function toggleRepo(id: string) {
  const next = new Set(store.selectedRepoIds)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  store.setSelected([...next])
}

/** 步骤 1：提交级条目确认 */
const commitsExpanded = ref<Set<string>>(new Set())
/** 提交明细预览上限：仓库提交可能上千条，先渲染前 N 条避免整列 DOM 卡顿 */
const COMMITS_PREVIEW_LIMIT = 100
/** 「展开全部」按仓库记录（Set<repoId>），避免一个仓库的展开状态波及其它仓库 */
const commitsShowAllRepos = ref<Set<string>>(new Set())

function visibleCommits(repoId: string) {
  const list = statuses.value.get(repoId)?.commits ?? []
  return commitsShowAllRepos.value.has(repoId) ? list : list.slice(0, COMMITS_PREVIEW_LIMIT)
}

function hiddenCommitsCount(repoId: string): number {
  if (commitsShowAllRepos.value.has(repoId)) return 0
  const list = statuses.value.get(repoId)?.commits ?? []
  return Math.max(0, list.length - COMMITS_PREVIEW_LIMIT)
}

function showAllCommits(repoId: string) {
  const next = new Set(commitsShowAllRepos.value)
  next.add(repoId)
  commitsShowAllRepos.value = next
}

function toggleCommitsPanel(repoId: string) {
  const next = new Set(commitsExpanded.value)
  if (next.has(repoId)) next.delete(repoId)
  else next.add(repoId)
  commitsExpanded.value = next
}

const excludedCount = (repoId: string): number => (store.excludedCommits[repoId] ?? []).length

function commitIncluded(repoId: string, fullHash: string): boolean {
  return !(store.excludedCommits[repoId] ?? []).includes(fullHash)
}
// ---------- 分支协同巡检 (R25 / 建议 1) ----------
const branchAlignment = ref<BranchAlignmentResult | null>(null)

async function checkBranchAlignment() {
  if (!projectId.value) return
  try {
    branchAlignment.value = await api.branchAlignment(projectId.value, 'master')
  } catch {
    // 忽略
  }
}

async function doBatchCheckout(branch = 'master') {
  try {
    await api.batchCheckout(projectId.value, branch)
    message.success(`已批量将所有工程切至「${branch}」分支`)
    await Promise.all([detect(), checkBranchAlignment()])
    store.setSelected(changedRepoIds.value)
  } catch (e) {
    message.error((e as Error).message)
  }
}

async function doBatchPull() {
  try {
    const res = await api.batchPull(projectId.value)
    message.success(res.ok ? '全矩阵工程批量快进拉取成功！' : '部分仓库拉取存在警告')
    await Promise.all([detect(), checkBranchAlignment()])
    store.setSelected(changedRepoIds.value)
  } catch (e) {
    message.error((e as Error).message)
  }
}

watch(projectId, async (id) => {
  if (!projectsStore.byId(id)) await projectsStore.load()
  store.reset(id)
  // 步骤状态同步 URL（刷新恢复）
  const q = Number(route.query.step)
  if (q >= 1 && q <= 6) store.step = q
  await Promise.all([detect(), checkBranchAlignment()])
  // 默认勾选全部变动仓库
  store.setSelected(changedRepoIds.value)
  // 刷新/重进时检测全局进行中任务 → 提供接管查看进度
  void checkRunningTask()
}, { immediate: true })

// ==================== 进行中任务接管（刷新/重进后可恢复控制台） ====================
const takeoverTask = ref('')
const takeoverProjectId = ref('')

async function checkRunningTask() {
  try {
    const cur = await api.publishCurrent()
    takeoverTask.value = cur.taskId ?? ''
    takeoverProjectId.value = cur.projectId ?? ''
  } catch {
    takeoverTask.value = ''
    takeoverProjectId.value = ''
  }
}

async function takeOver() {
  if (!takeoverTask.value) return
  store.taskId = takeoverTask.value
  store.phase = 'running'
  store.step = 5
  // 接管后隐藏横幅（避免与步骤 5 控制台并存）
  takeoverTask.value = ''
}

// 站内路由切换守卫：步骤 2-5 有未保存日志编辑或发布进行中时离开需确认
// （window.beforeunload 只覆盖刷新/关页，站内导航需在此拦截）
onBeforeRouteLeave((_to, _from, next) => {
  const hasEdits = store.logs.internal.state !== 'auto' || store.logs.external.state !== 'auto'
  const running = store.phase === 'running'
  if ((hasEdits || running) && store.step >= 2 && store.step <= 5) {
    if (!window.confirm('发布向导中有未保存的日志编辑或进行中的任务，确定离开？')) {
      next(false)
      return
    }
  }
  next()
})

// 步骤变化 → URL
watch(
  () => store.step,
  (s) => {
    if (String(route.query.step ?? '') !== String(s)) {
      void router.replace({ query: { ...route.query, step: String(s) } })
    }
  },
)

// 未保存守卫：日志已编辑/发布进行中时离开需确认
function onBeforeUnload(e: BeforeUnloadEvent) {
  const hasEdits = store.logs.internal.state !== 'auto' || store.logs.external.state !== 'auto'
  const running = store.phase === 'running'
  if ((hasEdits || running) && store.step >= 2 && store.step <= 5) {
    e.preventDefault()
  }
}
onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onScopeDispose(() => window.removeEventListener('beforeunload', onBeforeUnload))

// ==================== 步骤 2：版本号 ====================
function gotoStep2() {
  if (store.selectedRepoIds.length === 0) {
    message.warning('请至少选择一个变动仓库')
    return
  }
  store.step = 2
  void store.loadPlan()
}

function setBump(v: string) {
  store.bumpOverride = v as 'auto' | 'major' | 'minor' | 'patch'
  if (store.step >= 2) void rePlan()
}

async function rePlan(confirmReset = false): Promise<void> {
  const edited = store.logs.internal.state !== 'auto' || store.logs.external.state !== 'auto'
  if (edited && !confirmReset) {
    dialog.warning({
      title: '重新生成计划',
      content: '重新生成计划会重置两侧日志为自动草稿（你的人工编辑将丢失）。确定继续？',
      positiveText: '重新生成',
      negativeText: '取消',
      onPositiveClick: () => void rePlan(true),
    })
    return
  }
  if (confirmReset || edited === false) {
    store.logs.internal.state = 'auto'
    store.logs.external.state = 'auto'
    store.logs.internal.content = ''
    store.logs.external.content = ''
  }
  await store.loadPlan()
}

const bumpOptions = [
  { label: '自动', value: 'auto' },
  { label: '补丁 patch', value: 'patch' },
  { label: '次版本 minor', value: 'minor' },
  { label: '重大 major', value: 'major' },
]

// ==================== 步骤 3：日志 ====================
// ==================== 步骤 4：dry-run 清单 ====================
const dryRunLines = computed(() => {
  const plan = store.plan
  if (!plan) return []
  const lines: { repo: string; text: string; dimmed?: boolean }[] = []
  for (const r of plan.changed) {
    lines.push({ repo: r.name, text: `[预检] 检查 HEAD / dirty / 里程碑标签` })
    if (r.buildCommand) {
      lines.push({ repo: r.name, text: `[$] ${r.buildCommand}`, dimmed: store.skipBuild })
    }
    lines.push({ repo: r.name, text: `git tag ${plan.milestoneTag}` })
    const tag = plan.tags.find(t => t.repoId === r.repoId)
    lines.push({ repo: r.name, text: `git tag ${tag?.tag ?? ''}` })
    const repo = project.value?.repos.find(x => x.id === r.repoId)
    if (store.backupSource) {
      lines.push({ repo: r.name, text: `[备份] git bundle（全部历史与标签）+ git archive 快照（遵循 .gitignore）` })
    }
    if (store.backupArtifacts) {
      if (repo?.artifactDir) {
        lines.push({ repo: r.name, text: `[备份] 产物归档 ${repo.artifactDir}/ → artifact.tar.gz + 哈希清单` })
      } else {
        lines.push({ repo: r.name, text: `[备份] 产物备份跳过（未配置产物目录）`, dimmed: true })
      }
    }
    lines.push({ repo: r.name, text: `写入 version.json / version-history.json` })
    lines.push({ repo: r.name, text: `更新检测基准 → ${r.to?.slice(0, 7) ?? ''}` })
  }
  for (const s of plan.syncedOnly) {
    lines.push({ repo: s.name, text: `[同步基版] 仅更新 version.json → ${plan.projectVersion}` })
  }
  lines.push({ repo: '（项目）', text: `写发布记录 → releases/${plan.projectVersion}/data.json + 双轨日志` })
  lines.push({ repo: '（数据仓库）', text: `里程碑标签 ${plan.milestoneTag} + commit`, dimmed: false })
  lines.push({ repo: '（远程）', text: store.offline ? '离线模式：跳过推送' : '推送标签与数据仓库（失败仅警告）' })
  return lines
})

/** 步骤 4：所选仓库中是否存在带远程地址的（离线默认开启，需明确提示不会推送） */
const selectedHasRemote = computed(() => {
  if (!project.value) return false
  return store.selectedRepoIds.some((id) => {
    const s = statuses.value.get(id)
    if (s) return s.hasRemote
    return project.value?.repos.find(r => r.id === id)?.remote != null
  })
})

// ==================== 步骤 5：执行 ====================
async function execute() {
  try {
    const taskId = await store.execute()
    store.step = 5
    void taskId
  } catch (e) {
    const err = e as { status?: number; message?: string }
    if (err.status === 409) {
      dialog.warning({
        title: '已有发布任务进行中',
        content: '全局同一时间只允许一个发布任务，请稍后重试。',
        positiveText: '知道了',
      })
    } else {
      message.error(err.message ?? '发布失败')
    }
  }
}

function onConsoleEvent(e: PublishEventLike) {
  store.pushEvent(e)
}
function onFinished(result: { releaseId: string | null; version: string; failedRepos: string[] } | null) {
  store.result = result
  store.phase = 'done'
  store.step = 6
}
function onFailed(msg: string) {
  store.error = msg
  store.phase = 'error'
}

// ==================== 步骤 6：完成 ====================
const bumpLabel = (b: string): string =>
  b === 'major' ? '重大' : b === 'minor' ? '次版本' : b === 'patch' ? '补丁' : '自动'

/** 完成页导出用的发布记录 id（模板闭包内可安全使用） */
const resultReleaseId = computed(() => store.result?.releaseId ?? '')
</script>

<template>
  <div class="page">
    <PageHeader
      :title="`发布 · ${project?.name ?? ''}`"
      :description="project?.description || undefined"
      :back-to="`/project/${projectId}`"
      icon="i-carbon-rocket"
    />

    <template v-if="project">
      <!-- 刷新/重进时：该项目有发布任务进行中 → 提供接管查看进度 -->
      <NAlert
        v-if="takeoverTask && takeoverProjectId === projectId && store.step !== 5 && store.phase !== 'running'"
        type="warning"
        :show-icon="true"
        class="mb-4"
      >
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <span class="flex-1 min-w-56">检测到该项目的发布任务正在进行中（{{ takeoverTask }}），可查看实时进度。</span>
          <NButton size="tiny" type="primary" secondary @click="takeOver">查看进度</NButton>
        </div>
      </NAlert>

      <NSteps :current="store.step" :status="store.phase === 'error' && store.step === 5 ? 'error' : 'process'">
        <NStep title="检测变更" />
        <NStep title="版本号" />
        <NStep title="日志" />
        <NStep title="预览" />
        <NStep title="执行" />
        <NStep title="完成" />
      </NSteps>

      <div class="card card-pad mt-6">
        <!-- 步骤 1 -->
        <div v-show="store.step === 1">
          <div v-if="detecting" class="flex items-center gap-3 py-8 justify-center text-text-3">
            <NSpin size="small" />
            正在检测各仓库变更…
          </div>
          <template v-else>
            <!-- 分支协同巡检警示条 (R25 / 建议 1) -->
            <div
              v-if="branchAlignment && !branchAlignment.isAllAligned"
              class="mb-3.5 p-3.5 rounded-lg border border-warning/40 bg-warning/10 flex items-center justify-between gap-3 text-xs"
            >
              <div class="flex items-center gap-2">
                <i aria-hidden="true" class="i-carbon-warning-filled text-warning shrink-0 text-base" />
                <span class="text-text-1">
                  发版前分支巡检预警：检测到
                  <strong class="text-warning">{{ branchAlignment.items.filter(x => !x.isAligned).map(x => `${x.repoName} (${x.branch})`).join('、') }}</strong>
                  未在主发布分支 ({{ branchAlignment.defaultBranch }})
                </span>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <NButton size="tiny" type="warning" @click="doBatchCheckout(branchAlignment.defaultBranch)">
                  ⚡ 一键切至主分支
                </NButton>
                <NButton size="tiny" quaternary @click="doBatchPull">
                  ↓ 批量快进拉取
                </NButton>
              </div>
            </div>

            <div class="space-y-3">
              <div v-for="repo in project.repos" :key="repo.id" class="wz-row rounded-md border bg-surface"
                :class="failedRepos.has(repo.id)
                  ? 'border-error/50 bg-error-soft'
                  : statuses.get(repo.id)?.changed ? 'border-brand-200 bg-brand-soft hover:border-brand-300' : 'border-border opacity-65 hover:border-border-strong'">
                <div class="flex items-center gap-3 px-4 py-3 cursor-pointer" @click="statuses.get(repo.id)?.changed && toggleRepo(repo.id)">
                  <NCheckbox
                    :checked="store.selectedRepoIds.includes(repo.id)"
                    :disabled="!statuses.get(repo.id)?.changed"
                    @click.stop
                    @update:checked="() => toggleRepo(repo.id)"
                  />
                  <i aria-hidden="true" class="i-carbon-git-branch text-text-3" />
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="font-medium text-text-1 text-sm">{{ repo.displayName || repo.name }}</span>
                      <span class="code-text text-xs text-text-3" translate="no">{{ repo.name }}</span>
                      <StatusBadge v-if="statuses.get(repo.id)?.changed" type="changed" :count="statuses.get(repo.id)!.commits.length" />
                      <StatusBadge v-if="statuses.get(repo.id) && statuses.get(repo.id)!.dirty > 0" type="dirty" :count="statuses.get(repo.id)!.dirty" />
                    </div>
                    <div class="text-xs text-text-3 mt-0.5">
                      {{ statuses.get(repo.id)?.head.slice(0, 7) }} · {{ statuses.get(repo.id)?.branch }}
                    </div>
                  </div>
                  <div class="text-xs" :class="failedRepos.has(repo.id) ? 'text-error font-medium' : statuses.get(repo.id)?.changed ? 'text-brand-600' : 'text-text-3'">
                    {{ failedRepos.has(repo.id) ? '检测失败' : statuses.get(repo.id)?.changed ? '有变动' : '已同步' }}
                  </div>
                </div>
                <!-- 失败原因 + 单仓库重试 -->
                <div v-if="failedRepos.has(repo.id)" class="px-4 pb-3 -mt-1 flex items-center gap-2 text-xs text-error">
                  <i aria-hidden="true" class="i-carbon-warning-alt shrink-0" />
                  <span class="flex-1 break-all">{{ failedRepos.get(repo.id) }}</span>
                  <button class="link shrink-0" @click.stop="detectRepo(repo.id)">重试</button>
                </div>
                <!-- 提交级条目确认（变化收件箱语义：人工甄别哪些提交进版本） -->
                <div v-if="statuses.get(repo.id)?.changed" class="px-4 pb-3 -mt-1">
                  <button
                    class="text-xs flex items-center gap-1.5 transition-colors duration-150 focus-ring"
                    :class="excludedCount(repo.id) > 0 ? 'text-warning hover:text-text-1' : 'text-text-3 hover:text-brand-500'"
                    @click.stop="toggleCommitsPanel(repo.id)"
                  >
                    <i aria-hidden="true" class="i-carbon-chevron-down transition-transform duration-150" :class="{ 'rotate-180': commitsExpanded.has(repo.id) }" />
                    {{ commitsExpanded.has(repo.id) ? '收起提交明细' : '提交明细' }}
                    <span v-if="excludedCount(repo.id) > 0" class="chip text-warning border-warning/30 bg-warning-soft">已排除 {{ excludedCount(repo.id) }} 条</span>
                  </button>
                  <div v-if="commitsExpanded.has(repo.id)" class="mt-2 max-h-64 overflow-y-auto rounded-md border border-border bg-surface divide-y divide-border">
                    <label
                      v-for="c in visibleCommits(repo.id)"
                      :key="c.fullHash"
                      class="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-surface-hover transition-colors duration-100"
                    >
                      <NCheckbox
                        size="small"
                        :checked="commitIncluded(repo.id, c.fullHash)"
                        @update:checked="v => store.toggleCommit(repo.id, c.fullHash, v)"
                      />
                      <span class="chip shrink-0 text-11px">{{ c.type }}</span>
                      <span class="flex-1 truncate text-sm" :class="{ 'opacity-50 line-through decoration-text-3': !commitIncluded(repo.id, c.fullHash) }">{{ c.subject }}</span>
                      <span class="code-text text-xs text-text-3 shrink-0" translate="no">{{ c.hash.slice(0, 7) }}</span>
                    </label>
                    <div v-if="(statuses.get(repo.id)?.commits ?? []).length === 0" class="px-3 py-4 text-center text-xs text-text-3">
                      无提交
                    </div>
                    <div v-if="hiddenCommitsCount(repo.id) > 0" class="text-center py-2.5 bg-surface-alt">
                      <button class="link text-xs" @click="showAllCommits(repo.id)">
                        展开全部 {{ hiddenCommitsCount(repo.id) }} 条提交（{{ (statuses.get(repo.id)?.commits ?? []).length }} 条共）
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div v-if="project.repos.length === 0" class="py-8">
              <EmptyState title="还没有仓库" description="请先接入仓库再发起发布" />
            </div>
            <div v-else-if="failedRepoIds.length > 0 && changedRepoIds.length === 0" class="py-8">
              <NAlert type="error" :show-icon="true" title="部分仓库检测失败">
                <div class="flex items-center justify-between gap-3 flex-wrap">
                  <span class="flex-1 min-w-56">
                    {{ failedRepoIds.length }} 个仓库状态获取失败，无法确认是否有变动：{{ failedRepoIds.join('、') }}。
                    请先处理下方列出的错误（如仓库路径失效、git 权限等），再重新检测。
                  </span>
                  <NButton size="tiny" type="primary" secondary @click="detect()">重新检测</NButton>
                </div>
              </NAlert>
            </div>
            <div v-else-if="changedRepoIds.length === 0" class="py-8">
              <EmptyState
                icon="i-carbon-checkmark-filled"
                title="所有仓库均为最新"
                description="没有检测到任何变动，无需发布。"
              />
            </div>
          </template>
        </div>

        <!-- 步骤 2 -->
        <div v-show="store.step === 2">
          <div v-if="store.planning || !store.plan" class="py-10 text-center text-text-3">
            <NSpin size="small" />
            <div class="mt-2 text-sm">正在计算发布计划…</div>
          </div>
          <template v-else>
            <div class="flex items-end justify-between gap-4 flex-wrap">
              <div>
                <div class="stat-label mb-1">项目版本</div>
                <div class="flex items-center gap-3">
                  <span class="code-text text-text-3 line-through">{{ project.version }}</span>
                  <i aria-hidden="true" class="i-carbon-arrow-right text-text-3" />
                  <span class="stat-value text-brand-500">{{ store.plan.projectVersion }}</span>
                  <StatusBadge type="bump" :bump="store.plan.bump" />
                  <span v-if="store.plan.suggestedBump !== store.plan.bump" class="chip text-text-3">
                    建议：{{ bumpLabel(store.plan.suggestedBump) }}
                  </span>
                </div>
                <div class="text-xs text-text-3 mt-1">
                  build {{ store.plan.buildStamp }} · 里程碑标签 <span class="code-text">{{ store.plan.milestoneTag }}</span>
                </div>
              </div>
              <NSelect v-model:value="store.bumpOverride" :options="bumpOptions" class="w-44" @update:value="setBump" />
            </div>

            <div class="mt-6">
              <div class="section-title text-base mb-3">参与发布的仓库（{{ store.plan.changed.length }}）</div>
              <div class="card border divide-y divide-border overflow-hidden">
                <div v-for="r in store.plan.changed" :key="r.repoId" class="px-4 py-3 flex items-center gap-3 flex-wrap">
                  <i aria-hidden="true" class="i-carbon-git-branch text-brand-500" />
                  <span class="font-medium text-text-1 text-sm min-w-30">{{ r.name }}</span>
                  <span class="code-text text-xs text-text-3">{{ r.from?.slice(0, 7) ?? '首次' }} → {{ r.to?.slice(0, 7) }}</span>
                  <span class="version-badge"><span class="tick"></span>{{ r.version }}</span>
                  <span class="chip">{{ r.commits.length }} 提交</span>
                </div>
              </div>
            </div>

            <div v-if="store.plan.syncedOnly.length" class="mt-4">
              <NCollapse>
                <NCollapseItem :title="`仅同步基版 version.json（${store.plan.syncedOnly.length} 个未变动仓库）`" name="sync">
                  <div class="text-sm text-text-2 space-y-1">
                    <div v-for="s in store.plan.syncedOnly" :key="s.repoId" class="flex items-center gap-2">
                      <i aria-hidden="true" class="i-carbon-renew text-text-3" />
                      <span>{{ s.name }}</span>
                      <span class="code-text text-xs text-text-3">→ {{ store.plan.projectVersion }}（无标签无记录）</span>
                    </div>
                  </div>
                </NCollapseItem>
              </NCollapse>
            </div>

            <div v-if="store.plan.warnings.length" class="mt-4 space-y-2">
              <NAlert v-for="(w, i) in store.plan.warnings" :key="i" type="warning" :show-icon="true">
                {{ w }}
              </NAlert>
            </div>
          </template>
        </div>

        <!-- 步骤 3 -->
        <div v-show="store.step === 3" class="space-y-5">
          <LogEditor
            track="external"
            title="对外日志（用户可见）"
            :content="store.logs.external.content"
            :auto-draft="store.logs.external.autoDraft"
            :state="store.logs.external.state"
            :commits="store.plan?.changed.flatMap(r => r.commits) ?? []"
            :exclude="project.externalExclude"
            @update:content="v => store.editLog('external', v)"
            @confirm="store.confirmLog('external')"
            @unconfirm="store.unconfirmLog('external')"
            @reset="store.resetLog('external')"
          />
          <LogEditor
            track="internal"
            title="对内日志（全量技术细节）"
            :content="store.logs.internal.content"
            :auto-draft="store.logs.internal.autoDraft"
            :state="store.logs.internal.state"
            @update:content="v => store.editLog('internal', v)"
            @confirm="store.confirmLog('internal')"
            @unconfirm="store.unconfirmLog('internal')"
            @reset="store.resetLog('internal')"
          />
        </div>

        <!-- 步骤 4 -->
        <div v-show="store.step === 4">
          <NAlert v-if="store.offline && selectedHasRemote" type="info" :show-icon="true" class="mb-4">
            当前为<strong>离线发布</strong>：本次不会推送标签到远程仓库与数据仓库。如需推送，请关闭「离线发布」开关。
          </NAlert>
          <div class="flex items-center gap-6 mb-4 flex-wrap">
            <div class="flex items-center gap-2">
              <NSwitch v-model:value="store.offline" />
              <span class="text-sm text-text-2">离线发布（跳过远程推送）</span>
            </div>
            <div class="flex items-center gap-2">
              <NSwitch v-model:value="store.skipBuild" />
              <span class="text-sm text-text-2">跳过构建命令</span>
            </div>
            <div class="flex items-center gap-2">
              <NSwitch v-model:value="store.backupSource" />
              <span class="text-sm text-text-2">源码备份</span>
            </div>
            <div class="flex items-center gap-2">
              <NSwitch v-model:value="store.backupArtifacts" />
              <span class="text-sm text-text-2">产物备份</span>
            </div>
          </div>
          <div class="console-wrap space-y-1">
            <div v-for="(l, i) in dryRunLines" :key="i" class="log-line flex gap-2" :class="{ 'opacity-40': l.dimmed }">
              <span class="shrink-0 code-text text-xs w-24 text-text-3 truncate">{{ l.repo }}</span>
              <span class="flex-1 break-all">{{ l.text }}</span>
            </div>
          </div>
          <div v-if="!store.bothConfirmed" class="mt-4">
            <NAlert type="warning" :show-icon="true">
              对内/对外日志需全部「确认」后才可执行发布（步骤 3 中操作）。
            </NAlert>
          </div>
        </div>

        <!-- 步骤 5 -->
        <div v-show="store.step === 5">
          <PublishConsole
            v-if="store.taskId"
            :task-id="store.taskId"
            @event="onConsoleEvent"
            @finished="onFinished"
            @failed="onFailed"
          />
          <div v-if="store.phase === 'error'" class="mt-4">
            <NAlert type="error" :show-icon="true">
              <div class="flex items-center gap-3 justify-between flex-wrap">
                <span>{{ store.error || '发布失败' }}</span>
                <NButton size="tiny" @click="store.step = 2">回到版本号重试</NButton>
              </div>
            </NAlert>
          </div>
        </div>

        <!-- 步骤 6 -->
        <div v-show="store.step === 6">
          <template v-if="store.result">
            <div class="text-center py-8">
              <i aria-hidden="true" class="i-carbon-checkmark-filled text-48px text-success" />
              <div class="mt-3 stat-value text-2xl">{{ store.result.version }}</div>
              <div class="text-sm text-text-2 mt-1">统一发布完成</div>
              <div v-if="store.result.failedRepos.length" class="mt-4">
                <NAlert type="warning" :show-icon="true" class="text-left">
                  以下仓库发布失败（未更新检测基准，可下次重新发布）：
                  {{ store.result.failedRepos.join('、') }}
                </NAlert>
              </div>
            </div>
          </template>
          <template v-else>
            <NResult status="success" title="发布完成" />
          </template>
          <div class="flex justify-center gap-3 mt-6">
            <NButton @click="router.push(`/project/${projectId}`)">返回项目</NButton>
            <NButton
              v-if="resultReleaseId && (store.backupSource || store.backupArtifacts)"
              @click="router.push(`/project/${projectId}/backups`)"
            >
              <template #icon><i class="i-carbon-document-protected" /></template>
              查看本次备份
            </NButton>
            <VersionExportDropdown
              v-if="resultReleaseId"
              :project-id="projectId"
              :filename="`${store.result!.version}-version.json`"
              :load-items="() => api.releaseVersions(resultReleaseId)"
            />
            <NButton type="primary" secondary @click="store.reset(projectId); detect(); store.setSelected(changedRepoIds)">再次发布</NButton>
          </div>
        </div>
      </div>

      <!-- 底部步骤操作栏 -->
      <div class="flex items-center justify-between mt-6">
        <NButton :disabled="store.step <= 1 || store.phase === 'running'" @click="store.step -= 1">
          <template #icon><i aria-hidden="true" class="i-carbon-arrow-left" /></template>
          上一步
        </NButton>
        <div class="flex items-center gap-2.5">
          <template v-if="store.step === 1">
            <NButton type="primary" :disabled="store.selectedRepoIds.length === 0" @click="gotoStep2">
              下一步
              <template #icon><i aria-hidden="true" class="i-carbon-arrow-right" /></template>
            </NButton>
          </template>
          <template v-else-if="store.step === 2">
            <NButton type="primary" :disabled="store.planning || !store.plan" @click="store.step = 3">
              下一步
              <template #icon><i aria-hidden="true" class="i-carbon-arrow-right" /></template>
            </NButton>
          </template>
          <template v-else-if="store.step === 3">
            <NButton type="primary" @click="store.step = 4">
              下一步
              <template #icon><i aria-hidden="true" class="i-carbon-arrow-right" /></template>
            </NButton>
          </template>
          <template v-else-if="store.step === 4">
            <NTooltip :disabled="store.canExecute" trigger="hover">
              <template #trigger>
                <NButton type="primary" :disabled="!store.canExecute" :loading="store.phase === 'running'" @click="execute">
                  <template #icon><i aria-hidden="true" class="i-carbon-rocket" /></template>
                  执行发布
                </NButton>
              </template>
              {{ store.bothConfirmed ? '' : '对内/对外日志需全部确认（步骤 3）' }}
            </NTooltip>
          </template>
          <template v-else-if="store.step === 5">
            <NButton :disabled="store.phase === 'running'" @click="store.step = 4">
              <template #icon><i aria-hidden="true" class="i-carbon-arrow-left" /></template>
              返回预览
            </NButton>
          </template>
        </div>
      </div>
    </template>
    <div v-else class="py-10 text-center text-text-3">
      <NSpin size="small" />
    </div>
  </div>
</template>
