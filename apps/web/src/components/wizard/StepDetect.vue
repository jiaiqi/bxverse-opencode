<script setup lang="ts">
import type { ProjectDef, RepoStatus, BranchAlignmentResult } from '@bxverse/shared'
import { usePublishStore } from '../../stores/publish'
import StatusBadge from '../StatusBadge.vue'
import EmptyState from '../EmptyState.vue'

const props = defineProps<{
  project: ProjectDef | undefined
  statuses: Map<string, RepoStatus | null>
  failedRepos: Map<string, string>
  detecting: boolean
  branchAlignment: BranchAlignmentResult | null
  failedRepoIds: string[]
  changedRepoIds: string[]
  visibleCommits: (repoId: string) => RepoStatus['commits']
  hiddenCommitsCount: (repoId: string) => number
  showAllCommits: (repoId: string) => void
}>()

const emit = defineEmits<{
  detect: []
  detectRepo: [repoId: string]
  batchCheckout: [branch: string]
  batchPull: []
}>()

const store = usePublishStore()

function toggleRepo(id: string) {
  const next = new Set(store.selectedRepoIds)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  store.setSelected([...next])
}

const commitsExpanded = ref<Set<string>>(new Set())

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
</script>

<template>
  <div>
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
          <NButton size="tiny" type="warning" @click="emit('batchCheckout', branchAlignment.defaultBranch)">
            <template #icon><i aria-hidden="true" class="i-carbon-reset" /></template>
            一键切至主分支
          </NButton>
          <NButton size="tiny" quaternary @click="emit('batchPull')">
            <template #icon><i aria-hidden="true" class="i-carbon-cloud-download" /></template>
            批量快进拉取
          </NButton>
        </div>
      </div>

      <div v-if="project" class="space-y-3">
        <div v-for="repo in project.repos" :key="repo.id" class="wz-row rounded-md border bg-surface"
          :class="failedRepos.has(repo.id)
            ? 'border-error/50 bg-error-soft'
            : statuses.get(repo.id)?.changed ? 'border-brand-200 bg-brand-soft hover:border-brand-300' : 'border-border opacity-65 hover:border-border-strong'">
          <div
            class="flex items-center gap-3 px-4 py-3 cursor-pointer focus-ring rounded-sm"
            role="button"
            :tabindex="statuses.get(repo.id)?.changed ? 0 : -1"
            :aria-label="`${repo.displayName || repo.name} ${statuses.get(repo.id)?.changed ? (store.selectedRepoIds.includes(repo.id) ? '已选中' : '未选中') : '已同步不可选'}`"
            :aria-pressed="store.selectedRepoIds.includes(repo.id) ? 'true' : 'false'"
            :aria-disabled="!statuses.get(repo.id)?.changed ? 'true' : undefined"
            @click="statuses.get(repo.id)?.changed && toggleRepo(repo.id)"
            @keydown.enter.prevent="statuses.get(repo.id)?.changed && toggleRepo(repo.id)"
            @keydown.space.prevent="statuses.get(repo.id)?.changed && toggleRepo(repo.id)"
          >
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
            <button class="link shrink-0" @click.stop="emit('detectRepo', repo.id)">重试</button>
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
                  @update:checked="(v: unknown) => store.toggleCommit(repo.id, c.fullHash, v as boolean)"
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
      <div v-if="project && project.repos.length === 0" class="py-8">
        <EmptyState title="还没有仓库" description="请先接入仓库再发起发布" />
      </div>
      <div v-else-if="failedRepoIds.length > 0 && changedRepoIds.length === 0" class="py-8">
        <NAlert type="error" :show-icon="true" title="部分仓库检测失败">
          <div class="flex items-center justify-between gap-3 flex-wrap">
            <span class="flex-1 min-w-56">
              {{ failedRepoIds.length }} 个仓库状态获取失败，无法确认是否有变动：{{ failedRepoIds.join('、') }}。
              请先处理下方列出的错误（如仓库路径失效、git 权限等），再重新检测。
            </span>
            <NButton size="tiny" type="primary" secondary @click="emit('detect')">重新检测</NButton>
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
</template>
