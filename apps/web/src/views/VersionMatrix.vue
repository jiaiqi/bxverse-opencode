<script setup lang="ts">
// VersionMatrix.vue —— 多项目跨工程版本矩阵视图（R31）
// 端到端 0 入侵：纯聚合展示，不改任何业务仓库

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { VersionMatrix, MatrixCell, MatrixColumn, MatrixProjectRow } from '@bxverse/shared'
import { api } from '../api'
import PageHeader from '../components/PageHeader.vue'
import StatCard from '../components/StatCard.vue'
import EmptyState from '../components/EmptyState.vue'
import LoadingState from '../components/LoadingState.vue'
import { useNow } from '../composables/useNow'
import { useGridRovingTabindex } from '../composables/useGridRovingTabindex'

const route = useRoute()
const router = useRouter()

// ============= 状态 =============
const matrix = ref<VersionMatrix | null>(null)
const loading = ref(true)
const loadError = ref<string | null>(null)
const now = useNow()
const search = ref<string>((route.query.q as string) ?? '')
const gridRef = ref<HTMLElement | null>(null)

// ============= 加载 =============
async function load() {
  loading.value = true
  loadError.value = null
  try {
    matrix.value = await api.matrix()
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

// URL ?q= 双向同步
watch(search, (v) => {
  const next: Record<string, string | (string | null)[] | null> = v
    ? ({ ...route.query, q: v } as Record<string, string | (string | null)[] | null>)
    : (() => {
        const out: Record<string, string | (string | null)[] | null> = {}
        for (const [k, val] of Object.entries(route.query)) {
          if (k !== 'q') out[k] = val as string | (string | null)[] | null
        }
        return out
      })()
  void router.replace({ query: next })
})

// 30s 自动刷新（document.hidden 暂停；恢复可见时立即拉一次）
let pollTimer: ReturnType<typeof setInterval> | null = null
function startPolling(): void {
  if (pollTimer) return
  pollTimer = setInterval(() => {
    if (typeof document !== 'undefined' && document.hidden) return
    void load()
  }, 30_000)
}
function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}
function onVisibility(): void {
  if (typeof document !== 'undefined' && !document.hidden) void load()
}

onMounted(() => {
  void load()
  startPolling()
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility)
  }
})
onBeforeUnmount(() => {
  stopPolling()
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', onVisibility)
  }
})

// ============= 计算 =============
const driftSet = computed(() => new Set(matrix.value?.driftColumns ?? []))

const filteredColumns = computed<MatrixColumn[]>(() => {
  if (!matrix.value) return []
  const q = search.value.trim().toLowerCase()
  if (!q) return matrix.value.columns
  return matrix.value.columns.filter(
    (c) => c.app.toLowerCase().includes(q) || c.name.toLowerCase().includes(q),
  )
})

const filteredProjects = computed<MatrixProjectRow[]>(() => {
  if (!matrix.value) return []
  const q = search.value.trim().toLowerCase()
  if (!q) return matrix.value.projects
  return matrix.value.projects.filter(
    (p) => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q),
  )
})

// 行 × 列 → cell 查表：projects[].cells 已是 Record<repoId, cell>，按 cell.app 对齐到列
const cellGrid = computed<(MatrixCell | null)[][]>(() => {
  if (!matrix.value) return []
  const cols = filteredColumns.value
  return filteredProjects.value.map((p) => {
    // 项目下 cell 按 col.app 查表
    const byApp = new Map<string, MatrixCell>()
    for (const cell of Object.values(p.cells)) {
      if (cell.app) byApp.set(cell.app, cell)
    }
    return cols.map((c) => byApp.get(c.app) ?? null)
  })
})

const flatItemCount = computed(() => {
  const rows = cellGrid.value
  if (rows.length === 0) return 0
  return rows.length * Math.max(1, rows[0]?.length ?? 0)
})

useGridRovingTabindex({
  gridRef,
  itemSelector: '[data-cell-idx]',
  itemCount: () => flatItemCount.value,
  colCount: () => Math.max(1, filteredColumns.value.length),
  loop: true,
})

function gridIdx(rIdx: number, cIdx: number): number {
  return rIdx * Math.max(1, filteredColumns.value.length) + cIdx
}

function cellLink(projectId: string, cell: MatrixCell | null): string | null {
  if (!cell?.repoId) return null
  return `/repo/${projectId}/${cell.repoId}`
}

