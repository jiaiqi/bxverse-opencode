// apps/server/src/api/events.ts
// GET /api/events?task= —— SSE 事件流（发布实时控制台）

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
    const cur = services.queue.current

    if (taskId && cur?.taskId !== taskId) {
      throw apiError(404, 'NOT_FOUND', `任务不存在或已过期: ${taskId}`)
    }

    const replay: PublishEvent[] = []
    if (cur && (taskId === null || cur.taskId === taskId)) {
      replay.push(...cur.events)
    }
    // 连接建立快照：任务已结束 → 补发终帧（由重放承担），2s 后关闭
    services.sse.subscribe(ctx.res, taskId, replay)
    if (cur && (taskId === null || cur.taskId === taskId) && cur.status !== 'running') {
      services.sse.finishTask(cur.taskId)
    }
  })
}
