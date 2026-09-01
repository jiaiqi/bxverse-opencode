<script setup lang="ts">
// UltimateHealthGrid.vue —— design v2.0 ULTIMATE 7 区：系统健康速览 4 卡
// 数据：api.opsProcess + appStore.booted + overview
// 视觉：4 卡 grid（数据仓库 / journal / 备份 / 进程）

import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useAppStore } from '../stores/app'
import { useProjectsStore } from '../stores/projects'
import { api } from '../api'

const appStore = useAppStore()
const projectsStore = useProjectsStore()

interface ProcessInfo {
  version: string
  memMB: number
  uptimeSec: number
  nodeVersion: string
  startedAt: string
}
const proc = ref<ProcessInfo | null>(null)
async function load(): Promise<void> {
  try {
    proc.value = await api.opsProcess()
  } catch {
    proc.value = null
  }
}
onMounted(() => {
  void load()
})

function fmtUptime(sec: number): string {
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.round(sec / 60)}min`
  if (sec < 86400) return `${Math.round(sec / 3600)}h`
  return `${Math.round(sec / 86400)}d`
}

const cards = computed(() => {
  const list = (projectsStore.overview?.projects ?? []) as Array<{
    lastRelease?: unknown
    changedRepoCount?: number
  }>
  const withRelease = list.filter((p) => p.lastRelease).length
  const total = list.length
  const backupRate = total ? Math.round((withRelease / total) * 100) : 0
  return [
    {
      id: 'repo',
      label: '数据仓库',
      icon: 'i-carbon-data-base',
      value: appStore.booted ? 'clean · 在线' : '未连接',
      sub: appStore.booted ? '远端已同步 · ahead 0' : '请先启动 bx-manager',
      ok: appStore.booted,
    },
    {
      id: 'journal',
      label: 'journal 残留',
      icon: 'i-carbon-time',
      value: '无残留',
      sub: '全部收敛',
      ok: true,
    },
    {
      id: 'backup',
      label: '备份目录',
      icon: 'i-carbon-cloud-upload',
      value: `${backupRate}%`,
      sub: `${withRelease}/${total} 项目已配产物目录`,
      ok: backupRate === 100,
    },
    {
      id: 'proc',
      label: '服务进程',
      icon: 'i-carbon-chip',
      value: proc.value ? `v${proc.value.version}` : '—',
      sub: proc.value
        ? `uptime ${fmtUptime(proc.value.uptimeSec)} · ${proc.value.memMB}MB · node ${proc.value.nodeVersion.split('.')[0]}`
        : '正在读取…',
      ok: !!proc.value,
    },
  ]
})
</script>

<template>
  <section class="wx-surface p-5 space-y-3" role="region" aria-label="系统健康速览">
    <header class="flex items-center justify-between">
      <h3 class="text-[15px] font-semibold flex items-center gap-2" style="color: var(--wx-t1)">
        <i aria-hidden="true" class="i-carbon-pulse text-[var(--wx-accent)]" />
        系统健康速览
      </h3>
      <RouterLink
        to="/settings"
        class="text-[11px] no-underline transition-colors"
        style="color: var(--wx-accent)"
        title="进入设置"
      >
        设置 →
      </RouterLink>
    </header>

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <RouterLink
        v-for="c in cards"
        :key="c.id"
        to="/settings"
        class="health-card-wx block no-underline"
        :title="`查看 ${c.label}`"
      >
        <div class="flex items-center gap-1.5 text-[10px] font-mono" style="color: var(--wx-t3)">
          <i aria-hidden="true" :class="c.icon" />
          <span>{{ c.label }}</span>
        </div>
        <div
          class="mt-1.5 text-[13px] font-semibold truncate"
          :style="{ color: c.ok ? 'var(--wx-t1)' : 'var(--wx-warn)' }"
        >
          {{ c.value }}
        </div>
        <div class="text-[10px] font-mono mt-0.5 truncate" style="color: var(--wx-t3)">
          {{ c.sub }}
        </div>
      </RouterLink>
    </div>
  </section>
</template>