// ============= 模板用辅助 =============
const relativeTime = computed(() => {
  if (!matrix.value) return ''
  const t = new Date(matrix.value.generatedAt).getTime()
  const diffSec = Math.floor((now.value.getTime() - t) / 1000)
  if (diffSec < 5) return '刚刚'
  if (diffSec < 60) return `${diffSec} 秒前`
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} 分钟前`
  return `${Math.floor(diffSec / 3600)} 小时前`
})

function cellLabel(project: MatrixProjectRow, col: MatrixColumn, cell: MatrixCell | null): string {
  const base = `${project.name} ${col.name}`
  if (!cell) return `${base} 未接入`
  return `${base} 版本 ${cell.version}${cell.changed ? ' 待发布' : ''}${cell.pollFailed ? ' 读取失败' : ''}`
}
</script>

<template>
  <div class="page-pad">
    <PageHeader title="版本矩阵" description="跨项目 × 跨工程版本对齐视图（0 入侵：纯聚合展示）">
      <div class="flex items-center gap-2 text-text-2 text-13px">
        <i aria-hidden="true" class="i-carbon-time" />
        <span>{{ relativeTime }}前</span>
        <button
          class="ml-2 w-7 h-7 flex items-center justify-center rounded-md border border-border text-text-2 hover:bg-surface-hover hover:text-text-1 transition-colors duration-fast focus-ring"
          :class="{ 'animate-spin': loading }"
          aria-label="刷新"
          @click="load()"
        >
          <i aria-hidden="true" class="i-carbon-renew" />
        </button>
      </div>
    </PageHeader>

    <div v-if="matrix" class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
      <StatCard
        icon="i-carbon-catalog"
        :value="matrix.totals.projects"
        label="项目"
        color="emerald"
      />
      <StatCard icon="i-carbon-cube" :value="matrix.totals.repos" label="工程" color="cyan" />
      <StatCard
        icon="i-carbon-git-commit"
        :value="matrix.totals.changed"
        label="待发布"
        :color="matrix.totals.changed > 0 ? 'emerald' : 'amber'"
      />
      <StatCard
        icon="i-carbon-warning-alt"
        :value="matrix.totals.driftColumns"
        label="跨项目不齐"
        :color="matrix.totals.driftColumns > 0 ? 'orange' : 'emerald'"
      />
    </div>

    <div class="flex items-center gap-3 mb-4">
      <div class="flex-1 max-w-md">
        <NInput
          v-model:value="search"
          placeholder="搜索项目或工程…"
          clearable
          :input-props="{ autocomplete: 'off', spellcheck: 'false' }"
        >
          <template #prefix>
            <i aria-hidden="true" class="i-carbon-search text-text-3" />
          </template>
        </NInput>
      </div>
      <span v-if="matrix" class="text-12px text-text-3">
        共 {{ matrix.totals.repos }} 工程 · {{ matrix.totals.projects }} 项目
        <span v-if="matrix.totals.driftColumns > 0" class="text-warn-500 ml-2"
          >· {{ matrix.totals.driftColumns }} 列跨项目不齐</span
        >
      </span>
    </div>

    <LoadingState v-if="loading && !matrix" block pad="loose" />

    <NAlert v-else-if="loadError" type="error" :show-icon="true" title="加载失败">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <span>{{ loadError }}</span>
        <NButton size="tiny" @click="load()">重试</NButton>
      </div>
    </NAlert>

    <EmptyState
      v-else-if="!matrix || matrix.projects.length === 0"
      icon="i-carbon-cube"
      title="还没有项目"
      description="新建项目并接入仓库后，矩阵视图会显示各项目下各工程的版本对齐情况"
    >
      <RouterLink to="/">
        <NButton type="primary">前往总览</NButton>
      </RouterLink>
    </EmptyState>

    <div
      v-else-if="filteredColumns.length > 0 && filteredProjects.length > 0"
      ref="gridRef"
      class="matrix-wrap"
      role="grid"
      aria-label="项目 × 工程版本矩阵"
    >
      <table class="matrix-table">
        <thead>
          <tr>
            <th class="sticky-col th-project">项目</th>
            <th
              v-for="col in filteredColumns"
              :key="col.app"
              class="th-col"
              :class="{ 'th-drift': driftSet.has(col.app) }"
            >
              <div class="th-col-inner">
                <span class="th-col-name">{{ col.name }}</span>
                <span v-if="col.occurrences > 1" class="th-col-chip"
                  >{{ col.occurrences }} 项目</span
                >
                <i
                  v-if="driftSet.has(col.app)"
                  aria-hidden="true"
                  class="i-carbon-warning-alt text-warn-500 text-11px"
                  title="跨项目版本不齐"
                />
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(project, rIdx) in filteredProjects" :key="project.id">
            <th scope="row" class="sticky-col th-project">
              <div class="flex flex-col">
                <RouterLink
                  :to="`/project/${project.id}`"
                  class="font-medium text-text-1 hover:text-brand-500 transition-colors duration-fast"
                >
                  {{ project.name }}
                </RouterLink>
                <span class="text-11px text-text-3 mt-0.5">v{{ project.version }}</span>
              </div>
            </th>
            <td
              v-for="(cell, cIdx) in cellGrid[rIdx]"
              :key="`${project.id}-${filteredColumns[cIdx]?.app ?? cIdx}`"
              class="td-cell"
              :class="{
                'td-changed': cell?.changed,
                'td-pollfailed': cell?.pollFailed,
                'td-absent': !cell,
              }"
              :data-cell-idx="gridIdx(rIdx, cIdx)"
              role="gridcell"
              :aria-label="cellLabel(project, filteredColumns[cIdx]!, cell)"
            >
              <NPopover v-if="cell" trigger="hover" placement="top" :show-arrow="true">
                <template #trigger>
                  <RouterLink
                    v-if="cellLink(project.id, cell)"
                    :to="cellLink(project.id, cell)!"
                    class="cell-link"
                  >
                    <div class="cell-version">
                      <code class="font-mono">{{ cell.version }}</code>
                      <i
                        v-if="cell.changed"
                        aria-hidden="true"
                        class="i-carbon-warning-alt text-warn-500 text-11px"
                        :title="`待发布 ${cell.commits} 提交`"
                      />
                      <i
                        v-else-if="cell.lastRelease"
                        aria-hidden="true"
                        class="i-carbon-checkmark-filled text-success-500 text-11px"
                        :title="`最近发布 ${cell.lastRelease.date}`"
                      />
                    </div>
                  </RouterLink>
                  <div v-else class="cell-version">
                    <code class="font-mono text-text-3">{{ cell.version }}</code>
                  </div>
                </template>
                <div class="popover-body">
                  <div class="font-medium text-text-1 mb-1">
                    {{ project.name }} · {{ cell.name ?? cell.app }}
                  </div>
                  <div class="text-12px text-text-2 space-y-0.5">
                    <div>
                      版本：<code class="font-mono">{{ cell.version }}</code>
                    </div>
                    <div v-if="cell.lastRelease">
                      最近发布：v{{ cell.lastRelease.version }} · {{ cell.lastRelease.date }} ·
                      {{ cell.lastRelease.daysAgo }} 天前
                    </div>
                    <div v-else>最近发布：无</div>
                    <div v-if="cell.changed">待发布：{{ cell.commits }} 提交</div>
                    <div v-if="cell.repoKind">
                      工程化：{{ cell.repoKind === 'nodejs' ? 'Node.js' : '静态' }}
                    </div>
                    <div v-if="cell.pollFailed" class="text-warn-500">⚠ 读取失败</div>
                  </div>
                </div>
              </NPopover>
              <div v-else class="cell-version text-text-3" aria-hidden="true">
                <i class="i-carbon-minus text-12px" />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <EmptyState
      v-else
      icon="i-carbon-search"
      title="无匹配项"
      :description="`没有工程或项目匹配「${search}」`"
    />

    <div class="matrix-foot text-12px text-text-3 mt-3 px-2">
      <i aria-hidden="true" class="i-carbon-information align-text-top mr-1" />
      0 入侵说明：纯聚合展示，只读
      <code>RepoStatus</code> + 数据仓库索引（<code>{full:false, limit:1}</code> 快速路径），
      不改任何业务仓库、不打标签、不写数据仓库。
    </div>
  </div>
</template>

<style scoped>
.matrix-wrap {
  overflow: auto;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
  background: var(--surface, #fff);
}
.matrix-table {
  border-collapse: separate;
  border-spacing: 0;
  min-width: 100%;
  table-layout: auto;
}
.matrix-table th,
.matrix-table td {
  padding: 8px 10px;
  font-size: 13px;
  border-bottom: 1px solid var(--border, #e5e7eb);
  text-align: left;
  white-space: nowrap;
}
.matrix-table thead th {
  position: sticky;
  top: 0;
  background: var(--surface-2, #f7f8fa);
  z-index: 2;
  font-weight: 600;
  color: var(--text-2, #4b5563);
}
.sticky-col {
  position: sticky;
  left: 0;
  background: var(--surface, #fff);
  z-index: 1;
  border-right: 1px solid var(--border, #e5e7eb);
}
.matrix-table thead .sticky-col {
  z-index: 3;
  background: var(--surface-2, #f7f8fa);
}
.th-col {
  min-width: 140px;
  text-align: center;
  vertical-align: middle;
}
.th-drift {
  border-left: 2px solid var(--warn-500, #f59e0b);
  border-right: 2px solid var(--warn-500, #f59e0b);
  background: color-mix(in srgb, var(--warn-500, #f59e0b) 8%, var(--surface-2, #f7f8fa));
}
.th-col-inner {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.th-col-name {
  font-weight: 600;
}
.th-col-chip {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  background: var(--brand-500);
  color: var(--on-brand, #fff);
  font-weight: 500;
}
.td-cell {
  vertical-align: middle;
  text-align: center;
}
.td-cell.td-changed {
  background: color-mix(in srgb, var(--brand-500) 6%, transparent);
}
.td-cell.td-pollfailed {
  background: color-mix(in srgb, var(--warn-500) 8%, transparent);
}
.td-cell.td-absent {
  background: var(--surface-2, #f7f8fa);
  opacity: 0.6;
}
.cell-link {
  display: block;
  padding: 4px 6px;
  border-radius: 4px;
  text-decoration: none;
  color: inherit;
  transition: background-color 150ms;
}
.cell-link:hover {
  background: var(--surface-hover, #f1f3f5);
}
.cell-version {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}
.popover-body {
  max-width: 280px;
  font-size: 12px;
}
.matrix-foot {
  line-height: 1.6;
}
.matrix-foot code {
  background: var(--surface-2, #f7f8fa);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 11px;
}
</style>
