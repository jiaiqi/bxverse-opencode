<script setup lang="ts">
// FailureRecoveryCard.vue —— M11 发布失败结构化恢复（UI）
// 失败头卡：TAG_CONFLICT 等错误码 chip + 失败仓计数
// 展开「结构化诊断」面板：head/target/tag/tagSource + 恢复建议
// 三出路按钮：改用下一版本号重试失败仓库 / 接管并续跑 / 回滚本次副作用（写 R24 审计）
// 诊断包导出：真实 Blob 下载 JSON（allReports + console + projectId/taskId）

import type { FailedRepoReport } from '@bxverse/shared'
import { NCollapseTransition, useMessage } from 'naive-ui'
import { api } from '../api'
import { useProjectsStore } from '../stores/projects'

const props = defineProps<{
  projectId: string
  taskId: string | null
  failedReports: FailedRepoReport[]
  version: string
}>()

const emit = defineEmits<{
  'retry-bump': []
  resume: []
  rollback: []
}>()

const message = useMessage()
const projectsStore = useProjectsStore()

const diagOpen = ref(false)
const rollingBack = ref(false)
const exporting = ref(false)

function repoName(repoId: string): string {
  const p = projectsStore.items.find((x) => x.id === props.projectId)
  return p?.repos.find((r) => r.id === repoId)?.displayName || p?.repos.find((r) => r.id === repoId)?.name || repoId
}

/** 错误码 → 严重度 chip color（前端读 code 决定视觉层级） */
function codeTone(code: string): 'error' | 'warning' | 'info' {
  if (code === 'TAG_CONFLICT' || code === 'TAG_EXISTS_DIFFERENT') return 'error'
  if (code === 'BASE_UNREACHABLE' || code === 'PREFLIGHT_FAILED') return 'warning'
  return 'info'
}

/** 失败回滚（仅改 bxverse 自产，写 R24 审计） */
async function doRollback() {
  if (!props.taskId) return message.warning('缺少 taskId，无法回滚')
  rollingBack.value = true
  try {
    const r = await api.publishRollback(props.taskId, { repoIds: props.failedReports.map((x) => x.repoId) })
    message.success(
      `已回滚 · 删除 build 标签 ${r.deletedBuildTags.length} 个 / 标 deprecate release ${r.deprecatedReleases.length} 个 / 删里程碑 ${r.deletedMilestoneTags.length} 个`,
    )
    if (r.warnings.length) message.warning(r.warnings.join('；'))
    emit('rollback')
  } catch (e) {
    message.error((e as Error).message)
  } finally {
    rollingBack.value = false
  }
}

