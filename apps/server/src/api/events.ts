// apps/server/src/api/events.ts
// GET /api/events?task= —— SSE 事件流（发布实时控制台）
// S4: 支持历史任务回放（journal 持久化 + 截断标记）

import type { PublishEvent } from '@bxverse/shared'
import type { Ctx } from '../http/router'
import { apiError } from '../http/json'
import type { PublishQueue } from '../queue'
import type { SseHub } from '../sse'

export function register(
  router: import('../http/router').Router,
  services: { queue: PublishQueue; sse: SseHub },
): void {
  router.get('/api/events', async (ctx: Ctx) => {
    const taskId = ctx.query.get('task') || null

    // 校验任务存在性（支持历史任务）
    let target: ReturnType<PublishQueue['getTask']> | null = null
    if (taskId) {
      target = services.queue.getTask(taskId) ?? null
      if (!target) throw apiError(404, 'NOT_FOUND', `任务不存在或已过期: ${taskId}`)
    } else {
      target = services.queue.current
    }

    // 快照重放：经 queue.getReplay 校验 seq 连续性，缺口首帧附 truncated:true
    const replay: PublishEvent[] = services.queue.getReplay(taskId)

    // 连接建立快照：任务已结束 → 补发终帧（由重放承担），2s 后关闭
    services.sse.subscribe(ctx.res, taskId, replay)
    if (target && target.status !== 'running') {
      services.sse.finishTask(target.taskId)
    } else if (!taskId && !target) {
      // 无任务时的空订阅，无需 finish
    }
  })
}
