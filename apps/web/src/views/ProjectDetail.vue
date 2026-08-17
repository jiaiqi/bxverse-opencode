<script setup lang="ts">
// ProjectDetail.vue —— 项目详情（仓库网格 + 发布历史 + 项目管理）

import type { ReleaseRecord, RepoStatus } from '@bxverse/shared'
import { useProjectsStore } from '../stores/projects'
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
import { usePolling } from '../composables/usePolling'
import { useAppStore } from '../stores/app'
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
    releases.value = await projectsStore.projectReleases(projectId.value, 5)
  } finally {
    releasesLoading.value = false
  }
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

watch(projectId, async (id) => {
  statuses.value = new Map()
  if (!projectsStore.byId(id)) await projectsStore.load()
  await Promise.all([loadStatuses(), loadReleases()])
}, { immediate: true })

// 状态轮询（30s 或配置周期）
usePolling(async () => {
  if (project.value) await Promise.all([loadStatuses(), loadReleases()])
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
              class="px-5 py-3.5 cursor-pointer hover:bg-surface-hover transition-colors duration-150"
              role="button"
              tabindex="0"
              :aria-label="`查看 ${r.version} 发布详情`"
              @click="openDetail(r)"
              @keydown.enter="openDetail(r)"
              @keydown.space.prevent="openDetail(r)"
            >
              <div class="flex items-center gap-3 flex-wrap">
                <span class="code-text font-medium text-text-1" translate="no">{{ r.version }}</span>
                <StatusBadge type="bump" :bump="r.bump" />
                <StatusBadge type="pushed" :pushed="r.pushed" />
                <span class="flex-1" />
                <VersionExportDropdown
                  :project-id="projectId"
                  :filename="`${r.version}-version.json`"
                  :load-items="() => api.releaseVersions(r.id)"
                  label="版本清单"
                  size="tiny"
                  quaternary
                />
                <span class="text-xs text-text-3">{{ formatDate(r.date) }}</span>
                <i aria-hidden="true" class="i-carbon-chevron-right text-text-3" />
              </div>
              <div class="mt-1.5 text-xs text-text-3">
                {{ (r.repos ?? []).map(x => x.repoName).join('、') || r.scopeName }}
              </div>
            </div>
          </div>
        </div>
      </section>

      <AddRepoDialog v-model:show="showAddRepo" :project-id="project.id" @added="loadStatuses" />
      <AddProjectDialog v-model:show="showEdit" :editing="project" @saved="projectsStore.load()" />

      <!-- 记录详情抽屉 -->
      <NDrawer v-model:show="showDetail" :width="560">
        <NDrawerContent v-if="detailRelease" :title="detailRelease.version" closable>
          <NTabs type="segment" animated>
            <NTabPane name="external" tab="对外">
              <MarkdownView :content="detailRelease.logs.external.content" />
            </NTabPane>
            <NTabPane name="internal" tab="对内">
              <MarkdownView :content="detailRelease.logs.internal.content" />
            </NTabPane>
          </NTabs>
        </NDrawerContent>
      </NDrawer>
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
