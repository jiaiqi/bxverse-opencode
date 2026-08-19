<script setup lang="ts">
// ProjectDetail.vue —— 项目详情（仓库网格 + 发布历史 + 项目管理）

import type { ReleaseRecord, RepoStatus, BranchAlignmentResult } from '@bxverse/shared'
import { useProjectsStore } from '../stores/projects'
import { useAppStore } from '../stores/app'
import { usePolling } from '../composables/usePolling'
import { api } from '../api'
import RepoCard from '../components/RepoCard.vue'
import MarkdownView from '../components/MarkdownView.vue'
import EmptyState from '../components/EmptyState.vue'
import AddRepoDialog from '../components/AddRepoDialog.vue'
import AddProjectDialog from '../components/AddProjectDialog.vue'
import VersionExportDropdown from '../components/VersionExportDropdown.vue'
import { useDialog, useMessage } from 'naive-ui'
import { formatDate } from '../utils/format'

const route = useRoute()
const router = useRouter()
const projectsStore = useProjectsStore()
const appStore = useAppStore()
const dialog = useDialog()
const message = useMessage()

const projectId = computed(() => String(route.params.id))
const project = computed(() => projectsStore.byId(projectId.value))
const showAddRepo = ref(false)
const showEdit = ref(false)

const statuses = ref<Map<string, RepoStatus | null>>(new Map())
const statusLoading = ref<Set<string>>(new Set())
const releases = ref<ReleaseRecord[]>([])
const releasesLoading = ref(false)
/** 发布历史默认只取最近 5 条，可展开加载全部（最多 100 条，服务端上限） */
const releaseExpanded = ref(false)

async function loadStatuses() {
  if (!project.value) return
  await Promise.all(
    project.value.repos.map(async (repo) => {
      statusLoading.value.add(repo.id)
      statusLoading.value = new Set(statusLoading.value)
      try {
        statuses.value.set(repo.id, await projectsStore.repoStatus(projectId.value, repo.id))
      } catch {
        statuses.value.set(repo.id, null)
      } finally {
        const next = new Set(statusLoading.value)
        next.delete(repo.id)
        statusLoading.value = next
      }
    }),
  )
  statuses.value = new Map(statuses.value)
}

async function loadReleases() {
  releasesLoading.value = true
  try {
    releases.value = await projectsStore.projectReleases(projectId.value, releaseExpanded.value ? 100 : 5)
  } finally {
    releasesLoading.value = false
  }
}

function expandReleases() {
  releaseExpanded.value = true
  void loadReleases()
}

async function refreshRepo(rid: string) {
  try {
    const status = await projectsStore.repoStatus(projectId.value, rid, true)
    statuses.value.set(rid, status)
    statuses.value = new Map(statuses.value)
  } catch (e) {
    message.error((e as Error).message)
  }
}

