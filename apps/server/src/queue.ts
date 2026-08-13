// apps/server/src/queue.ts
// 发布单队列：同时最多 1 个任务；忙时 TASK_BUSY；事件缓冲供 SSE 快照

import type { PublishEvent, PublishRequest } from '@bxverse/shared'
import { engine } from '@bxverse/core'
import { apiError } from './http/json'
import type { SseHub } from './sse'

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
}

export class PublishQueue {
  current: TaskState | null = null

  constructor(private sse: SseHub) {}

  get running(): boolean {
    return this.current?.status === 'running'
  }

  /** 当前运行中任务锁定的项目（项目定义变更 409 用） */
  get lockedProjectId(): string | null {
    return this.running ? this.current!.projectId : null
  }

  /** 提交任务：忙 → 409 TASK_BUSY；空闲 → 立即异步执行并返回 taskId */
  async submit(req: PublishRequest): Promise<string> {
    if (this.running) {
      throw apiError(409, 'TASK_BUSY', '已有发布任务在执行，请稍后再试')
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
    // 异步执行（不 await，避免阻塞 HTTP 响应）
    void this.run(task, req)
    return taskId
  }

  private async run(task: TaskState, req: PublishRequest): Promise<void> {
    const push = (e: PublishEvent) => {
      if (task.events.length < MAX_BUFFERED) task.events.push(e)
      this.sse.broadcast(task.taskId, e)
      if (e.type === 'done') {
        task.status = 'done'
        task.finishedAt = new Date().toISOString()
        task.releaseId = (e.data as { releaseId?: string | null } | undefined)?.releaseId ?? null
        task.failedRepos = ((e.data as { failedRepos?: string[] } | undefined)?.failedRepos ?? [])
      } else if (e.type === 'error') {
        task.status = 'failed'
        task.finishedAt = new Date().toISOString()
      }
    }
    try {
      const result = await engine.executePublish(req, { onEvent: push })
      if (task.status === 'running') {
        // 引擎未发终帧（异常兜底）：补发 error
        const e: PublishEvent = { type: 'error', message: '发布异常结束', data: { failedRepos: result.failedRepos } }
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
