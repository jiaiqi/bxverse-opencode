// apps/server/src/queue.ts
// 发布单队列：同时最多 1 个任务；忙时 TASK_BUSY；事件缓冲供 SSE 快照
// S4: 事件持久化到 journal 旁挂 .events.jsonl，重启后可重放；缓冲上限 5000，标注 truncated

import type { PublishEvent, PublishRequest } from '@bxverse/shared'
import { CoreError, CORE_ERROR_CODES, engine, store } from '@bxverse/core'
import { JournalStore } from '@bxverse/core'
import type { SseHub } from './sse'
import { dispatchWebhooks } from './notifications'

const MAX_BUFFERED = 5000

export interface TaskState {
  taskId: string
  projectId: string
  status: 'running' | 'done' | 'failed'
  startedAt: string
  finishedAt: string | null
  events: PublishEvent[]
  failedRepos: string[]
  releaseId: string | null
  /** 缓冲是否因超限或 seq 缺口被截断（供 SSE 重放首帧标注） */
  truncated?: boolean
}

export class PublishQueue {
  /** 当前活动任务（向后兼容；新代码优先用 getTask） */
  current: TaskState | null = null
  private readonly tasks = new Map<string, TaskState>()
  private nextSeq = 0
  private readonly journalStore: JournalStore
  private withCfg?: <T>(
    mutator: (cfg: import('@bxverse/shared').AppConfig) => T | Promise<T>,
  ) => Promise<T>

  constructor(
    private sse: SseHub,
    journalStore?: JournalStore,
    withCfg?: <T>(
      mutator: (cfg: import('@bxverse/shared').AppConfig) => T | Promise<T>,
    ) => Promise<T>,
  ) {
    this.journalStore = journalStore ?? new JournalStore()
    this.withCfg = withCfg
    this.restoreFromJournal()
  }

  setWithCfg(
    withCfg: <T>(
      mutator: (cfg: import('@bxverse/shared').AppConfig) => T | Promise<T>,
    ) => Promise<T>,
  ): void {
    this.withCfg = withCfg
  }

  get running(): boolean {
    return this.current?.status === 'running'
  }

  /** 当前运行中任务锁定的项目（项目定义变更 409 用） */
  get lockedProjectId(): string | null {
    return this.running ? this.current!.projectId : null
  }

  getTask(taskId: string): TaskState | undefined {
    if (this.current?.taskId === taskId) return this.current
    return this.tasks.get(taskId)
  }

  /** 获取重放事件（校验 seq 连续性，缺口时首帧 data 附 truncated:true） */
  getReplay(taskId: string | null): PublishEvent[] {
    const task = taskId ? this.getTask(taskId) : this.current
    if (!task) return []
    const replay = [...task.events]
    let needTruncated = !!task.truncated
    if (!needTruncated && replay.length > 0) {
      for (let i = 1; i < replay.length; i++) {
        const prev = replay[i - 1].seq
        const cur = replay[i].seq
        if (typeof prev === 'number' && typeof cur === 'number' && cur !== prev + 1) {
          needTruncated = true
          break
        }
      }
      if (!needTruncated && typeof replay[0].seq === 'number' && replay[0].seq !== 1)
        needTruncated = true
    }
    if (needTruncated && replay.length > 0) {
      const first = replay[0]
      const baseData =
        first.data && typeof first.data === 'object' && !Array.isArray(first.data)
          ? (first.data as Record<string, unknown>)
          : {}
      // 保留原 data 字段，附加 truncated 标志
      const merged = { ...baseData, truncated: true }
      // 若原 data 非对象，则直接用 {truncated:true} 作为 data
      const data =
        first.data && typeof first.data === 'object' && !Array.isArray(first.data) ? merged : merged
      replay[0] = { ...first, data } as PublishEvent
    }
    return replay
  }