function confirmDelete() {
  dialog.warning({
    title: '删除项目',
    content: `确定删除「${project.value?.name}」？发布记录不会被删除，仅移除管理定义。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await projectsStore.remove(projectId.value)
        message.success('项目已删除')
        router.push('/')
      } catch (e) {
        message.error((e as Error).message)
      }
    },
  })
}

const sortedRepos = computed(() => {
  const repos = [...(project.value?.repos ?? [])]
  return repos.sort((a, b) => {
    const ca = statuses.value.get(a.id)?.changed ? 1 : 0
    const cb = statuses.value.get(b.id)?.changed ? 1 : 0
    return cb - ca
  })
})

const detailRelease = ref<ReleaseRecord | null>(null)
const showDetail = ref(false)

function openDetail(r: ReleaseRecord) {
  detailRelease.value = r
  showDetail.value = true
}

// ---------- 分支协同巡检 (R25 / 建议 1) ----------
const branchAlignment = ref<BranchAlignmentResult | null>(null)
const checkingBranches = ref(false)

async function checkBranchAlignment() {
  if (!projectId.value) return
  checkingBranches.value = true
  try {
    branchAlignment.value = await api.branchAlignment(projectId.value, 'master')
  } catch {
    // 忽略
  } finally {
    checkingBranches.value = false
  }
}

async function doBatchCheckout(branch = 'master') {
  try {
    await api.batchCheckout(projectId.value, branch)
    message.success(`已批量将所有工程切至「${branch}」分支`)
    await Promise.all([loadStatuses(), checkBranchAlignment()])
  } catch (e) {
    message.error((e as Error).message)
  }
}

async function doBatchPull() {
  try {
    const res = await api.batchPull(projectId.value)
    message.success(res.ok ? '全矩阵工程批量快进拉取成功！' : '部分仓库拉取存在警告')
    await Promise.all([loadStatuses(), checkBranchAlignment()])
  } catch (e) {
    message.error((e as Error).message)
  }
}

// ---------- 标为废弃 (R24 / 建议 4) ----------
const deprecateModal = reactive({
  open: false,
  release: null as ReleaseRecord | null,
  reason: '',
  cleanupTags: true,
  submitting: false,
})

function openDeprecate(r: ReleaseRecord) {
  deprecateModal.release = r
  deprecateModal.reason = ''
  deprecateModal.cleanupTags = true
  deprecateModal.open = true
}

async function submitDeprecate() {
  if (!deprecateModal.release) return
  deprecateModal.submitting = true
  try {
    const updated = await api.deprecateRelease(deprecateModal.release.id, {
      reason: deprecateModal.reason.trim() || '人为标为废弃',
      cleanupTags: deprecateModal.cleanupTags,
    })
    message.success(`版本 ${updated.version} 已标为废弃`)
    deprecateModal.open = false
    await loadReleases()
  } catch (e) {
    message.error((e as Error).message)
  } finally {
    deprecateModal.submitting = false
  }
}

watch(projectId, async (id) => {
  statuses.value = new Map()
  releaseExpanded.value = false
  if (!projectsStore.byId(id)) await projectsStore.load()
  await Promise.all([loadStatuses(), loadReleases(), checkBranchAlignment()])
}, { immediate: true })

// 状态轮询（30s 或配置周期）
usePolling(async () => {
  if (project.value) await Promise.all([loadStatuses(), loadReleases(), checkBranchAlignment()])
}, appStore.pollInterval || 30_000)
</script>

<template>
  <div class="page max-w-6xl space-y-6">
    <template v-if="project">
      <!-- 1. 项目头部卡片 (Glass Panel Command Header) -->
      <div class="glass-panel p-5 rounded-2xl space-y-4">
        <div class="flex items-start justify-between gap-4 flex-wrap">
          <div class="flex items-start gap-3.5 min-w-0">
            <div class="w-10 h-10 rounded-xl bg-brand-soft text-brand-500 flex items-center justify-center font-bold text-lg border border-brand-200 shrink-0">
              {{ project.name.slice(0, 1) }}
            </div>
            <div class="min-w-0">
              <div class="flex items-center gap-2.5 flex-wrap">
                <h1 class="text-lg font-bold text-text-1 truncate m-0">{{ project.name }}</h1>
                <span class="font-mono text-xs font-bold px-2 py-0.5 rounded bg-surface-alt border border-border text-info">
                  {{ project.version }}
                </span>
                <span class="text-xs font-mono text-text-3">方案: {{ project.repoVersionScheme || 'hybrid' }}</span>
                <span class="text-xs font-mono text-text-3">推演: {{ project.bump || 'auto' }}</span>
              </div>
              <p class="text-xs text-text-3 mt-1 m-0 leading-relaxed">{{ project.description || '暂无业务描述' }}</p>
            </div>
          </div>

          <!-- 核心操作栏 -->
          <div class="flex items-center gap-2 flex-wrap shrink-0">
            <NButton type="primary" @click="router.push(`/project/${project.id}/release`)">
              <template #icon><i aria-hidden="true" class="i-carbon-rocket" /></template>
              统一发版
            </NButton>
            <NButton type="info" secondary @click="showAddRepo = true">
              <template #icon><i aria-hidden="true" class="i-carbon-branch" /></template>
              接入新仓库
            </NButton>
            <VersionExportDropdown
              :project-id="projectId"
              :filename="`${project.name}-versions.json`"
              :load-items="() => api.projectVersions(projectId)"
            />
            <NButton quaternary @click="showEdit = true" title="编辑项目配置">
              <template #icon><i aria-hidden="true" class="i-carbon-settings" /></template>
            </NButton>
            <NButton quaternary type="error" @click="confirmDelete" title="删除项目">
              <template #icon><i aria-hidden="true" class="i-carbon-trash-can" /></template>
            </NButton>
          </div>
        </div>
      </div>

      <!-- 2. 分支协同巡检警示条 (R25 / 建议 1) -->
      <div
        v-if="branchAlignment && !branchAlignment.isAllAligned"
        class="p-3.5 rounded-xl border border-warning/40 bg-warning/10 flex items-center justify-between gap-3 text-xs font-mono animate-fadeIn"
      >
        <div class="flex items-center gap-2.5">
          <i aria-hidden="true" class="i-carbon-warning-filled text-warning shrink-0 text-base" />
          <span class="text-text-1">
            分支协同巡检预警：检测到
            <strong class="text-warning font-semibold">{{ branchAlignment.items.filter(x => !x.isAligned).map(x => `${x.repoName} (${x.branch})`).join('、') }}</strong>
            未停留在主发布分支 ({{ branchAlignment.defaultBranch }})
          </span>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <NButton size="tiny" type="warning" @click="doBatchCheckout(branchAlignment.defaultBranch)">
            <template #icon><i aria-hidden="true" class="i-carbon-reset" /></template>
            一键切至主分支
          </NButton>
          <NButton size="tiny" quaternary @click="doBatchPull">
            <template #icon><i aria-hidden="true" class="i-carbon-cloud-download" /></template>
            批量快进拉取
          </NButton>
        </div>
      </div>

      <!-- 3. 关联 Git 仓库管理网格 (Repo Matrix) -->
      <section class="space-y-3">
        <div class="flex items-center justify-between">
          <h2 class="section-title text-sm font-bold text-text-1 flex items-center gap-2">
            <i aria-hidden="true" class="i-carbon-branch text-info" />
            <span>关联 Git 仓库列表 ({{ project.repos.length }})</span>
          </h2>
          <button
            class="text-xs font-mono text-info hover:underline flex items-center gap-1 bg-transparent border-0 cursor-pointer"
            @click="showAddRepo = true"
          >
            <i aria-hidden="true" class="i-carbon-add text-12px" /> 接入新工程
          </button>
        </div>

        <div v-if="project.repos.length === 0" class="card">
          <EmptyState
            title="还没有接入仓库"
            description="支持两种方式：选择本地已有 git 仓库绝对路径，或输入 git 远程地址克隆。"
            @action="showAddRepo = true"
          />
        </div>
        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <RepoCard
            v-for="repo in sortedRepos"
            :key="repo.id"
            :repo="repo"
            :status="statuses.get(repo.id)"
            :loading="statusLoading.has(repo.id)"
            @open="router.push(`/repo/${project.id}/${repo.id}`)"
            @refresh="refreshRepo(repo.id)"
          />
        </div>
      </section>

      <!-- 4. 历次发布审计记录表格 (Release History Table) -->
      <section class="glass-panel rounded-2xl p-5 space-y-3">
        <div class="flex items-center justify-between">
          <h2 class="section-title text-sm font-bold text-text-1 flex items-center gap-2">
            <i aria-hidden="true" class="i-carbon-history text-[#A855F7]" />
            <span>历次发布审计记录 (Release Audit Trail)</span>
          </h2>
          <span class="text-xs font-mono text-text-3">历史数据由本地 Git 数据仓库自动审计存盘</span>
        </div>

        <div v-if="releasesLoading" class="p-5 text-center text-text-3"><NSpin size="small" /></div>
        <div v-else-if="releases.length === 0" class="p-5">
          <EmptyState
            title="暂无发布记录"
            description="首次发布后，这里将展示统一版本与聚合改动点审计。"
          />
        </div>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr class="text-text-3 border-b border-border text-[11px]">
                <th class="py-2.5 px-3 font-medium">发布版本</th>
                <th class="py-2.5 px-3 font-medium">发布时间</th>
                <th class="py-2.5 px-3 font-medium">关联工程</th>
                <th class="py-2.5 px-3 font-medium">状态 / 审计</th>
                <th class="py-2.5 px-3 font-medium">归档备份</th>
                <th class="py-2.5 px-3 font-medium text-right">操作与纠偏</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr v-for="r in releases" :key="r.id" class="hover:bg-surface-hover/50 transition-colors" :class="{ 'opacity-60': r.deprecated }">
                <td class="py-2.5 px-3 font-bold" :class="r.deprecated ? 'line-through text-text-3' : 'text-info'">
                  {{ r.version }}
                </td>
                <td class="py-2.5 px-3 text-text-3">{{ formatDate(r.date) }}</td>
                <td class="py-2.5 px-3 text-text-2 truncate max-w-48">
                  {{ (r.repos ?? []).map(x => x.repoName).join('、') || r.scopeName }}
                </td>
                <td class="py-2.5 px-3">
                  <span v-if="r.deprecated" class="chip chip-error text-[10px]" :title="'废弃原因: ' + r.deprecateReason">
                    ⚠️ 已废弃 ({{ r.deprecateReason || '人为撤销' }})
                  </span>
                  <span v-else class="chip chip-brand text-[10px]">
                    ● 双轨已确认
                  </span>
                </td>
                <td class="py-2.5 px-3 text-text-3">
                  <span v-if="r.backups?.length" class="text-brand-500">Bundle+Manifest</span>
                  <span v-else>快照已归档</span>
                </td>
                <td class="py-2.5 px-3 text-right space-x-2">
                  <button class="text-brand-500 hover:underline bg-transparent border-0 cursor-pointer p-0" @click="openDetail(r)">查看日志</button>
                  <button v-if="!r.deprecated" class="text-warning hover:underline bg-transparent border-0 cursor-pointer p-0" @click="openDeprecate(r)">标为废弃</button>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="releases.length >= 5" class="pt-3 border-t border-border flex justify-center">
            <button v-if="!releaseExpanded" class="link text-xs" @click="expandReleases">展开查看全部历史（最多 100 条）</button>
            <button v-else class="link text-xs" @click="releaseExpanded = false; loadReleases()">收起</button>
          </div>
        </div>
      </section>

      <AddRepoDialog v-model:show="showAddRepo" :project-id="projectId" @added="loadStatuses" />
      <AddProjectDialog v-model:show="showEdit" :editing="project" @saved="projectsStore.load()" />

      <!-- 记录详情抽屉 -->
      <NDrawer v-model:show="showDetail" :width="560">
        <NDrawerContent v-if="detailRelease" :title="detailRelease.version" closable>
          <NTabs type="segment" animated>
            <NTabPane name="external" tab="对外日志">
              <MarkdownView :content="detailRelease.logs.external.content" :max-lines="800" />
            </NTabPane>
            <NTabPane name="internal" tab="对内全量">
              <MarkdownView :content="detailRelease.logs.internal.content" :max-lines="800" />
            </NTabPane>
          </NTabs>
        </NDrawerContent>
      </NDrawer>

      <!-- 标为废弃模态框 (R24 / 建议 4) -->
      <NModal
        v-model:show="deprecateModal.open"
        preset="card"
        :title="`标记版本 ${deprecateModal.release?.version} 为已废弃`"
        class="w-130 max-w-95vw"
      >
        <div class="space-y-4 text-xs">
          <p class="text-text-2 leading-relaxed">
            标记废弃会将该版本的审计状态更新为 <strong class="text-error font-semibold">已废弃 (Deprecated)</strong>。
            审计记录安全存入 Git 数据仓库，便于团队追溯。
          </p>
          <div class="field">
            <label for="deprecate-reason" class="text-xs font-medium text-text-1 mb-1 block">废弃原因说明</label>
            <NInput
              id="deprecate-reason"
              v-model:value="deprecateModal.reason"
              placeholder="如：发现严重线上崩溃缺陷，已被后续紧急版本覆盖"
            />
          </div>
          <div class="p-3 rounded-lg bg-surface-alt border border-border space-y-1">
            <label class="flex items-center gap-2 text-text-1 cursor-pointer">
              <input type="checkbox" v-model="deprecateModal.cleanupTags" class="accent-error rounded">
              <span>同时安全撤销当次 Git 里程碑与构建标签 (Tag Cleanup)</span>
            </label>
            <div class="text-11px text-text-3 pl-5">将安全删除业务工程上的本地与远程标签，释放标签名供重发</div>
          </div>
        </div>
        <template #footer>
          <div class="flex justify-end gap-2.5">
            <NButton quaternary @click="deprecateModal.open = false">取消</NButton>
            <NButton type="error" :loading="deprecateModal.submitting" @click="submitDeprecate">确认标为废弃</NButton>
          </div>
        </template>
      </NModal>
    </template>
    <div v-else-if="projectsStore.loading" class="p-10 text-center text-text-3">
      <NSpin size="small" />
    </div>
    <NResult v-else status="404" title="项目不存在" description="可能已被删除或从未创建" class="mt-10">
      <template #footer>
        <NButton @click="router.push('/')">返回总览</NButton>
      </template>
    </NResult>
  </div>
</template>
