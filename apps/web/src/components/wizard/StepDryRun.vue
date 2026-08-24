<script setup lang="ts">
import type { ProjectDef, RepoStatus } from '@bxverse/shared'
import { usePublishStore } from '../../stores/publish'

const props = defineProps<{
  project: ProjectDef | undefined
  statuses: Map<string, RepoStatus | null>
}>()
const store = usePublishStore()

const dryRunLines = computed(() => {
  const plan = store.plan
  if (!plan) return []
  const lines: { repo: string; text: string; dimmed?: boolean }[] = []
  for (const r of plan.changed) {
    lines.push({ repo: r.name, text: `[预检] 检查 HEAD / dirty / 里程碑标签` })
    if (r.buildCommand) {
      lines.push({ repo: r.name, text: `[$] ${r.buildCommand}`, dimmed: store.skipBuild })
    }
    lines.push({ repo: r.name, text: `git tag ${plan.milestoneTag}` })
    const tag = plan.tags.find(t => t.repoId === r.repoId)
    lines.push({ repo: r.name, text: `git tag ${tag?.tag ?? ''}` })
    const repo = props.project?.repos.find(x => x.id === r.repoId)
    if (store.backupSource) {
      lines.push({ repo: r.name, text: `[备份] git bundle（全部历史与标签）+ git archive 快照（遵循 .gitignore）` })
    }
    if (store.backupArtifacts) {
      if (repo?.artifactDir) {
        lines.push({ repo: r.name, text: `[备份] 产物归档 ${repo.artifactDir}/ → artifact.tar.gz + 哈希清单` })
      } else {
        lines.push({ repo: r.name, text: `[备份] 产物备份跳过（未配置产物目录）`, dimmed: true })
      }
    }
    lines.push({ repo: r.name, text: `写入 version.json / version-history.json` })
    lines.push({ repo: r.name, text: `更新检测基准 → ${r.to?.slice(0, 7) ?? ''}` })
  }
  for (const s of plan.syncedOnly) {
    lines.push({ repo: s.name, text: `[同步基版] 仅更新 version.json → ${plan.projectVersion}` })
  }
  lines.push({ repo: '（项目）', text: `写发布记录 → releases/${plan.projectVersion}/data.json + 双轨日志` })
  lines.push({ repo: '（数据仓库）', text: `里程碑标签 ${plan.milestoneTag} + commit`, dimmed: false })
  lines.push({ repo: '（远程）', text: store.offline ? '离线模式：跳过推送' : '推送标签与数据仓库（失败仅警告）' })
  return lines
})

const selectedHasRemote = computed(() => {
  if (!props.project) return false
  return store.selectedRepoIds.some((id) => {
    const s = props.statuses.get(id)
    if (s) return s.hasRemote
    return props.project?.repos.find(r => r.id === id)?.remote != null
  })
})
</script>

<template>
  <div>
    <NAlert v-if="store.offline && selectedHasRemote" type="info" :show-icon="true" class="mb-4">
      当前为<strong>离线发布</strong>：本次不会推送标签到远程仓库与数据仓库。如需推送，请关闭「离线发布」开关。
    </NAlert>
    <div class="flex items-center gap-6 mb-4 flex-wrap">
      <div class="flex items-center gap-2">
        <NSwitch v-model:value="store.offline" />
        <span class="text-sm text-text-2">离线发布（跳过远程推送）</span>
      </div>
      <div class="flex items-center gap-2">
        <NSwitch v-model:value="store.skipBuild" />
        <span class="text-sm text-text-2">跳过构建命令</span>
      </div>
      <div class="flex items-center gap-2">
        <NSwitch v-model:value="store.backupSource" />
        <span class="text-sm text-text-2">源码备份</span>
      </div>
      <div class="flex items-center gap-2">
        <NSwitch v-model:value="store.backupArtifacts" />
        <span class="text-sm text-text-2">产物备份</span>
      </div>
    </div>
    <div class="console-wrap space-y-1">
      <div v-for="(l, i) in dryRunLines" :key="i" class="log-line flex gap-2" :class="{ 'opacity-40': l.dimmed }">
        <span class="shrink-0 code-text text-xs w-24 text-text-3 truncate">{{ l.repo }}</span>
        <span class="flex-1 break-all">{{ l.text }}</span>
      </div>
    </div>
    <div v-if="!store.bothConfirmed" class="mt-4">
      <NAlert type="warning" :show-icon="true">
        对内/对外日志需全部「确认」后才可执行发布（步骤 3 中操作）。
      </NAlert>
    </div>
  </div>
</template>
