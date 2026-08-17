<script setup lang="ts">
// ProjectDetail.vue —— 项目详情（仓库网格 + 发布历史 + 项目管理）

import type { ReleaseRecord, RepoStatus, BranchAlignmentResult } from '@bxverse/shared'
import { useProjectsStore } from '../stores/projects'
import { useAppStore } from '../stores/app'
import { usePolling } from '../composables/usePolling'
import { api } from '../api'
import PageHeader from '../components/PageHeader.vue'
import RepoCard from '../components/RepoCard.vue'
import StatusBadge from '../components/StatusBadge.vue'
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
  <div class="page">
    <template v-if="project">
      <PageHeader
        :title="project.name"
        :description="project.description || undefined"
        back-to="/"
        icon="i-carbon-catalog"
      >
        <template #badges>
          <StatusBadge type="version" :label="project.version" />
          <StatusBadge type="scheme" :label="project.repoVersionScheme === 'hybrid' ? '混合版本' : '时间戳版本'" />
          <StatusBadge type="log" :log-state="'auto'" />
        </template>
        <NButton type="primary" @click="router.push(`/project/${project.id}/release`)">
          <template #icon><i aria-hidden="true" class="i-carbon-rocket" /></template>
          发布新版本
        </NButton>
        <NButton @click="showAddRepo = true">
          <template #icon><i aria-hidden="true" class="i-carbon-add" /></template>
          接入仓库
        </NButton>
        <NButton @click="router.push(`/project/${project.id}/backups`)">
          <template #icon><i aria-hidden="true" class="i-carbon-document-protected" /></template>
          备份与对比
        </NButton>
        <VersionExportDropdown
          :project-id="projectId"
          filename="version.json"
          :load-items="() => api.projectVersions(projectId)"
        />
        <NButton quaternary @click="showEdit = true">
          <template #icon><i aria-hidden="true" class="i-carbon-edit" /></template>
          编辑
        </NButton>
        <NButton quaternary type="error" @click="confirmDelete">
          <template #icon><i aria-hidden="true" class="i-carbon-trash-can" /></template>
          删除
        </NButton>
      </PageHeader>
      <!-- 分支协同巡检警示条 (R25 / 建议 1) -->
      <div
        v-if="branchAlignment && !branchAlignment.isAllAligned"
        class="mb-4 p-3.5 rounded-lg border border-warning/40 bg-warning/10 flex items-center justify-between gap-3 text-xs"
      >
        <div class="flex items-center gap-2">
          <i aria-hidden="true" class="i-carbon-warning-filled text-warning shrink-0 text-base" />
          <span class="text-text-1">
            分支协同预警：检测到
            <strong class="text-warning">{{ branchAlignment.items.filter(x => !x.isAligned).map(x => `${x.repoName} (${x.branch})`).join('、') }}</strong>
            未停留在主发布分支 ({{ branchAlignment.defaultBranch }})
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

      <!-- 仓库 -->
      <section>
        <h2 class="section-title">
          <i aria-hidden="true" class="i-carbon-git-branch text-brand-500" /> 代码仓库
          <span class="chip">{{ project.repos.length }}</span>
        </h2>
        <div v-if="project.repos.length === 0" class="card mt-4">
          <EmptyState
            title="还没有接入仓库"
            description="支持两种方式：选择本地 git 仓库路径，或输入 git 地址克隆。"
            @action="showAddRepo = true"
          />
        </div>
        <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
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

      <!-- 发布历史 -->
      <section>
        <h2 class="section-title">
          <i aria-hidden="true" class="i-carbon-version text-brand-500" /> 发布历史
        </h2>
        <div class="card mt-4">
          <div v-if="releasesLoading" class="p-5 text-center text-text-3"><NSpin size="small" /></div>
          <div v-else-if="releases.length === 0" class="p-5">
            <EmptyState
              title="暂无发布记录"
              description="首次发布后，这里将展示统一版本与聚合改动点。"
            />
          </div>
          <div v-else class="divide-y divide-border">
            <div
              v-for="r in releases"
              :key="r.id"
              class="release-row px-5 py-3.5 cursor-pointer hover:bg-surface-hover transition-colors duration-150"
              role="button"
              tabindex="0"
              :aria-label="`查看 ${r.version} 发布详情`"
              @click="openDetail(r)"
              @keydown.enter="openDetail(r)"
              @keydown.space.prevent="openDetail(r)"
            >
              <div class="flex items-center gap-3 flex-wrap">
                <span class="version-badge" :class="r.deprecated ? 'opacity-50 line-through' : ''" translate="no">
                  <span class="tick" />{{ r.version }}
                </span>
                <StatusBadge type="bump" :bump="r.bump" />
                <StatusBadge type="pushed" :pushed="r.pushed" />
                <span v-if="r.deprecated" class="chip chip-error text-xs" :title="'废弃原因: ' + r.deprecateReason">
                  ⚠️ 已废弃 ({{ r.deprecateReason || '人为撤销' }})
                </span>
                <span class="flex-1" />
                <VersionExportDropdown
                  :project-id="projectId"
                  :filename="`${r.version}-version.json`"
                  :load-items="() => api.releaseVersions(r.id)"
                  label="版本清单"
                  size="tiny"
                  quaternary
                />
                <NButton v-if="!r.deprecated" size="tiny" quaternary type="warning" @click.stop="openDeprecate(r)">
                  标为废弃
                </NButton>
                <span class="text-xs text-text-3">{{ formatDate(r.date) }}</span>
                <i aria-hidden="true" class="i-carbon-chevron-right text-text-3" />
              </div>
              <div class="mt-1.5 text-xs text-text-3">
                {{ (r.repos ?? []).map(x => x.repoName).join('、') || r.scopeName }}
              </div>
            </div>
          </div>
          <div v-if="!releasesLoading && releases.length > 0" class="border-t border-border">
            <button v-if="!releaseExpanded" class="link w-full py-2.5 text-center" @click="expandReleases">查看全部发布历史（最多 100 条）</button>
            <button v-else class="link w-full py-2.5 text-center" @click="releaseExpanded = false; loadReleases()">收起（回到最近 5 条）</button>
          </div>
        </div>
      </section>

      <AddRepoDialog v-model:show="showAddRepo" :project-id="projectId" @added="loadStatuses" />
      <AddProjectDialog v-model:show="showEdit" :editing="project" @saved="projectsStore.load()" />

      <!-- 记录详情抽屉 -->
      <NDrawer v-model:show="showDetail" :width="560">
        <NDrawerContent v-if="detailRelease" :title="detailRelease.version" closable>
          <NTabs type="segment" animated>
            <NTabPane name="external" tab="对外">
              <MarkdownView :content="detailRelease.logs.external.content" :max-lines="800" />
            </NTabPane>
            <NTabPane name="internal" tab="对内">
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
