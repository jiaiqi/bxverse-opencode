<script setup lang="ts">
// ProjectCard.vue —— 项目卡片（整卡为 RouterLink 真链接：支持中键/新标签打开）

import type { OverviewData } from '@bxverse/shared'

defineProps<{
  project: OverviewData['projects'][number]
}>()

const emit = defineEmits<{ release: [id: string] }>()

/** 扩展：M8 看板——lastRelease.daysAgo 转可读相对时间（Intl.RelativeTimeFormat 不可用时的回退） */
function relTime(days: number): string {
  if (days <= 0) return '今天'
  if (days === 1) return '昨天'
  if (days < 7) return `${days} 天前`
  if (days < 30) return `${Math.floor(days / 7)} 周前`
  if (days < 365) return `${Math.floor(days / 30)} 月前`
  return `${Math.floor(days / 365)} 年前`
}
</script>

<template>
  <RouterLink
    :to="`/project/${project.id}`"
    class="p-5 rounded-2xl border border-border bg-surface hover:border-border-strong transition-[border-color,box-shadow,background-color,transform] duration-base ease-spring hover:-translate-y-1 flex flex-col justify-between group shadow-sm hover:shadow-md focus-ring"
  >
    <div>
      <!-- 顶部：项目名称与版本号 -->
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-center gap-2.5 min-w-0">
          <div
            class="w-8 h-8 rounded-lg bg-brand-soft text-brand-500 flex items-center justify-center font-bold text-xs shrink-0 border border-brand-200"
          >
            {{ project.name.slice(0, 1) }}
          </div>
          <div class="min-w-0">
            <div
              class="font-bold text-sm text-text-1 group-hover:text-brand-500 transition-colors truncate"
            >
              {{ project.name }}
            </div>
            <div class="text-[11px] font-mono text-text-3 mt-0.5">
              {{ project.repoCount }} 个关联工程
            </div>
          </div>
        </div>
        <span
          class="font-mono text-xs font-bold px-2 py-0.5 rounded bg-surface-alt border border-border text-info shrink-0"
        >
          {{ project.version }}
        </span>
      </div>

      <!-- 中部：状态读数 -->
      <div
        class="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs font-mono"
      >
        <div class="flex items-center gap-1.5 text-text-2">
          <i aria-hidden="true" class="i-carbon-cube text-13px text-text-3" />
          <span>{{ project.repoCount }} 仓库</span>
        </div>
        <div
          class="flex items-center gap-1.5 font-semibold"
          :class="project.changedRepoCount > 0 ? 'text-warning' : 'text-success'"
        >
          <span
            class="w-1.5 h-1.5 rounded-full"
            :class="project.changedRepoCount > 0 ? 'bg-warning animate-pulse' : 'bg-success'"
          />
          <span>{{
            project.changedRepoCount > 0 ? `+${project.changedRepoCount} 待发变动` : '全部已就绪'
          }}</span>
        </div>
      </div>
    </div>

    <!-- 底部：发布信息与操作栏 -->
    <div
      class="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs font-mono"
    >
      <div
        class="text-[11px] text-text-3 truncate max-w-[170px]"
        :title="
          project.lastRelease
            ? `${project.lastRelease.date} 发布 ${project.lastRelease.version}`
            : ''
        "
      >
        <template v-if="project.lastRelease">
          上次
          <span class="text-text-2">{{ project.lastRelease.version }}</span>
          · <span class="text-text-3">{{ relTime(project.lastRelease.daysAgo) }}</span>
        </template>
        <template v-else>暂无发版记录</template>
      </div>
      <!-- 扩展：M8 看板——脏仓库标记（与 changed 区分，工作区未提交） -->
      <div
        v-if="project.dirtyRepoCount > 0"
        class="flex items-center gap-1 text-[10px] text-warning mr-1"
        :title="`${project.dirtyRepoCount} 个仓库工作区有未提交改动`"
      >
        <i aria-hidden="true" class="i-carbon-document-unknown text-12px" />
        <span>{{ project.dirtyRepoCount }} 脏</span>
      </div>

      <div class="flex items-center gap-1.5">
        <NButton
          size="tiny"
          type="primary"
          secondary
          @click.stop.prevent="emit('release', project.id)"
        >
          <template #icon><i aria-hidden="true" class="i-carbon-rocket" /></template>
          发版
        </NButton>
      </div>
    </div>
  </RouterLink>
</template>
