<script setup lang="ts">
import type { ProjectDef } from '@bxverse/shared'
import { usePublishStore } from '../../stores/publish'
import StatusBadge from '../StatusBadge.vue'
import { useDialog } from 'naive-ui'

const props = defineProps<{ project: ProjectDef | undefined }>()
const store = usePublishStore()
const dialog = useDialog()

const bumpOptions = [
  { label: '自动', value: 'auto' },
  { label: '补丁 patch', value: 'patch' },
  { label: '次版本 minor', value: 'minor' },
  { label: '重大 major', value: 'major' },
]

function setBump(v: string) {
  store.bumpOverride = v as 'auto' | 'major' | 'minor' | 'patch'
  if (store.step >= 2) void rePlan()
}

async function rePlan(confirmReset = false): Promise<void> {
  const edited = store.logs.internal.state !== 'auto' || store.logs.external.state !== 'auto'
  if (edited && !confirmReset) {
    dialog.warning({
      title: '重新生成计划',
      content: '重新生成计划会重置两侧日志为自动草稿（你的人工编辑将丢失）。确定继续？',
      positiveText: '重新生成',
      negativeText: '取消',
      onPositiveClick: () => void rePlan(true),
    })
    return
  }
  if (confirmReset || edited === false) {
    store.logs.internal.state = 'auto'
    store.logs.external.state = 'auto'
    store.logs.internal.content = ''
    store.logs.external.content = ''
  }
  await store.loadPlan()
}

const bumpLabel = (b: string): string =>
  b === 'major' ? '重大' : b === 'minor' ? '次版本' : b === 'patch' ? '补丁' : '自动'
</script>

<template>
  <div>
    <div v-if="store.planning || !store.plan" class="py-10 text-center text-text-3">
      <NSpin size="small" />
      <div class="mt-2 text-sm">正在计算发布计划…</div>
    </div>
    <template v-else>
      <div class="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div class="stat-label mb-1">项目版本</div>
          <div class="flex items-center gap-3">
            <span class="code-text text-text-3 line-through">{{ project?.version }}</span>
            <i aria-hidden="true" class="i-carbon-arrow-right text-text-3" />
            <span class="stat-value text-brand-500">{{ store.plan.projectVersion }}</span>
            <StatusBadge type="bump" :bump="store.plan.bump" />
            <span v-if="store.plan.suggestedBump !== store.plan.bump" class="chip text-text-3">
              建议：{{ bumpLabel(store.plan.suggestedBump) }}
            </span>
          </div>
          <div class="text-xs text-text-3 mt-1">
            build {{ store.plan.buildStamp }} · 里程碑标签 <span class="code-text">{{ store.plan.milestoneTag }}</span>
          </div>
        </div>
        <NSelect v-model:value="store.bumpOverride" :options="bumpOptions" class="w-44" @update:value="setBump" />
      </div>

      <div class="mt-6">
        <div class="section-title text-base mb-3">参与发布的仓库（{{ store.plan.changed.length }}）</div>
        <div class="card border divide-y divide-border overflow-hidden">
          <div v-for="r in store.plan.changed" :key="r.repoId" class="px-4 py-3 flex items-center gap-3 flex-wrap">
            <i aria-hidden="true" class="i-carbon-git-branch text-brand-500" />
            <span class="font-medium text-text-1 text-sm min-w-30">{{ r.name }}</span>
            <span class="code-text text-xs text-text-3">{{ r.from?.slice(0, 7) ?? '首次' }} → {{ r.to?.slice(0, 7) }}</span>
            <span class="version-badge"><span class="tick"></span>{{ r.version }}</span>
            <span class="chip">{{ r.commits.length }} 提交</span>
          </div>
        </div>
      </div>

      <div v-if="store.plan.syncedOnly.length" class="mt-4">
        <NCollapse>
          <NCollapseItem :title="`仅同步基版 version.json（${store.plan.syncedOnly.length} 个未变动仓库）`" name="sync">
            <div class="text-sm text-text-2 space-y-1">
              <div v-for="s in store.plan.syncedOnly" :key="s.repoId" class="flex items-center gap-2">
                <i aria-hidden="true" class="i-carbon-renew text-text-3" />
                <span>{{ s.name }}</span>
                <span class="code-text text-xs text-text-3">→ {{ store.plan.projectVersion }}（无标签无记录）</span>
              </div>
            </div>
          </NCollapseItem>
        </NCollapse>
      </div>

      <div v-if="store.plan.warnings.length" class="mt-4 space-y-2">
        <NAlert v-for="(w, i) in store.plan.warnings" :key="i" type="warning" :show-icon="true">
          {{ w }}
        </NAlert>
      </div>
    </template>
  </div>
</template>