/** 诊断包导出：真实 Blob 下载 */
async function exportDiag() {
  exporting.value = true
  try {
    const bundle = {
      generatedAt: new Date().toISOString(),
      kind: 'bxverse-diagnostic-bundle',
      release: { version: props.version, taskId: props.taskId, projectId: props.projectId },
      failures: props.failedReports.map((f) => ({ ...f, repoName: repoName(f.repoId) })),
      suggestions: 'paths: (1) 改用下一版本号重试失败仓库（bump 提一档 / patch）— 幂等仅补跑失败仓；(2) 接管 interrupted journal 续跑；(3) 回滚本次副作用（仅删 bxverse 自产 + 写 R24 审计）',
    }
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `diagnostic-bundle-${props.taskId ?? 'release'}.json`
    a.click()
    URL.revokeObjectURL(url)
    message.success('诊断包已下载（JSON）')
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <div class="rounded-2xl border border-danger bg-danger-soft/30 p-5 text-left">
    <!-- 失败头卡：错误码 + 失败仓数 + 展开诊断 -->
    <div class="flex items-center gap-2 flex-wrap">
      <i aria-hidden="true" class="i-carbon-warning-alt text-danger text-18px" />
      <span class="font-semibold text-text-1">发布失败</span>
      <span class="text-sm text-text-2">
        {{ failedReports.length }} 个仓库未能完成 · 其余仓库已隔离完成
      </span>
      <button
        class="ml-auto text-xs text-info hover:underline"
        @click="diagOpen = !diagOpen"
        :aria-expanded="diagOpen"
      >
        {{ diagOpen ? '收起诊断' : '结构化诊断（doctor 内核 · 只读）' }}
      </button>
    </div>

    <!-- 错误码 chip 列表 -->
    <div class="mt-3 flex items-center gap-2 flex-wrap">
      <NTag
        v-for="f in failedReports"
        :key="f.repoId"
        :type="codeTone(f.code)"
        size="small"
        :bordered="false"
      >
        {{ f.code }} · {{ repoName(f.repoId) }}
      </NTag>
    </div>

    <!-- 结构化诊断面板 -->
    <NCollapseTransition :show="diagOpen">
      <div class="mt-4 rounded-xl border border-border bg-surface p-4">
        <div v-for="f in failedReports" :key="f.repoId" class="mb-4 last:mb-0">
          <div class="flex items-center gap-2 mb-2">
            <i aria-hidden="true" class="i-carbon-document text-text-3 text-14px" />
            <b class="text-text-1 text-sm">{{ repoName(f.repoId) }}</b>
            <code class="text-xs text-text-3 font-mono">{{ f.code }}</code>
          </div>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1.5 text-[11px] font-mono">
            <div class="flex justify-between gap-2"><span class="text-text-3">当前 HEAD</span><b class="text-text-1">{{ f.head || '—' }}</b></div>
            <div class="flex justify-between gap-2"><span class="text-text-3">本次目标</span><b class="text-text-1">{{ f.target || '—' }}</b></div>
            <div class="flex justify-between gap-2"><span class="text-text-3">上次发布基准</span><b class="text-text-1">{{ f.lastPublishCommit ? f.lastPublishCommit.slice(0, 8) : '从未发布' }}</b></div>
            <div class="flex justify-between gap-2">
              <span class="text-text-3">标签</span>
              <b class="text-text-1" :class="{ 'text-warning': f.tag && f.tagTarget && f.tagTarget !== f.target }">
                {{ f.tag ?? '—' }}
              </b>
            </div>
            <div v-if="f.tagTarget" class="flex justify-between gap-2 col-span-2">
              <span class="text-text-3">标签指向 commit</span>
              <b class="text-text-1" :class="{ 'text-warning': f.tagTarget !== f.target }">
                {{ f.tagTarget.slice(0, 8) }}{{ f.tagTarget !== f.target ? '（≠ HEAD）' : '（已对齐）' }}
              </b>
            </div>
            <div v-if="f.tagSource" class="col-span-2 text-text-3 leading-relaxed">
              <span class="font-semibold">来源：</span>{{ f.tagSource }}
            </div>
            <div class="col-span-2 text-text-2 leading-relaxed">
              <span class="font-semibold text-text-3">原始错误：</span>{{ f.message }}
            </div>
          </div>
          <ul v-if="f.suggestions?.length" class="mt-2.5 list-none pl-0 text-[12px] text-text-2 space-y-1">
            <li v-for="(s, i) in f.suggestions" :key="i" class="flex items-start gap-1.5">
              <i aria-hidden="true" class="i-carbon-arrow-right text-info text-12px mt-0.5 shrink-0" />
              <span>{{ s }}</span>
            </li>
          </ul>
        </div>
      </div>
    </NCollapseTransition>

    <!-- 三出路 + 诊断包导出 -->
    <div class="mt-4 flex items-center gap-2 flex-wrap">
      <NButton type="primary" size="small" @click="emit('retry-bump')">
        <template #icon><i class="i-carbon-redo" /></template>
        改用下一版本号重试失败仓库
      </NButton>
      <NButton size="small" secondary :disabled="!taskId" @click="emit('resume')">
        <template #icon><i class="i-carbon-play" /></template>
        接管并续跑
      </NButton>
      <NButton size="small" quaternary type="error" :loading="rollingBack" @click="doRollback">
        <template #icon><i class="i-carbon-undo" /></template>
        回滚本次副作用…
      </NButton>
      <NButton size="small" quaternary :loading="exporting" class="ml-auto" @click="exportDiag">
        <template #icon><i class="i-carbon-download" /></template>
        导出诊断包
      </NButton>
    </div>
  </div>
</template>
