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
  <div class="card card-pad card-hover group" @click="emit('open')">
    <template v-if="loading">
      <div class="skeleton h-5 w-2/3 mb-3" />
      <div class="skeleton h-4 w-1/2" />
    </template>
    <template v-else>
      <div class="flex items-start justify-between gap-2">
        <div class="flex items-center gap-2 min-w-0">
          <i aria-hidden="true" class="i-carbon-git-branch text-18px text-brand-500 shrink-0" />
          <span class="font-semibold text-text-1 truncate">{{ repo.name }}</span>
          <StatusBadge v-if="status?.changed" type="changed" :count="status.commits.length" />
          <StatusBadge v-if="status && status.dirty > 0" type="dirty" :count="status.dirty" />
          <StatusBadge v-if="status && !status.hasRemote" type="local" />
        </div>
        <button
          class="opacity-0 group-hover:opacity-100 transition-opacity duration-150 w-7 h-7 flex items-center justify-center rounded-md text-text-3 hover:bg-surface-hover hover:text-brand-500"
          aria-label="重新检测仓库状态"
          @click.stop="emit('refresh')"
        >
          <i aria-hidden="true" class="i-carbon-renew text-14px" />
        </button>
      </div>
      <div class="mt-3 flex items-center gap-2 text-xs text-text-3 flex-wrap">
        <span class="chip">
          <i aria-hidden="true" class="i-carbon-git-branch" /> {{ status?.branch ?? '?' }}
        </span>
        <span v-if="status" class="chip code-text">{{ status.head.slice(0, 7) }}</span>
        <span v-if="status?.versionFile" class="chip code-text text-brand-600 border-brand-200 bg-brand-50">
          {{ status.versionFile.version }}
        </span>
        <span v-else class="chip">未生成版本</span>
      </div>
      <div class="mt-3 pt-3 border-t border-border flex items-center gap-3 text-xs text-text-3">
        <span v-if="repo.buildCommand" class="flex items-center gap-1" :title="repo.buildCommand">
          <i aria-hidden="true" class="i-carbon-terminal text-13px" />
          <span class="code-text truncate max-w-40">{{ repo.buildCommand }}</span>
        </span>
        <span class="truncate flex-1" :title="repo.path">{{ repo.path }}</span>
      </div>
    </template>
  </div>
</template>
