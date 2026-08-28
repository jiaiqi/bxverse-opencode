<script setup lang="ts">
// OpsCenter.vue —— 系统健康页（Phase 2 序号 3）
// 4 卡：一致性体检（doctor）/ 数据迁移 / 引擎日志流 / 关于 bxverse
// 依赖：core/doctor + /api/ops/process + /api/ops/logs

import { NTag, useMessage } from 'naive-ui'
import { api } from '../api'

// 进程级 API 已在 api/index.ts 暴露
type DoctorRepoReport = {
  repoId: string
  repoName: string
  head: string
  branch: string
  lastPublishCommit: string | null
  dirty: number
  ahead: number
  baseAncestor: boolean
  otherBranches: string[]
  buildTagsRecent: string[]
  vTagsCount: number
  vTagLatest: string | null
  plainTagsCount: number
  plainTagsRecent: string[]
  packageJsonLastCommit: string | null
  state: 'ok' | 'warn' | 'error' | 'checking'
  hints: string[]
}
type DoctorProjectReport = {
  projectId: string
  projectName: string
  projectVersion: string
  repos: DoctorRepoReport[]
}
type DoctorReport = {
  home: string
  at: string
  counts: { ok: number; warn: number; error: number }
  overall: 'ok' | 'warn' | 'error' | 'checking'
  projects: DoctorProjectReport[]
}

const message = useMessage()

function formatUptime(sec: number): string {
  if (sec < 60) return `${sec} 秒`
  if (sec < 3600) return `${Math.floor(sec / 60)} 分 ${sec % 60} 秒`
  if (sec < 86400) return `${Math.floor(sec / 3600)} 小时 ${Math.floor((sec % 3600) / 60)} 分`
  return `${Math.floor(sec / 86400)} 天 ${Math.floor((sec % 86400) / 3600)} 小时`
}
async function pingHealth() {
  try {
    const r = await fetch('/api/health')
    r.ok ? message.success('OK · 服务存活') : message.error('不健康')
  } catch (e) {
    message.error((e as Error).message)
  }
}

