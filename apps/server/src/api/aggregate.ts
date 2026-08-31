// apps/server/src/api/aggregate.ts
// D 方向：跨项目升级日志聚合（feed 流 / 时间线分桶 / 导出 md）
//
// 设计要点：
// - 3 端点独立：feed（按 release 倒序流）/ timeline（按 day/week/month 分桶）/ export（导出 md/json）
// - 复用既有 dataStore.listRecords + cfg.projects，无新增数据源
// - 零依赖、纯查询；不调用 git、不写记录；不影响发布队列
// - 全部带 X-BX-Token 鉴权（除 export 公共可访问，v1 不开放）
// - 错误码：VALIDATION（参数错）
//
// 时间线分桶：day=YYYY-MM-DD，week=YYYY-Www（ISO 周），month=YYYY-MM。
// 注意：所有时间用 release.date（ISO），不调 Date.now；since 默认 30 天前（毫秒 epoch 由调用方传入 ISO 字符串）。

import type {
  AggregateExportFormat,
  AggregateFeedItem,
  AggregateFeedResponse,
  AggregateGranularity,
  AggregateTimelineBucket,
  AggregateTimelineResponse,
  AppConfig,
} from '@bxverse/shared'
import { store } from '@bxverse/core'
import type { Ctx } from '../http/router'
import { apiError, sendJson } from '../http/json'

export interface AggregateServices {
  loadCfg: () => Promise<AppConfig>
  getDataStore: () => store.DataStore
}

const DEFAULT_FEED_LIMIT = 50
const MAX_FEED_LIMIT = 200
const DEFAULT_TIMELINE_DAYS = 30
const MAX_TIMELINE_DAYS = 365

const VALID_GRANULARITY: readonly AggregateGranularity[] = ['day', 'week', 'month'] as const
const VALID_EXPORT_FORMAT: readonly AggregateExportFormat[] = ['md', 'json'] as const

