// apps/server/src/sse.ts
// SSE 连接管理：text/event-stream、15s 心跳、断线快照、任务结束自动关闭

import type { ServerResponse } from 'node:http'
import type { PublishEvent } from '@bxverse/shared'

export interface SseClient {
  res: ServerResponse
  taskId: string | null
  heartbeat: NodeJS.Timeout
  closed: boolean
}

export class SseHub {
  private clients = new Set<SseClient>()
  private closing = new Map<string, NodeJS.Timeout>()

  /** 订阅任务事件流；返回客户端句柄（首帧 retry 已写入） */
  subscribe(res: ServerResponse, taskId: string | null, replay: PublishEvent[]): SseClient {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    res.write('retry: 3000\n\n')
    const client: SseClient = {
      res,
      taskId,
      heartbeat: setInterval(() => {
        if (!client.closed) res.write(': ping\n\n')
      }, 15_000),
      closed: false,
    }
    this.clients.add(client)
    res.on('close', () => this.remove(client))
    // 快照：重放缓冲事件（连接建立即补发，断线重连不丢事件）
    // S4: 重放时校验 seq 连续性，缺口时首帧附 {truncated:true}
    const normalized = this.normalizeReplay(replay)
    for (const e of normalized) this.sendTo(client, e)
    return client
  }

  private normalizeReplay(replay: PublishEvent[]): PublishEvent[] {
    if (replay.length === 0) return replay
    let needTruncated = false
    // 已被调用方标注的 truncated（data.truncated）视为已截断
    const firstData = replay[0].data as Record<string, unknown> | undefined
    if (firstData && (firstData as { truncated?: unknown }).truncated === true) return replay
    for (let i = 1; i < replay.length; i++) {
      const prev = replay[i - 1].seq
      const cur = replay[i].seq
      if (typeof prev === 'number' && typeof cur === 'number' && cur !== prev + 1) {
        needTruncated = true
        break
      }
    }
    if (!needTruncated && typeof replay[0].seq === 'number' && replay[0].seq !== 1) needTruncated = true
    if (!needTruncated) return replay
    const copy = [...replay]
    const first = copy[0]
    const base = first.data && typeof first.data === 'object' && !Array.isArray(first.data)
      ? (first.data as Record<string, unknown>)
      : {}
    copy[0] = { ...first, data: { ...base, truncated: true } } as PublishEvent
    return copy
  }

  broadcast(taskId: string, event: PublishEvent): void {
    for (const c of this.clients) {
      if (!c.closed && (c.taskId === null || c.taskId === taskId)) this.sendTo(c, event)
    }
  }

  /** 任务结束：广播终帧后 2s 关闭该任务的全部订阅（重连只会拿到最终快照） */
  finishTask(taskId: string): void {
    const existing = this.closing.get(taskId)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(() => {
      for (const c of this.clients) {
        if (!c.closed && c.taskId === taskId) {
          c.closed = true
          clearInterval(c.heartbeat)
          c.res.end()
          this.clients.delete(c)
        }
      }
      this.closing.delete(taskId)
    }, 2000)
    this.closing.set(taskId, timer)
  }

  closeAll(): void {
    for (const c of this.clients) {
      c.closed = true
      try {
        c.res.end()
      } catch {
        // ignore
      }
    }
    this.clients.clear()
    for (const t of this.closing.values()) clearTimeout(t)
    this.closing.clear()
  }

  private sendTo(client: SseClient, event: PublishEvent): void {
    if (client.closed) return
    try {
      client.res.write(`event: publish\ndata: ${JSON.stringify(event)}\n\n`)
    } catch {
      this.remove(client)
    }
  }

  private remove(client: SseClient): void {
    clearInterval(client.heartbeat)
    this.clients.delete(client)
  }
}