// ── 巡检 ──
const doctorReport = ref<DoctorReport | null>(null)
const doctorLoading = ref(false)
const doctorFilter = ref<string>('')
const filteredProjects = computed<DoctorProjectReport[]>(() => {
  const projects = doctorReport.value?.projects ?? []
  const q = doctorFilter.value.trim().toLowerCase()
  if (!q) return projects
  return projects.filter(
    (p) => p.projectName.toLowerCase().includes(q) || p.projectId.toLowerCase().includes(q),
  )
})
async function loadDoctor() {
  doctorLoading.value = true
  try {
    doctorReport.value = await api.opsDoctor()
  } catch (e) {
    message.error((e as Error).message)
  } finally {
    doctorLoading.value = false
  }
}
async function runDoctor() {
  if (doctorLoading.value) return
  doctorLoading.value = true
  try {
    doctorReport.value = await api.opsDoctor()
    const c = doctorReport.value?.counts
    message.success(
      `全量体检完成 · 整体 ${doctorReport.value?.overall} · ok ${c?.ok} / warn ${c?.warn} / error ${c?.error}`,
    )
  } catch (e) {
    message.error((e as Error).message)
  } finally {
    doctorLoading.value = false
  }
}
function stateChip(s: DoctorRepoReport['state']): {
  type: 'success' | 'warning' | 'error'
  label: string
} {
  if (s === 'ok') return { type: 'success', label: 'OK' }
  if (s === 'warn') return { type: 'warning', label: 'WARN' }
  return { type: 'error', label: 'ERROR' }
}
function exportDoctorReport() {
  if (!doctorReport.value) return
  const r = doctorReport.value
  const lines = [
    `# bxverse 一致性体检报告`,
    ``,
    `- 时间：${r.at}`,
    `- 整体：${r.overall} · ok=${r.counts.ok} warn=${r.counts.warn} error=${r.counts.error}`,
    ``,
  ]
  for (const p of r.projects) {
    lines.push(`## ${p.projectName} (${p.projectId})  v${p.projectVersion}`)
    for (const x of p.repos) {
      lines.push(
        `- [${x.state.toUpperCase()}] ${x.repoName} HEAD=${x.head} base=${x.lastPublishCommit ?? 'null'} ahead=${x.ahead} dirty=${x.dirty} branch=${x.branch}`,
      )
      for (const h of x.hints) lines.push(`  · ${h}`)
    }
    lines.push(``)
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `doctor-report-${new Date().toISOString().replace(/[:.]/g, '-')}.md`
  a.click()
  URL.revokeObjectURL(url)
}

// ── 关于 bxverse（进程指标） ──
const processInfo = ref<Awaited<ReturnType<typeof api.opsProcess>> | null>(null)
async function loadProcess() {
  try {
    processInfo.value = await api.opsProcess()
  } catch (e) {
    message.error((e as Error).message)
  }
}
const installCommand = ref('')
async function copyInstallCmd() {
  try {
    await navigator.clipboard.writeText(installCommand.value)
    message.success('已复制到剪贴板')
  } catch {
    message.warning('剪贴板不可用，请手动复制')
  }
}
async function openHomeDir() {
  // 浏览器无权限直开本地目录，复制路径到剪贴板
  if (!processInfo.value) return
  try {
    await navigator.clipboard.writeText(processInfo.value.home)
    message.info(`已复制 BX_HOME 路径到剪贴板：${processInfo.value.home}`)
  } catch {
    message.warning('剪贴板不可用')
  }
}

// ── 引擎日志流 ──
const logLevel = ref<'all' | 'info' | 'warn' | 'error'>('all')
const logLines = ref<
  Array<{ ts: string; level: string; message: string; fields: Record<string, unknown> }>
>([])
const logLoading = ref(false)
const logFile = ref('')
const logTotal = ref(0)
async function loadLogs() {
  logLoading.value = true
  try {
    const r = await api.opsLogs(logLevel.value)
    logLines.value = r.lines
    logFile.value = r.file
    logTotal.value = r.total
  } catch (e) {
    message.error((e as Error).message)
  } finally {
    logLoading.value = false
  }
}
function levelClass(lv: string): string {
  if (lv === 'error') return 't-err'
  if (lv === 'warn') return 't-warn'
  return 't-info'
}

// ── 数据迁移 ──
const migrationPlan = computed(() => {
  // R26 迁移动作（已落地）：projects/ 目录 vs 旧 app.json projects[] 字段
  return [
    {
      from: 'app.json embedded projects[]',
      to: 'projects/<id>.json 单文件',
      status: 'done',
      note: 'core 自动迁移：旧项目自动拆出；缺字段时回退内嵌',
    },
    {
      from: '旧项目 lastPublishCommit=null',
      to: '首次发布前不下发，只走全量收集',
      status: 'done',
      note: 'maxCommits=500 兜底',
    },
    {
      from: '无',
      to: 'schemaVersion 字段（计划中）',
      status: 'pending',
      note: 'M13 后续：迁移前自动备份 app.json.bak-mig，可回滚',
    },
  ]
})

onMounted(async () => {
  await Promise.all([loadDoctor(), loadProcess(), loadLogs()])
  // 启动时设置常见安装命令（用户可改）
  installCommand.value = 'pnpm i -g bxverse'
})

// 30s 自动刷新（轮询后端指标；不影响其他视图）
let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  timer = setInterval(() => {
    void loadProcess()
  }, 30_000)
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})

// 暴露给全局命令面板（搜索"健康/doctor"可触发）
defineExpose({ loadDoctor, runDoctor })
</script>

