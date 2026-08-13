<script setup lang="ts">
// ProjectCard.vue —— 项目卡片

import type { OverviewData } from '@bxverse/shared'

const props = defineProps<{
  project: OverviewData['projects'][number]
}>()

const emit = defineEmits<{ open: [id: string]; release: [id: string] }>()
</script>

<template>
  <div class="card card-pad card-hover group" @click="emit('open', project.id)">
    <div class="flex items-start justify-between gap-2">
      <div class="flex items-center gap-2 min-w-0">
        <i class="i-carbon-catalog text-18px text-brand-500 shrink-0" />
        <span class="font-semibold text-text-1 truncate">{{ project.name }}</span>
        <span class="chip code-text shrink-0">{{ project.version }}</span>
      </div>
      <button
        v-if="project.changedRepoCount > 0"
        class="opacity-0 group-hover:opacity-100 transition-opacity duration-150 w-7 h-7 flex items-center justify-center rounded-md text-brand-500 hover:bg-brand-soft"
        title="发起发布"
        @click.stop="emit('release', project.id)"
      >
        <i class="i-carbon-rocket text-16px" />
      </button>
    </div>
    <div class="flex items-center gap-4 mt-4 text-sm">
      <div class="flex items-center gap-1.5 text-text-2">
        <i class="i-carbon-cube text-14px text-text-3" />
        {{ project.repoCount }} 仓库
      </div>
      <div
        class="flex items-center gap-1.5"
        :class="project.changedRepoCount > 0 ? 'text-brand-600 font-medium' : 'text-text-3'"
      >
        <i class="i-carbon-git-commit text-14px" />
        {{ project.changedRepoCount }} 待发布
      </div>
    </div>
    <div class="mt-4 pt-3 border-t border-border text-xs text-text-3 flex items-center gap-1.5">
      <i class="i-carbon-version text-13px" />
      <template v-if="project.lastRelease">
        上次发布 <span class="code-text">{{ project.lastRelease.version }}</span> · {{ project.lastRelease.date }}
      </template>
      <template v-else>暂无发布</template>
    </div>
  </div>
</template>
