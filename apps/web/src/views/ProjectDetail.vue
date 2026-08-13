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
import { useDialog, useMessage } from 'naive-ui'

const route = useRoute()
const router = useRouter()
const projectsStore = useProjectsStore()
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

/** 导出版本清单（R18：下载 / 写入指定仓库） */
const exporting = ref(false)
const showExportWrite = ref(false)
const exportWriteForm = reactive({ repoId: '', path: 'versions.json' })
const exportWriteSaving = ref(false)

async function exportDownload() {
  if (!project.value) return
  exporting.value = true
  try {
    const items = await api.projectVersions(projectId.value)
    const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json; charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${project.value.name}-versions.json`
    a.click()
    URL.revokeObjectURL(url)
    message.success(`已下载 ${items.length} 个仓库的版本清单`)
  } catch (e) {
    message.error((e as Error).message)
  } finally {
    exporting.value = false
  }
}

function openExportWrite() {
  if (!project.value) return
  const key = `bxverse-export-${projectId.value}`
  const saved = JSON.parse(localStorage.getItem(key) ?? '{}') as { repoId?: string; path?: string }
  exportWriteForm.repoId = saved.repoId && project.value.repos.some(r => r.id === saved.repoId)
    ? saved.repoId
    : (project.value.repos[0]?.id ?? '')
  exportWriteForm.path = saved.path ?? 'versions.json'
  showExportWrite.value = true
}

async function submitExportWrite() {
  if (!project.value || !exportWriteForm.repoId || !exportWriteForm.path.trim()) return
  exportWriteSaving.value = true
  try {
    const result = await api.exportProjectVersions(projectId.value, {
      repoId: exportWriteForm.repoId,
      path: exportWriteForm.path.trim(),
    })
    localStorage.setItem(`bxverse-export-${projectId.value}`, JSON.stringify({
      repoId: exportWriteForm.repoId,
      path: exportWriteForm.path.trim(),
    }))
    showExportWrite.value = false
    message.success(`已写入 ${result.count} 个仓库版本 → ${result.path}`)
  } catch (e) {
    message.error((e as Error).message)
  } finally {
    exportWriteSaving.value = false
  }
}

const exportOptions = [
  { label: '下载 JSON 文件', key: 'download', icon: () => 'i-carbon-download' },
  { label: '写入指定仓库', key: 'write', icon: () => 'i-carbon-save' },
]

function onExportSelect(key: string) {
  if (key === 'download') void exportDownload()
  else openExportWrite()
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
          <template #icon><i class="i-carbon-rocket" /></template>
          发布新版本
        </NButton>
        <NButton @click="showAddRepo = true">
          <template #icon><i class="i-carbon-add" /></template>
          接入仓库
        </NButton>
        <NDropdown trigger="click" :options="exportOptions" @select="onExportSelect">
          <NButton :loading="exporting">
            <template #icon><i class="i-carbon-download" /></template>
            导出版本清单
          </NButton>
        </NDropdown>
        <NButton quaternary @click="showEdit = true">
          <template #icon><i class="i-carbon-edit" /></template>
          编辑
        </NButton>
        <NButton quaternary type="error" @click="confirmDelete">
          <template #icon><i class="i-carbon-trash-can" /></template>
          删除
        </NButton>
      </PageHeader>

      <!-- 仓库 -->
      <section>
        <h2 class="section-title">
          <i class="i-carbon-git-branch text-brand-500" /> 代码仓库
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
          <i class="i-carbon-version text-brand-500" /> 发布历史
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
              @click="openDetail(r)"
            >
              <div class="flex items-center gap-3 flex-wrap">
                <span class="code-text font-medium text-text-1">{{ r.version }}</span>
                <StatusBadge type="bump" :bump="r.bump" />
                <StatusBadge type="pushed" :pushed="r.pushed" />
                <span class="flex-1" />
                <span class="text-xs text-text-3">{{ r.date.slice(0, 10) }}</span>
                <i class="i-carbon-chevron-right text-text-3" />
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

      <!-- 写入版本清单弹窗（R18） -->
      <NModal
        v-model:show="showExportWrite"
        preset="card"
        title="写入版本清单到仓库"
        class="w-130 max-w-95vw"
      >
        <div class="space-y-4 py-1">
          <div>
            <div class="text-sm font-medium text-text-1 mb-1.5">目标仓库</div>
            <NSelect
              v-model:value="exportWriteForm.repoId"
              :options="project.repos.map(r => ({ label: `${r.displayName || r.name}（${r.name}）`, value: r.id }))"
              placeholder="选择要写入的仓库"
            />
          </div>
          <div>
            <div class="text-sm font-medium text-text-1 mb-1.5">文件路径（相对仓库根）</div>
            <NInput v-model:value="exportWriteForm.path" placeholder="如：versions.json 或 public/versions.json" />
            <div class="text-xs text-text-3 mt-1.5">
              生成 <span class="code-text">[{ app, name, version }]</span> JSON 数组并写入该仓库工作树（不 commit，由你自行提交）
            </div>
          </div>
        </div>
        <template #footer>
          <div class="flex justify-end gap-2.5">
            <NButton quaternary @click="showExportWrite = false">取消</NButton>
            <NButton
              type="primary"
              :loading="exportWriteSaving"
              :disabled="!exportWriteForm.repoId || !exportWriteForm.path.trim()"
              @click="submitExportWrite"
            >
              写入
            </NButton>
          </div>
        </template>
      </NModal>

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
