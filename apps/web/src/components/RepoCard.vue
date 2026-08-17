<script setup lang="ts">
// RepoCard.vue —— 仓库卡片

import type { RepoDef, RepoStatus } from '@bxverse/shared'
import StatusBadge from './StatusBadge.vue'

const props = withDefaults(defineProps<{
  repo: RepoDef
  status?: RepoStatus | null
  loading?: boolean
}>(), {
  status: null,
  loading: false,
})

const emit = defineEmits<{ open: []; refresh: [] }>()
</script>

<template>
  <div
    class="p-4.5 rounded-xl border border-border bg-surface hover:border-border-strong transition-all duration-200 flex flex-col justify-between group shadow-sm hover:shadow-md cursor-pointer"
    role="link"
    tabindex="0"
    @click="emit('open')"
    @keydown.enter.self="emit('open')"
    @keydown.space.self.prevent="emit('open')"
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
              <span class="font-bold text-sm text-text-1 group-hover:text-brand-500 transition-colors">
                {{ repo.displayName || repo.name }}
              </span>
              <span v-if="repo.displayName" class="text-xs text-text-3 font-mono">({{ repo.name }})</span>
              <StatusBadge v-if="status?.changed" type="changed" :count="status.commits.length" />
              <StatusBadge v-if="status && status.dirty > 0" type="dirty" :count="status.dirty" />
            </div>
            <div class="text-[11px] font-mono text-text-3 truncate mt-1" :title="repo.path">
              {{ repo.path }}
            </div>
          </div>

          <button
            class="p-1 rounded-md text-text-3 hover:bg-surface-hover hover:text-brand-500 transition-colors cursor-pointer bg-transparent border-0 shrink-0"
            aria-label="刷新仓库状态"
            title="重新检测仓库状态"
            @click.stop="emit('refresh')"
          >
            <i aria-hidden="true" class="i-carbon-renew text-14px" />
          </button>
        </div>

        <!-- 指标格 -->
        <div class="grid grid-cols-2 gap-2 text-[11px] font-mono bg-surface-alt p-2 rounded-lg border border-border mt-3">
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
              :class="status?.branch && status.branch !== 'master' && status.branch !== 'main' ? 'text-warning font-bold' : 'text-text-2'"
            >
              {{ status?.branch ?? '?' }} @ {{ status?.head ? status.head.slice(0, 6) : '—' }}
            </div>
          </div>
        </div>
      </div>

      <!-- 底部操作栏 -->
      <div class="mt-3 pt-2.5 border-t border-border flex items-center justify-between text-xs font-mono">
        <div class="flex items-center gap-2 text-text-3 truncate text-[11px]">
          <span v-if="repo.artifactDir" class="truncate" :title="'产物目录: ' + repo.artifactDir">
            产物: {{ repo.artifactDir }}
          </span>
          <span v-else>产物: dist</span>
        </div>

        <span class="text-brand-500 group-hover:underline text-xs flex items-center gap-1 font-medium">
          <i aria-hidden="true" class="i-carbon-terminal text-12px" /> Git 工作站
        </span>
      </div>
    </template>
  </div>
</template>