<template>
  <div class="page max-w-6xl space-y-5">
    <PageHeader
      title="系统健康（OpsCenter）"
      description="一致性体检 · 进程指标 · 引擎日志流 · 数据迁移"
    >
      <template #actions>
        <NButton @click="openHomeDir" size="small">打开 BX_HOME</NButton>
        <NButton secondary size="small" @click="$router.push('/')">返回总览</NButton>
      </template>
    </PageHeader>

    <!-- 上排：巡检 + 迁移（grid 2 列） -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <!-- 一致性体检 -->
      <section class="glass-panel p-5 rounded-2xl">
        <div class="flex items-center justify-between mb-2">
          <h2 class="section-title">
            <i aria-hidden="true" class="i-carbon-search text-brand-500" />
            一致性体检（doctor）
          </h2>
          <NTag
            v-if="doctorReport"
            :type="
              doctorReport.overall === 'ok'
                ? 'success'
                : doctorReport.overall === 'warn'
                  ? 'warning'
                  : 'error'
            "
            :bordered="false"
            size="small"
          >
            整体 {{ doctorReport.overall }} · ok {{ doctorReport.counts.ok }} / warn
            {{ doctorReport.counts.warn }} / error {{ doctorReport.counts.error }}
          </NTag>
        </div>
        <p class="text-xs text-text-3 mb-3">
          核对 app.json 的 lastPublishCommit 与各仓库真实 git 状态，专治「全部显示最新 /
          提交流为空」类问题。
        </p>
        <div class="flex items-center gap-2 flex-wrap mb-3">
          <NInput
            v-model:value="doctorFilter"
            placeholder="筛选项目名/ID…"
            clearable
            size="small"
            style="width: 200px"
          />
          <NButton size="tiny" :loading="doctorLoading" @click="runDoctor">立即全量体检</NButton>
          <NButton
            v-if="doctorReport"
            size="tiny"
            quaternary
            @click="loadDoctor"
            :loading="doctorLoading"
            >刷新</NButton
          >
          <NButton v-if="doctorReport" size="tiny" quaternary @click="exportDoctorReport"
            >导出报告（md）</NButton
          >
        </div>
        <div v-if="doctorReport" class="space-y-3 max-h-96 overflow-y-auto pr-1">
          <div v-if="filteredProjects.length === 0" class="text-xs text-text-3 text-center py-3">
            无匹配项目
          </div>
          <div
            v-for="p in filteredProjects"
            :key="p.projectId"
            class="rounded-lg border border-border bg-surface-alt p-3"
          >
            <div class="flex items-center gap-2 mb-2">
              <i aria-hidden="true" class="i-carbon-catalog text-text-3" />
              <b class="text-text-1 text-sm">{{ p.projectName }}</b>
              <code class="text-xs text-text-3 font-mono"
                >{{ p.projectId }} · v{{ p.projectVersion }}</code
              >
            </div>
            <div v-if="p.repos.length === 0" class="text-xs text-text-3 pl-5">该项目下无仓库</div>
            <ul v-else class="space-y-1.5 pl-5">
              <li
                v-for="x in p.repos"
                :key="x.repoId"
                class="flex items-start gap-2 text-[12px] font-mono"
              >
                <NTag
                  :type="stateChip(x.state).type"
                  size="tiny"
                  :bordered="false"
                  class="shrink-0"
                >
                  {{ stateChip(x.state).label }}
                </NTag>
                <span class="text-text-1 truncate flex-1" :title="x.repoName">{{
                  x.repoName
                }}</span>
                <span class="text-text-3 shrink-0"
                  >HEAD {{ x.head }} · base {{ x.lastPublishCommit?.slice(0, 8) ?? '—' }} · ahead
                  {{ x.ahead }} · dirty {{ x.dirty }}</span
                >
              </li>
            </ul>
          </div>
        </div>
        <div v-else class="text-xs text-text-3 text-center py-6">加载中…</div>
      </section>

      <!-- 数据迁移 -->
      <section class="glass-panel p-5 rounded-2xl">
        <h2 class="section-title mb-2">
          <i aria-hidden="true" class="i-carbon-data--base text-info" />
          数据迁移
        </h2>
        <p class="text-xs text-text-3 mb-3">
          未来 schema 升级逐步执行、失败即停、可回滚。当前所有迁移已完成（v1 → v2）。
        </p>
        <div class="space-y-2 text-xs">
          <div
            v-for="(m, i) in migrationPlan"
            :key="i"
            class="flex items-start gap-2 rounded-md border border-border bg-surface-alt p-2.5"
          >
            <NTag
              :type="m.status === 'done' ? 'success' : 'default'"
              :bordered="false"
              size="tiny"
              class="shrink-0"
            >
              {{ m.status === 'done' ? '已完成' : '待办' }}
            </NTag>
            <div class="flex-1 min-w-0">
              <div class="text-text-1 font-mono text-[11px] truncate">
                <span class="text-text-3">{{ m.from }}</span>
                <i aria-hidden="true" class="i-carbon-arrow-right mx-1 text-text-3" />
                <span>{{ m.to }}</span>
              </div>
              <div class="text-text-3 mt-0.5 text-[11px]">{{ m.note }}</div>
            </div>
          </div>
        </div>
        <p class="text-[10px] text-text-3 mt-3">
          BX_HOME 实际位置：<code class="font-mono">{{ processInfo?.home ?? '—' }}</code>
        </p>
      </section>
    </div>

    <!-- 引擎日志流 -->
    <section class="glass-panel p-5 rounded-2xl">
      <div class="flex items-center gap-3 mb-3 flex-wrap">
        <h2 class="section-title">
          <i aria-hidden="true" class="i-carbon-document text-warn" />
          引擎日志流
        </h2>
        <div class="flex gap-1">
          <button
            v-for="lv in ['all', 'info', 'warn', 'error'] as const"
            :key="lv"
            @click="
              logLevel = lv
              loadLogs()
            "
            class="px-3 py-1 rounded-full text-[10px] mono focus-ring border"
            :class="
              logLevel === lv
                ? 'border-brand-500 bg-brand-soft text-brand-500'
                : 'border-border text-text-3'
            "
          >
            {{ lv === 'all' ? '全部' : lv.toUpperCase() }}
          </button>
        </div>
        <span class="text-[10px] text-text-3 ml-auto font-mono">
          {{ logFile || '今日日志未生成' }} · 过滤后 {{ logLines.length }} / 累计 {{ logTotal }} ·
          30 天滚动保留
        </span>
        <NButton size="tiny" :loading="logLoading" @click="loadLogs">刷新</NButton>
      </div>
      <div
        class="rounded-xl border border-border p-3 max-h-[280px] overflow-y-auto font-mono text-[11px] leading-relaxed"
        style="background: #0b0d11"
      >
        <div v-if="logLines.length === 0" class="text-text-3 text-center py-6">该级别暂无日志</div>
        <div v-for="(l, i) in logLines" :key="i" class="whitespace-pre-wrap break-all">
          <span class="text-text-3">[{{ l.ts }}]</span>
          <span :class="levelClass(l.level)"> [{{ l.level.toUpperCase() }}]</span>
          <span class="text-text-1"> {{ l.message }}</span>
          <span v-if="Object.keys(l.fields).length" class="text-text-3"> {{ l.fields }}</span>
        </div>
      </div>
    </section>

    <!-- 关于 bxverse -->
    <section class="glass-panel p-5 rounded-2xl">
      <div class="flex items-center gap-3 mb-3 flex-wrap">
        <h2 class="section-title">
          <i aria-hidden="true" class="i-carbon-cube text-brand-500" />
          关于 bxverse
        </h2>
        <NTag v-if="processInfo" type="success" :bordered="false" size="small"
          >v{{ processInfo.version }} 已运行 {{ formatUptime(processInfo.uptimeSec) }}</NTag
        >
        <NTag :bordered="false" size="small"
          >node {{ processInfo?.nodeVersion ?? '—' }} · {{ processInfo?.platform ?? '—' }}</NTag
        >
        <span class="text-[10px] text-text-3 ml-auto font-mono"
          >进程 RSS {{ processInfo?.memMB ?? 0 }} MB · 启动
          {{ processInfo?.startedAt?.slice(0, 19) ?? '—' }}</span
        >
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <div>
          <div class="text-text-3 mb-1">安装 / 升级</div>
          <div class="flex gap-1">
            <NInput
              v-model:value="installCommand"
              size="small"
              class="flex-1"
              :input-props="{ autocomplete: 'off', spellcheck: false }"
            />
            <NButton size="small" quaternary @click="copyInstallCmd">复制</NButton>
          </div>
          <div class="text-[10px] text-text-3 mt-1">全局 bx-manager 命令来自 pnpm 安装</div>
        </div>
        <div>
          <div class="text-text-3 mb-1">数据目录（BX_HOME）</div>
          <div class="flex gap-1">
            <code
              class="text-[11px] font-mono text-text-1 px-2 py-1.5 rounded border border-border bg-surface-alt flex-1 truncate"
              :title="processInfo?.home"
            >
              {{ processInfo?.home ?? '—' }}
            </code>
            <NButton size="small" quaternary @click="openHomeDir">复制</NButton>
          </div>
        </div>
        <div>
          <div class="text-text-3 mb-1">健康检查</div>
          <div class="flex gap-1">
            <NButton size="small" secondary @click="pingHealth">Ping /api/health</NButton>
            <NButton size="small" secondary @click="loadProcess">刷新指标</NButton>
          </div>
          <div class="text-[10px] text-text-3 mt-1">每 30s 自动刷新内存 / uptime</div>
        </div>
      </div>
      <div class="text-[10px] text-text-3 mt-3 leading-relaxed">
        bxverse {{ processInfo?.version ?? '—' }} · 启动于
        {{ processInfo?.startedAt?.slice(0, 19).replace('T', ' ') ?? '—' }} · 数据目录
        {{ processInfo?.home ?? '—' }} · 自举版本同构复用：自身更新日志由 bxverse
        引擎生成（dogfooding）
      </div>
    </section>
  </div>
</template>
