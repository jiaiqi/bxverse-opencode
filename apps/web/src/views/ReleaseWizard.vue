<script setup lang="ts">
// ReleaseWizard.vue —— 发布向导六步（M4）

import type { RepoStatus } from '@bxverse/shared'
import { useProjectsStore } from '../stores/projects'
import { usePublishStore } from '../stores/publish'
import PageHeader from '../components/PageHeader.vue'
import StatusBadge from '../components/StatusBadge.vue'
import EmptyState from '../components/EmptyState.vue'
import LogEditor from '../components/LogEditor.vue'
import PublishConsole from '../components/PublishConsole.vue'
import { useDialog, useMessage } from 'naive-ui'
import type { PublishEventLike } from '../api'

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
const detecting = ref(true)

async function detect() {
  if (!project.value) return
  detecting.value = true
  statuses.value = new Map()
  await Promise.all(
    project.value.repos.map(async (repo) => {
      try {
        const st = await projectsStore.repoStatus(projectId.value, repo.id, true)
        statuses.value.set(repo.id, st)
      } catch {
        statuses.value.set(repo.id, null)
      }
    }),
  )
  statuses.value = new Map(statuses.value)
  detecting.value = false
}

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

watch(projectId, async (id) => {
  if (!projectsStore.byId(id)) await projectsStore.load()
  store.reset(id)
  await detect()
  // 默认勾选全部变动仓库
  store.setSelected(changedRepoIds.value)
}, { immediate: true })

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
            <div class="space-y-3">
              <div
                v-for="repo in project.repos"
                :key="repo.id"
                class="flex items-center gap-3 px-4 py-3 rounded-md border transition-all duration-150"
                :class="statuses.get(repo.id)?.changed
                  ? 'border-brand-200 bg-brand-50 hover:border-brand-300 cursor-pointer'
                  : 'border-border bg-surface-alt opacity-70'"
                @click="statuses.get(repo.id)?.changed && toggleRepo(repo.id)"
              >
                <NCheckbox
                  :checked="store.selectedRepoIds.includes(repo.id)"
                  :disabled="!statuses.get(repo.id)?.changed"
                  @click.stop
                  @update:checked="() => toggleRepo(repo.id)"
                />
                <i class="i-carbon-git-branch text-text-3" />
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-medium text-text-1 text-sm">{{ repo.displayName || repo.name }}</span>
                    <span class="code-text text-xs text-text-3">{{ repo.name }}</span>
                    <StatusBadge v-if="statuses.get(repo.id)?.changed" type="changed" :count="statuses.get(repo.id)!.commits.length" />
                    <StatusBadge v-if="statuses.get(repo.id) && statuses.get(repo.id)!.dirty > 0" type="dirty" :count="statuses.get(repo.id)!.dirty" />
                  </div>
                  <div class="text-xs text-text-3 mt-0.5">
                    {{ statuses.get(repo.id)?.head.slice(0, 7) }} · {{ statuses.get(repo.id)?.branch }}
                  </div>
                </div>
                <div class="text-xs" :class="statuses.get(repo.id)?.changed ? 'text-brand-600' : 'text-text-3'">
                  {{ statuses.get(repo.id)?.changed ? '有变动' : '已同步' }}
                </div>
              </div>
            </div>
            <div v-if="project.repos.length === 0" class="py-8">
              <EmptyState title="还没有仓库" description="请先接入仓库再发起发布" />
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
                  <i class="i-carbon-arrow-right text-text-3" />
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
                  <i class="i-carbon-git-branch text-brand-500" />
                  <span class="font-medium text-text-1 text-sm min-w-30">{{ r.name }}</span>
                  <span class="code-text text-xs text-text-3">{{ r.from?.slice(0, 7) ?? '首次' }} → {{ r.to?.slice(0, 7) }}</span>
                  <span class="code-text text-sm text-brand-600">{{ r.version }}</span>
                  <span class="chip">{{ r.commits.length }} 提交</span>
                </div>
              </div>
            </div>

            <div v-if="store.plan.syncedOnly.length" class="mt-4">
              <NCollapse>
                <NCollapseItem :title="`仅同步基版 version.json（${store.plan.syncedOnly.length} 个未变动仓库）`" name="sync">
                  <div class="text-sm text-text-2 space-y-1">
                    <div v-for="s in store.plan.syncedOnly" :key="s.repoId" class="flex items-center gap-2">
                      <i class="i-carbon-renew text-text-3" />
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
          <div class="flex items-center gap-6 mb-4">
            <div class="flex items-center gap-2">
              <NSwitch v-model:value="store.offline" />
              <span class="text-sm text-text-2">离线发布（跳过远程推送）</span>
            </div>
            <div class="flex items-center gap-2">
              <NSwitch v-model:value="store.skipBuild" />
              <span class="text-sm text-text-2">跳过构建命令</span>
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
              <i class="i-carbon-checkmark-filled text-48px text-success" />
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
            <NButton type="primary" secondary @click="store.reset(projectId); detect(); store.setSelected(changedRepoIds)">再次发布</NButton>
          </div>
        </div>
      </div>

      <!-- 底部步骤操作栏 -->
      <div class="flex items-center justify-between mt-6">
        <NButton :disabled="store.step <= 1 || store.phase === 'running'" @click="store.step -= 1">
          <template #icon><i class="i-carbon-arrow-left" /></template>
          上一步
        </NButton>
        <div class="flex items-center gap-2.5">
          <template v-if="store.step === 1">
            <NButton type="primary" :disabled="store.selectedRepoIds.length === 0" @click="gotoStep2">
              下一步
              <template #icon><i class="i-carbon-arrow-right" /></template>
            </NButton>
          </template>
          <template v-else-if="store.step === 2">
            <NButton type="primary" :disabled="store.planning || !store.plan" @click="store.step = 3">
              下一步
              <template #icon><i class="i-carbon-arrow-right" /></template>
            </NButton>
          </template>
          <template v-else-if="store.step === 3">
            <NButton type="primary" @click="store.step = 4">
              下一步
              <template #icon><i class="i-carbon-arrow-right" /></template>
            </NButton>
          </template>
          <template v-else-if="store.step === 4">
            <NTooltip :disabled="store.canExecute" trigger="hover">
              <template #trigger>
                <NButton type="primary" :disabled="!store.canExecute" :loading="store.phase === 'running'" @click="execute">
                  <template #icon><i class="i-carbon-rocket" /></template>
                  执行发布
                </NButton>
              </template>
              {{ store.bothConfirmed ? '' : '对内/对外日志需全部确认（步骤 3）' }}
            </NTooltip>
          </template>
          <template v-else-if="store.step === 5">
            <NButton :disabled="store.phase === 'running'" @click="store.step = 4">
              <template #icon><i class="i-carbon-arrow-left" /></template>
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