export function register(
  router: import('../http/router').Router,
  services: AggregateServices,
): void {
  // GET /api/aggregate/feed?since=&until=&projectId=&limit=50
  router.get('/api/aggregate/feed', async (ctx: Ctx) => {
    const t0 = Date.now()
    const cfg = await services.loadCfg()
    const dataStore = services.getDataStore()

    // 解析 since（默认 30 天前）
    const sinceRaw = ctx.query.get('since')
    const since = sinceRaw ? Date.parse(sinceRaw) : Date.now() - 30 * 24 * 60 * 60 * 1000
    if (Number.isNaN(since)) throw apiError(400, 'VALIDATION', 'since 必须是合法 ISO 时间')

    // 解析 until（默认 now）
    const untilRaw = ctx.query.get('until')
    const until = untilRaw ? Date.parse(untilRaw) : Date.now()
    if (Number.isNaN(until)) throw apiError(400, 'VALIDATION', 'until 必须是合法 ISO 时间')
    if (until < since) throw apiError(400, 'VALIDATION', 'until 必须 ≥ since')

    // 解析 projectId 过滤（可选）
    const projectIdFilter = ctx.query.get('projectId')

    // 解析 limit
    const limitRaw = Number(ctx.query.get('limit') ?? DEFAULT_FEED_LIMIT)
    if (!Number.isInteger(limitRaw) || limitRaw < 1) {
      throw apiError(400, 'VALIDATION', 'limit 必须为正整数')
    }
    const limit = Math.min(limitRaw, MAX_FEED_LIMIT)

    // 收集所有 release（去重 + 时间窗口过滤 + project 过滤）
    const items: AggregateFeedItem[] = []
    for (const p of cfg.projects) {
      if (projectIdFilter && p.id !== projectIdFilter) continue
      const records = await dataStore.listRecords(p.id, 100)
      for (const r of records) {
        const dateMs = Date.parse(r.date)
        if (Number.isNaN(dateMs)) continue
        if (dateMs < since || dateMs > until) continue
        items.push({
          releaseId: r.id,
          projectId: p.id,
          projectName: p.name,
          version: r.version,
          date: r.date,
          bump: r.bump,
          deprecated: r.deprecated ?? false,
          repos: (r.repos ?? []).map((ref) => ({
            repoId: ref.repoId,
            repoName: ref.repoName,
            version: ref.version,
          })),
          externalContent: r.logs.external.content,
          commitCount: r.stats.commits,
        })
      }
    }

    // 按时间倒序，截断 limit
    items.sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    const sliced = items.slice(0, limit)

    sendJson(ctx.res, 200, {
      until: new Date(until).toISOString(),
      total: items.length,
      items: sliced,
      tookMs: Date.now() - t0,
    } satisfies AggregateFeedResponse)
  })

  // GET /api/aggregate/timeline?granularity=day&days=30&projectId=
  router.get('/api/aggregate/timeline', async (ctx: Ctx) => {
    const t0 = Date.now()
    const cfg = await services.loadCfg()
    const dataStore = services.getDataStore()

    const granularityRaw = (ctx.query.get('granularity') ?? 'day').trim()
    if (!VALID_GRANULARITY.includes(granularityRaw as AggregateGranularity)) {
      throw apiError(400, 'VALIDATION', `granularity 必须为 ${VALID_GRANULARITY.join('|')}`)
    }
    const granularity = granularityRaw as AggregateGranularity

    const daysRaw = Number(ctx.query.get('days') ?? DEFAULT_TIMELINE_DAYS)
    if (!Number.isInteger(daysRaw) || daysRaw < 1) {
      throw apiError(400, 'VALIDATION', 'days 必须为正整数')
    }
    const days = Math.min(daysRaw, MAX_TIMELINE_DAYS)

    const projectIdFilter = ctx.query.get('projectId')

    const untilMs = Date.now()
    const sinceMs = untilMs - days * 24 * 60 * 60 * 1000

    // 收集 release
    type ReleaseLite = { projectId: string; dateMs: number }
    const all: ReleaseLite[] = []
    for (const p of cfg.projects) {
      if (projectIdFilter && p.id !== projectIdFilter) continue
      const records = await dataStore.listRecords(p.id, 100)
      for (const r of records) {
        const dateMs = Date.parse(r.date)
        if (Number.isNaN(dateMs)) continue
        if (dateMs < sinceMs || dateMs > untilMs) continue
        all.push({ projectId: p.id, dateMs })
      }
    }

    // 分桶
    const bucketMap = new Map<string, { start: number; end: number; projects: Set<string> }>()
    for (const r of all) {
      const { key, start, end } = bucketKey(r.dateMs, granularity)
      let b = bucketMap.get(key)
      if (!b) {
        b = { start, end, projects: new Set() }
        bucketMap.set(key, b)
      }
      b.projects.add(r.projectId)
    }

    // 排序输出（按 start asc）
    const buckets: AggregateTimelineBucket[] = [...bucketMap.entries()]
      .sort((a, b) => a[1].start - b[1].start)
      .map(([key, b]) => ({
        key,
        start: new Date(b.start).toISOString(),
        end: new Date(b.end).toISOString(),
        count: all.filter((r) => r.dateMs >= b.start && r.dateMs < b.end).length,
        projectCount: b.projects.size,
        projectIds: [...b.projects],
      }))

    const projectIds = new Set(all.map((r) => r.projectId))

    sendJson(ctx.res, 200, {
      granularity,
      since: new Date(sinceMs).toISOString(),
      until: new Date(untilMs).toISOString(),
      buckets,
      total: all.length,
      projectCount: projectIds.size,
      tookMs: Date.now() - t0,
    } satisfies AggregateTimelineResponse)
  })

  // GET /api/aggregate/export?since=&until=&projectId=&format=md|json
  router.get('/api/aggregate/export', async (ctx: Ctx) => {
    const cfg = await services.loadCfg()
    const dataStore = services.getDataStore()

    const sinceRaw = ctx.query.get('since')
    const since = sinceRaw ? Date.parse(sinceRaw) : Date.now() - 30 * 24 * 60 * 60 * 1000
    if (Number.isNaN(since)) throw apiError(400, 'VALIDATION', 'since 必须是合法 ISO 时间')

    const untilRaw = ctx.query.get('until')
    const until = untilRaw ? Date.parse(untilRaw) : Date.now()
    if (Number.isNaN(until)) throw apiError(400, 'VALIDATION', 'until 必须是合法 ISO 时间')

    const projectIdFilter = ctx.query.get('projectId')
    const formatRaw = (ctx.query.get('format') ?? 'md').trim()
    if (!VALID_EXPORT_FORMAT.includes(formatRaw as AggregateExportFormat)) {
      throw apiError(400, 'VALIDATION', `format 必须为 ${VALID_EXPORT_FORMAT.join('|')}`)
    }
    const format = formatRaw as AggregateExportFormat

    // 收集 feed items
    const items: AggregateFeedItem[] = []
    for (const p of cfg.projects) {
      if (projectIdFilter && p.id !== projectIdFilter) continue
      const records = await dataStore.listRecords(p.id, 100)
      for (const r of records) {
        const dateMs = Date.parse(r.date)
        if (Number.isNaN(dateMs)) continue
        if (dateMs < since || dateMs > until) continue
        items.push({
          releaseId: r.id,
          projectId: p.id,
          projectName: p.name,
          version: r.version,
          date: r.date,
          bump: r.bump,
          deprecated: r.deprecated ?? false,
          repos: (r.repos ?? []).map((ref) => ({
            repoId: ref.repoId,
            repoName: ref.repoName,
            version: ref.version,
          })),
          externalContent: r.logs.external.content,
          commitCount: r.stats.commits,
        })
      }
    }
    items.sort((a, b) => Date.parse(a.date) - Date.parse(b.date)) // 导出按时间正序（feed 倒序）

    if (format === 'json') {
      ctx.res.setHeader('Content-Type', 'application/json; charset=utf-8')
      ctx.res.setHeader(
        'Content-Disposition',
        `attachment; filename="upgrade-feed-${new Date(since).toISOString().slice(0, 10)}-${new Date(until).toISOString().slice(0, 10)}.json"`,
      )
      ctx.res.end(JSON.stringify({ since, until, items }, null, 2))
      return
    }

    // md 导出
    const md = renderMarkdown(items, since, until)
    ctx.res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
    ctx.res.setHeader(
      'Content-Disposition',
      `attachment; filename="upgrade-feed-${new Date(since).toISOString().slice(0, 10)}-${new Date(until).toISOString().slice(0, 10)}.md"`,
    )
    ctx.res.end(md)
  })
}