  /** 启动时扫描 journal，从 events.jsonl 重建只读 TaskState */
  private restoreFromJournal(): void {
    let journals: ReturnType<JournalStore['listAll']> = []
    try {
      journals = this.journalStore.listAll()
    } catch {
      return
    }
    // 优先恢复 interrupted/running，其次也恢复已完成但有事件流的历史任务（保证重启后可回放）
    const candidates = journals.filter(
      (j) =>
        j.status === 'interrupted' ||
        j.status === 'running' ||
        j.status === 'done' ||
        j.status === 'failed',
    )
    // 按 startedAt 排序，保证插入顺序稳定
    candidates.sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    for (const j of candidates) {
      const { events, truncated } = this.journalStore.loadEvents(j.taskId)
      if (events.length === 0) continue
      // 已在 tasks 中的跳过（避免覆盖当前运行任务）
      if (this.tasks.has(j.taskId) || this.current?.taskId === j.taskId) continue
      // Buffer 上限已在 loadEvents 中处理（保留末 5000）
      let status: TaskState['status']
      if (j.status === 'done') status = 'done'
      else if (j.status === 'failed') status = 'failed'
      else if (j.status === 'interrupted') status = 'failed'
      else status = j.status === 'running' ? 'running' : 'failed'
      // 若有 done/error 终帧，以终帧为准矫正状态
      const last = events[events.length - 1]
      if (last?.type === 'done') status = 'done'
      else if (last?.type === 'error') status = 'failed'
      // 若状态仍为 running 但 journal 已 interrupted，视为 failed（避免 running 锁死）
      if (j.status === 'interrupted' && status === 'running') status = 'failed'

      // 解析 releaseId / failedRepos 供 current 接口使用
      let releaseId: string | null = null
      let failedRepos: string[] = []
      const doneEv = events.find((e) => e.type === 'done')
      if (doneEv) {
        releaseId = (doneEv.data as { releaseId?: string | null } | undefined)?.releaseId ?? null
        failedRepos = (doneEv.data as { failedRepos?: string[] } | undefined)?.failedRepos ?? []
      } else {
        const errEv = events.find((e) => e.type === 'error')
        if (errEv)
          failedRepos = (errEv.data as { failedRepos?: string[] } | undefined)?.failedRepos ?? []
      }

      const task: TaskState = {
        taskId: j.taskId,
        projectId: j.projectId,
        status,
        startedAt: j.startedAt,
        finishedAt: j.status === 'running' ? null : new Date().toISOString(),
        events,
        failedRepos,
        releaseId,
        truncated: truncated || undefined,
      }
      // 纠正 finishedAt：若有终帧时间则用 journal 完成态推断
      if (status === 'running') task.finishedAt = null
      this.tasks.set(j.taskId, task)
    }
    // 若当前无任务，选最新一个非 running 的历史任务作为 current 供 /publish/current 查询？
    // 保持原语义：current 仅在有运行或最后一次提交后存在；恢复的历史任务不自动成为 current
    // 但为保证 /api/events?task= 历史任务可访问，tasks 已包含
    // 若当前为 null 且存在 tasks，取最新的 failed/done 作为 current 的备用（不影响锁）
    if (!this.current && this.tasks.size > 0) {
      // 取按 startedAt 最新的一个作为 current（只读）
      const sorted = [...this.tasks.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      // 优先选 done/failed 的最新；running 的不设为 current（避免锁）
      const pick = sorted.find((t) => t.status !== 'running') ?? sorted[0]
      this.current = pick
      // 若 pick 是 running，需初始化 nextSeq 为最大 seq
      if (pick.status === 'running') {
        const maxSeq = pick.events.reduce((m, e) => Math.max(m, e.seq ?? 0), 0)
        this.nextSeq = maxSeq
      }
    }
  }

  /** 提交任务：忙 → 409 TASK_BUSY；空闲 → 立即异步执行并返回 taskId */
  async submit(req: PublishRequest): Promise<string> {
    if (this.running) {
      throw new CoreError(CORE_ERROR_CODES.TASK_BUSY, '已有发布任务在执行，请稍后再试')
    }
    const taskId = `t_${stamp()}_${Math.random().toString(36).slice(2, 6)}`
    const task: TaskState = {
      taskId,
      projectId: req.projectId,
      status: 'running',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      events: [],
      failedRepos: [],
      releaseId: null,
    }
    this.current = task
    this.tasks.set(taskId, task)
    this.nextSeq = 0
    // 异步执行（不 await，避免阻塞 HTTP 响应）
    void this.run(task, req)
    return taskId
  }

  private async run(task: TaskState, req: PublishRequest): Promise<void> {
    const push = (event: PublishEvent) => {
      const e: PublishEvent = { ...event, seq: event.seq ?? ++this.nextSeq }
      // 持久化（追加写，进程内 flush）
      try {
        this.journalStore.appendEvent(task.taskId, e)
      } catch {
        // ignore
      }
      // 内存缓冲：上限 5000，超限丢弃最早并标注 truncated
      if (task.events.length >= MAX_BUFFERED) {
        task.events.shift()
        task.truncated = true
      }
      task.events.push(e)
      // 若检测到 seq 非连续（理论上不应发生，因 seq 由本队列生成），也标注
      if (task.events.length >= 2) {
        const prev = task.events[task.events.length - 2].seq
        const cur = e.seq
        if (typeof prev === 'number' && typeof cur === 'number' && cur !== prev + 1) {
          task.truncated = true
        }
      }
      this.sse.broadcast(task.taskId, e)
      if (e.type === 'done') {
        task.status = 'done'
        task.finishedAt = new Date().toISOString()
        task.releaseId = (e.data as { releaseId?: string | null } | undefined)?.releaseId ?? null
        task.failedRepos = (e.data as { failedRepos?: string[] } | undefined)?.failedRepos ?? []
        // R28 快速发布快照（withCfg 原子化）+ R29 webhook done
        void (async () => {
          // 1) R28 快照
          try {
            const snapshot = {
              repoIds: req.repoIds ?? [],
              bump: req.bump as import('@bxverse/shared').BumpType | 'auto',
              skipBuild: !!req.skipBuild,
              offline: !!req.offline,
              backupSource: !!req.backupSource,
              backupArtifacts: !!req.backupArtifacts,
            }
            if (!this.withCfg) {
              throw new Error(
                'withCfg 未注入：构造 PublishQueue 必须注入 withCfg（apps/server/src/app.ts:100 setWithCfg）',
              )
            }
            await this.withCfg(async (cfg) => {
              const proj = cfg.projects.find((p) => p.id === task.projectId)
              if (proj) (proj as import('@bxverse/shared').ProjectDef).lastQuickPublish = snapshot
              return cfg
            })
          } catch {
            // 绝不影响发布主流程
          }
          // 2) R29 webhook done 通知
          try {
            const cfg = await store.loadAppConfig()
            const data = e.data as { version?: string; failedRepos?: string[] } | undefined
            const version = data?.version ?? task.releaseId ?? ''
            const failedRepos = data?.failedRepos ?? task.failedRepos ?? []
            await dispatchWebhooks(cfg, 'done', { projectId: task.projectId, version, failedRepos })
          } catch {
            // 绝不影响发布主流程
          }
        })()
      } else if (e.type === 'error') {
        task.status = 'failed'
        task.finishedAt = new Date().toISOString()
        void (async () => {
          try {
            const cfg = await store.loadAppConfig()
            const data = e.data as { version?: string; failedRepos?: string[] } | undefined
            const version = data?.version ?? ''
            const failedRepos = data?.failedRepos ?? []
            await dispatchWebhooks(cfg, 'error', {
              projectId: task.projectId,
              version,
              failedRepos,
            })
          } catch {
            // 绝不影响发布主流程
          }
        })()
      }
    }
    try {
      const result = await engine.executePublish(req, { onEvent: push, taskId: task.taskId })
      if (task.status === 'running') {
        // 引擎未发终帧（异常兜底）：补发 error
        const e: PublishEvent = {
          type: 'error',
          message: '发布异常结束',
          data: { failedRepos: result.failedRepos },
        }
        push(e)
      }
    } catch (e) {
      const err: PublishEvent = {
        type: 'error',
        message: `发布失败: ${(e as Error).message}`,
      }
      push(err)
    } finally {
      this.sse.finishTask(task.taskId)
    }
  }
}

function stamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`
}
