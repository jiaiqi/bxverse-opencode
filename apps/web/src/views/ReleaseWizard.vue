<script setup lang="ts">
// ReleaseWizard.vue —— 编排壳（行为不变纯重构；步骤 UI 拆至 components/wizard/*，检测/巡检/接管拆至 composables）

import { useProjectsStore } from '../stores/projects'
import { usePublishStore } from '../stores/publish'
import PageHeader from '../components/PageHeader.vue'
import StepDetect from '../components/wizard/StepDetect.vue'
import StepVersion from '../components/wizard/StepVersion.vue'
import StepLogs from '../components/wizard/StepLogs.vue'
import StepDryRun from '../components/wizard/StepDryRun.vue'
import StepExecute from '../components/wizard/StepExecute.vue'
import StepResult from '../components/wizard/StepResult.vue'
import { useDetectPool } from '../composables/useDetectPool'
import { useBranchAlignment } from '../composables/useBranchAlignment'
import { useTakeover } from '../composables/useTakeover'
import { useDialog, useMessage } from 'naive-ui'
import LoadingState from '../components/LoadingState.vue'

const route = useRoute()
const router = useRouter()
const projectsStore = useProjectsStore()
const store = usePublishStore()
const dialog = useDialog()
const message = useMessage()

const projectId = computed(() => String(route.params.id))
const project = computed(() => projectsStore.byId(projectId.value))

const isQuick = computed(() => String(route.query.mode ?? '') === 'quick')
const hasQuickSnapshot = computed(() => !!project.value?.lastQuickPublish)

// composables
const {
  statuses,
  failedRepos,
  detecting,
  failedRepoIds,
  changedRepoIds,
  detect,
  detectRepo,
  visibleCommits,
  hiddenCommitsCount,
  showAllCommits,
} = useDetectPool(projectId, project as never)
const { branchAlignment, checkBranchAlignment, doBatchCheckout, doBatchPull } = useBranchAlignment(
  projectId,
  { detect, changedRepoIds },
)
const { checkRunningTask } = useTakeover()

function applyQuickSnapshot(): void {
  const snap = project.value?.lastQuickPublish
  if (!snap) return
  store.bumpOverride = snap.bump as typeof store.bumpOverride
  store.offline = snap.offline
  store.skipBuild = snap.skipBuild
  store.backupSource = snap.backupSource
  store.backupArtifacts = snap.backupArtifacts
  const changed = changedRepoIds.value
  const target = snap.repoIds.length
    ? snap.repoIds.filter((id) => changed.includes(id))
    : [...changed]
  if (target.length > 0) store.setSelected(target)
  else store.setSelected([...changed])
}

watch(
  projectId,
  async (id) => {
    if (!projectsStore.byId(id)) await projectsStore.load()
    store.reset(id)
    const q = Number(route.query.step)
    if (q >= 1 && q <= 6) {
      // 直接赋值以恢复深链刷新；守卫仍走 store.goTo
      store.step = q
    }
    await Promise.all([detect(), checkBranchAlignment()])
    if (isQuick.value && hasQuickSnapshot.value) {
      applyQuickSnapshot()
      // 快速通道：自动跳过反复重选，检测后直接进入版本与日志（仍需人审 confirm 与 dry-run 门禁）
      // 仅在初始步骤 1 时自动推进，避免覆盖用户深链刷新到其他步骤的意图
      if (store.step === 1 && store.selectedRepoIds.length > 0) {
        if (store.goTo(2)) {
          await store.loadPlan()
          // 版本推演完成即展示日志草稿，用户只剩双轨确认 + dry-run + 执行 ≤5 步
          if (store.plan) store.goTo(3)
        }
      }
    } else store.setSelected(changedRepoIds.value)
    void checkRunningTask()
  },
  { immediate: true },
)

// route.query.mode 变化时同步应用快照（不重置检测结果）
watch(
  () => String(route.query.mode ?? ''),
  (mode) => {
    if (mode === 'quick' && hasQuickSnapshot.value && changedRepoIds.value.length > 0) {
      applyQuickSnapshot()
    }
  },
)

