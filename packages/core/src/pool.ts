// packages/core/src/pool.ts
// 并发池工具（零依赖）——供 engine 发布并发与 server 轮询共享

/**
 * 并发池调度（allSettled 语义：单项失败不中断其余项）
 * @param items  待处理项
 * @param limit  并发上限（<=1 时串行）
 * @param fn     处理函数
 */
export async function runWithPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  if (items.length === 0) return
  if (limit <= 1) {
    for (const item of items) {
      try {
        await fn(item)
      } catch {
        // 保持 allSettled 语义，忽略单项错误
      }
    }
    return
  }
  const queue = [...items]
  const workerCount = Math.min(limit, items.length)
  const workers = Array.from({ length: workerCount }, async () => {
    while (queue.length > 0) {
      const item = queue.shift()!
      try {
        await fn(item)
      } catch {
        // 单项失败不影响池内其余任务
      }
    }
  })
  await Promise.all(workers)
}
