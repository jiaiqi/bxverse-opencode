<script setup lang="ts">
// RepoCard.vue —— 仓库卡片（整卡为 RouterLink 真链接，目标由父级以 to 传入）
// 扩展：M8 治理中枢——设置菜单（编辑 displayName/buildCommand/artifactDir、移除仓库）

import type { RepoDef, RepoStatus } from '@bxverse/shared'
import { NDropdown, useDialog, useMessage } from 'naive-ui'
import StatusBadge from './StatusBadge.vue'
import { useProjectsStore } from '../stores/projects'
import { useRouter } from 'vue-router'

const props = defineProps<{
  to: string
  repo: RepoDef
  status?: RepoStatus | null
  loading?: boolean
}>()

const emit = defineEmits<{ refresh: [] }>()

const dialog = useDialog()
const message = useMessage()
const projectsStore = useProjectsStore()
const router = useRouter()

const manageOptions = [
  { label: '刷新状态', key: 'refresh' },
  { label: '打开 Git 工作站', key: 'git' },
  { type: 'divider' as const, key: 'd1' },
  { label: '编辑仓库设置…', key: 'edit' },
  { type: 'divider' as const, key: 'd2' },
  { label: '从项目移除', key: 'remove' },
]

async function onManage(key: string | number) {
  if (key === 'refresh') {
    emit('refresh')
    return
  }
  if (key === 'git') {
    await router.push(props.to)
    return
  }
  if (key === 'remove') {
    const ownerId =
      projectsStore.items.find((p) => p.repos.some((r) => r.id === props.repo.id))?.id ?? ''
    dialog.warning({
      title: '移除仓库',
      content: `确定将「${props.repo.displayName || props.repo.name}」从当前项目移除？\n仅移除管理定义，不会删除本地代码（不勾选 purge）。`,
      positiveText: '移除',
      negativeText: '取消',
      onPositiveClick: async () => {
        try {
          await projectsStore.removeRepo(ownerId, props.repo.id)
          message.success('仓库已从项目移除')
        } catch (e) {
          message.error((e as Error).message)
        }
      },
    })
    return
  }
}
</script>

<template>
  <RouterLink
    :to="to"
    class="p-4.5 rounded-xl border border-border bg-surface hover:border-border-strong transition-[border-color,box-shadow,background-color,transform] duration-base flex flex-col justify-between group shadow-sm hover:shadow-md focus-ring"
  >
    <template v-if="loading">
      <div class="skeleton h-5 w-2/3 mb-3" />
      <div class="skeleton h-4 w-1/2" />
    </template>
    <template v-else>
      <div>
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span
                class="font-bold text-sm text-text-1 group-hover:text-brand-500 transition-colors"
              >
                {{ repo.displayName || repo.name }}
              </span>
              <span v-if="repo.displayName" class="text-xs text-text-3 font-mono"
                >({{ repo.name }})</span
              >
              <StatusBadge v-if="status?.changed" type="changed" :count="status.commits.length" />
              <StatusBadge v-if="status && status.dirty > 0" type="dirty" :count="status.dirty" />
            </div>
            <div class="text-[11px] font-mono text-text-3 truncate mt-1" :title="repo.path">
              {{ repo.path }}
            </div>
          </div>

          <button
            class="p-1 rounded-md text-text-3 hover:bg-surface-hover hover:text-brand-500 transition-colors cursor-pointer bg-transparent border-0 shrink-0 focus-ring"
            aria-label="刷新仓库状态"
            title="重新检测仓库状态"
            @click.stop="emit('refresh')"
          >
            <i aria-hidden="true" class="i-carbon-renew text-14px" />
          </button>
          <!-- M8 治理中枢：设置菜单（编辑/移除）—— 整卡是 RouterLink，所有交互 .stop 防误导航 -->
          <NDropdown trigger="click" :options="manageOptions" @select="onManage" @click.stop>
            <button
              class="p-1 rounded-md text-text-3 hover:bg-surface-hover hover:text-brand-500 transition-colors cursor-pointer bg-transparent border-0 shrink-0 focus-ring"
              aria-label="仓库设置"
              title="仓库设置（编辑/移除）"
              @click.stop
            >
              <i aria-hidden="true" class="i-carbon-overflow-menu-horizontal text-14px" />
            </button>
          </NDropdown>
        </div>

        <!-- 指标格 -->
        <div
          class="grid grid-cols-2 gap-2 text-[11px] font-mono bg-surface-alt p-2 rounded-lg border border-border mt-3"
        >
          <div>
            <div class="text-[10px] text-text-3">当前版本</div>
            <div class="text-text-1 font-bold truncate">
              {{ status?.versionFile?.version ?? '未生成' }}
            </div>
          </div>
          <div>
            <div class="text-[10px] text-text-3">分支 / HEAD</div>
            <div
              class="truncate"
              :class="
                status?.branch && status.branch !== 'master' && status.branch !== 'main'
                  ? 'text-warning font-bold'
                  : 'text-text-2'
              "
            >
              {{ status?.branch ?? '?' }} @ {{ status?.head ? status.head.slice(0, 6) : '—' }}
            </div>
          </div>
        </div>
      </div>

      <!-- 底部操作栏 -->
      <div
        class="mt-3 pt-2.5 border-t border-border flex items-center justify-between text-xs font-mono"
      >
        <div class="flex items-center gap-2 text-text-3 truncate text-[11px]">
          <span
            v-if="repo.buildCommand"
            class="truncate code-text"
            :title="'构建: ' + repo.buildCommand"
          >
            构建: {{ repo.buildCommand }}
          </span>
          <span v-if="repo.artifactDir" class="truncate" :title="'产物目录: ' + repo.artifactDir">
            产物: {{ repo.artifactDir }}
          </span>
          <span v-else-if="!repo.buildCommand">未配置构建</span>
        </div>

        <span
          class="text-brand-500 group-hover:underline text-xs flex items-center gap-1 font-medium"
        >
          <i aria-hidden="true" class="i-carbon-terminal text-12px" /> Git 工作站
        </span>
      </div>
    </template>
  </RouterLink>
</template>