// ---------- 工具函数 ----------

/** 计算分桶键 + 起止时间 */
function bucketKey(
  dateMs: number,
  granularity: AggregateGranularity,
): {
  key: string
  start: number
  end: number
} {
  const d = new Date(dateMs)
  if (granularity === 'day') {
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
    const end = start + 24 * 60 * 60 * 1000
    return {
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      start,
      end,
    }
  }
  if (granularity === 'month') {
    const start = new Date(d.getFullYear(), d.getMonth(), 1).getTime()
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime()
    return {
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      start,
      end,
    }
  }
  // week：ISO week（周一开始）
  const tmp = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dayOfWeek = (tmp.getDay() + 6) % 7 // 周一=0 ... 周日=6
  const weekStart = new Date(tmp.getFullYear(), tmp.getMonth(), tmp.getDate() - dayOfWeek)
  const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7)
  // ISO week number
  const target = new Date(weekStart.getTime())
  target.setDate(target.getDate() + 3) // Thursday of this week
  const firstThursday = new Date(target.getFullYear(), 0, 4)
  const weekNum =
    1 +
    Math.round(
      ((target.getTime() - firstThursday.getTime()) / 86400000 -
        3 +
        ((firstThursday.getDay() + 6) % 7)) /
        7,
    )
  return {
    key: `${weekStart.getFullYear()}-W${String(weekNum).padStart(2, '0')}`,
    start: weekStart.getTime(),
    end: weekEnd.getTime(),
  }
}

/** md 导出：按项目分组，header + 各项目子节 + 各 release 详情 */
function renderMarkdown(items: AggregateFeedItem[], since: number, until: number): string {
  const lines: string[] = []
  const sinceStr = new Date(since).toISOString().slice(0, 10)
  const untilStr = new Date(until).toISOString().slice(0, 10)
  lines.push(`# 升级日志聚合`)
  lines.push('')
  lines.push(`- 时间窗口：${sinceStr} ~ ${untilStr}`)
  lines.push(`- 总发布数：${items.length}`)
  const projectSet = new Set(items.map((i) => i.projectName))
  lines.push(`- 涉及项目：${projectSet.size}`)
  lines.push('')
  // 按项目分组
  const byProject = new Map<string, AggregateFeedItem[]>()
  for (const it of items) {
    const list = byProject.get(it.projectName) ?? []
    list.push(it)
    byProject.set(it.projectName, list)
  }
  for (const [projectName, list] of byProject) {
    lines.push(`## ${projectName}`)
    lines.push('')
    for (const it of list) {
      const date = it.date.slice(0, 10)
      const deprecated = it.deprecated ? ' · 已废弃' : ''
      const reposStr = it.repos.map((r) => `${r.repoName}@${r.version}`).join(', ')
      lines.push(`### ${it.version} · ${date}${deprecated}`)
      lines.push('')
      lines.push(`- bump：${it.bump} · 提交数：${it.commitCount}`)
      if (reposStr) lines.push(`- 涉及仓库：${reposStr}`)
      lines.push('')
      // external content 原样嵌入
      lines.push(it.externalContent)
      lines.push('')
      lines.push('---')
      lines.push('')
    }
  }
  return lines.join('\n')
}