// 站内路由切换守卫：步骤 2-5 有未保存日志编辑或发布进行中时离开需确认
onBeforeRouteLeave((_to, _from, next) => {
  const hasEdits = store.logs.internal.state !== 'auto' || store.logs.external.state !== 'auto'
  const running = store.phase === 'running'
  if ((hasEdits || running) && store.step >= 2 && store.step <= 5) {
    dialog.warning({
      title: '离开确认',
      content: '发布向导中有未保存的日志编辑或进行中的任务，确定离开？',
      positiveText: '离开',
      negativeText: '取消',
      onPositiveClick: () => next(),
      onNegativeClick: () => next(false),
      onClose: () => next(false),
    })
    return
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

// 步骤 1 → 2
function gotoStep2() {
  if (store.selectedRepoIds.length === 0) {
    message.warning('请至少选择一个变动仓库')
    return
  }
  if (!store.goTo(2)) return
  void store.loadPlan()
}

// 步骤 4 执行
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

function handleAgain() {
  store.reset(projectId.value)
  void detect().then(() => store.setSelected(changedRepoIds.value))
}

/** M11：失败三出路 — 改用下一版本号（回版本步自选 bump） */
function handleRetryBump() {
  store.step = 1
  store.bumpOverride = 'patch' // 默认 patch 兜底，前端可在 StepVersion 改成 minor/major
}
/** M11：失败三出路 — 接管续跑（server 端 findActive journal 自动接续） */
async function handleResume() {
  store.reset(projectId.value)
  await detect()
  store.setSelected(changedRepoIds.value)
  store.bumpOverride = 'patch'
  store.step = 4 // 直接走 dry-run 复检
}

function goPrev() {
  store.goTo(store.step - 1)
}
function goNext() {
  // planDirty 前进拦截等门禁由 store.goTo 统一收口
  store.goTo(store.step + 1)
}
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
      <!-- R28 快速发布通道：预填上次配置，门禁不变（dry-run + 双轨 confirmed 仍强制） -->
      <NAlert
        v-if="isQuick && hasQuickSnapshot"
        type="success"
        :show-icon="true"
        class="mb-4"
        title="快速发布模式 · 已预填上次配置（≤5 步完成 patch）"
      >
        <div class="flex items-center justify-between gap-3 flex-wrap text-xs">
          <span
            >已自动勾选上次仓库与 bump（{{
              project.lastQuickPublish?.bump
            }}）及构建/离线/备份开关；仅需确认双轨日志与预检即可执行。门禁（dry-run 与双轨
            confirmed）保持强制，人审为终。</span
          >
          <NButton size="tiny" quaternary @click="router.replace(`/project/${projectId}/release`)"
            >切换到详细模式</NButton
          >
        </div>
      </NAlert>
      <NAlert
        v-if="isQuick && !hasQuickSnapshot"
        type="warning"
        :show-icon="true"
        class="mb-4"
        title="尚无快速发布记录"
      >
        <div class="flex items-center justify-between gap-3 flex-wrap text-xs">
          <span>首次发布请使用详细模式，完成一次发布后将自动记录配置供快速发布复用。</span>
          <NButton size="tiny" quaternary @click="router.replace(`/project/${projectId}/release`)"
            >去详细模式</NButton
          >
        </div>
      </NAlert>
      <!-- 6 步发版微流水线时间轴卡片 (Glass Panel Timeline) -->
      <div class="glass-panel p-5 rounded-2xl space-y-4 mb-4">
        <div class="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 class="text-base font-bold text-text-1 flex items-center gap-2 m-0">
              <span>统一发版流水线</span>
              <span
                class="text-xs font-mono px-2 py-0.5 rounded bg-brand-soft text-brand-500 border border-brand-200"
              >
                {{ project.version }} → {{ store.plan?.projectVersion ?? '推演中' }}
              </span>
            </h2>
            <p class="text-xs text-text-3 mt-1 m-0">
              跨工程批量推演语义版本、审核双轨日志、打包归档与 Git 里程碑打 Tag
            </p>
          </div>
        </div>
        <div class="flex items-stretch gap-2 pt-2 overflow-x-auto">
          <div
            v-for="(st, idx) in [
              { title: '检测变更', desc: 'Preflight' },
              { title: '版本推演', desc: 'SemVer' },
              { title: '双轨日志', desc: 'Changelog' },
              { title: '预检预演', desc: 'Dry-Run' },
              { title: '执行发版', desc: 'SSE Terminal' },
              { title: '完成归档', desc: 'Done' },
            ]"
            :key="idx"
            class="flex flex-col items-center text-center cursor-pointer min-w-[80px] flex-1 focus-ring rounded-md"
            role="button"
            :tabindex="idx + 1 <= store.step ? 0 : -1"
            :aria-current="store.step === idx + 1 ? 'step' : undefined"
            :aria-disabled="idx + 1 > store.step ? 'true' : undefined"
            :aria-label="`${st.title} ${st.desc} 第 ${idx + 1} 步${store.step === idx + 1 ? ' 当前步骤' : idx + 1 < store.step ? ' 可返回' : ' 未完成'}`"
            @click="idx + 1 < store.step && store.goTo(idx + 1)"
            @keydown.enter.prevent="idx + 1 < store.step && store.goTo(idx + 1)"
            @keydown.space.prevent="idx + 1 < store.step && store.goTo(idx + 1)"
          >
            <div
              class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono font-bold mb-1.5 transition-[background-color,border-color,color,box-shadow,transform,opacity]"
              :class="[
                store.step > idx + 1
                  ? 'bg-brand-500 text-black shadow-glow-emerald'
                  : store.step === idx + 1
                    ? 'bg-info text-black animate-pulse font-extrabold shadow-glow-cyan'
                    : 'bg-surface-alt text-text-3 border border-border',
              ]"
            >
              {{ idx + 1 }}
            </div>
            <span
              class="text-xs font-medium"
              :class="store.step === idx + 1 ? 'text-text-1 font-bold' : 'text-text-2'"
              >{{ st.title }}</span
            >
            <span class="text-[10px] text-text-3 font-mono">{{ st.desc }}</span>
          </div>
        </div>
      </div>

      <div class="glass-panel p-6 rounded-2xl mt-4">
        <div v-show="store.step === 1">
          <StepDetect
            :project="project"
            :statuses="statuses"
            :failed-repos="failedRepos"
            :detecting="detecting"
            :branch-alignment="branchAlignment"
            :failed-repo-ids="failedRepoIds"
            :changed-repo-ids="changedRepoIds"
            :visible-commits="visibleCommits"
            :hidden-commits-count="hiddenCommitsCount"
            :show-all-commits="showAllCommits"
            @detect="detect()"
            @detect-repo="detectRepo($event)"
            @batch-checkout="doBatchCheckout($event)"
            @batch-pull="doBatchPull()"
          />
        </div>
        <div v-show="store.step === 2">
          <StepVersion :project="project" />
        </div>
        <div v-show="store.step === 3">
          <StepLogs :project="project" />
        </div>
        <div v-show="store.step === 4">
          <StepDryRun :project="project" :statuses="statuses" />
        </div>
        <div v-show="store.step === 5">
          <StepExecute />
        </div>
        <div v-show="store.step === 6">
          <StepResult
            :project-id="projectId"
            @again="handleAgain"
            @retry-bump="handleRetryBump"
            @resume="handleResume"
          />
        </div>
      </div>

      <!-- 底部步骤操作栏 -->
      <div class="flex items-center justify-between mt-6">
        <NButton :disabled="store.step <= 1 || store.phase === 'running'" @click="goPrev">
          <template #icon><i aria-hidden="true" class="i-carbon-arrow-left" /></template>
          上一步
        </NButton>
        <div class="flex items-center gap-2.5">
          <template v-if="store.step === 1">
            <NButton
              type="primary"
              :disabled="store.selectedRepoIds.length === 0"
              @click="gotoStep2"
            >
              下一步
              <template #icon><i aria-hidden="true" class="i-carbon-arrow-right" /></template>
            </NButton>
          </template>
          <template v-else-if="store.step === 2">
            <NButton type="primary" :disabled="store.planning || !store.plan" @click="goNext">
              下一步
              <template #icon><i aria-hidden="true" class="i-carbon-arrow-right" /></template>
            </NButton>
          </template>
          <template v-else-if="store.step === 3">
            <NButton type="primary" @click="goNext">
              下一步
              <template #icon><i aria-hidden="true" class="i-carbon-arrow-right" /></template>
            </NButton>
          </template>
          <template v-else-if="store.step === 4">
            <NTooltip :disabled="store.canExecute" trigger="hover">
              <template #trigger>
                <NButton
                  type="primary"
                  :disabled="!store.canExecute"
                  :loading="store.phase === 'running'"
                  @click="execute"
                >
                  <template #icon><i aria-hidden="true" class="i-carbon-rocket" /></template>
                  执行发布
                </NButton>
              </template>
              {{ store.bothConfirmed ? '' : '对内/对外日志需全部确认（步骤 3）' }}
            </NTooltip>
          </template>
          <template v-else-if="store.step === 5">
            <NButton :disabled="store.phase === 'running'" @click="goPrev">
              <template #icon><i aria-hidden="true" class="i-carbon-arrow-left" /></template>
              返回预览
            </NButton>
          </template>
        </div>
      </div>
    </template>
    <div v-else><LoadingState /></div>
  </div>
</template>
