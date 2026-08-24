// apps/server/test/withCfg.test.ts
// 并发写互斥 withCfg 单测：20 并发递增同一计数器字段，终值=20
import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app'

describe('withCfg 并发互斥', () => {
  it('并发 20 个 withCfg 各自递增 pollInterval，终值=基准+20', async () => {
    const app = createApp()

    // 初始化为确定基准，避免受既有 BX_HOME 残留影响
    await app.ctx.withCfg(async (cfg) => {
      cfg.pollInterval = 10000
      return cfg.pollInterval
    })
    const base = (await app.ctx.loadCfg()).pollInterval
    expect(base).toBe(10000)

    const tasks = Array.from({ length: 20 }, () =>
      app.ctx.withCfg(async (cfg) => {
        // 模拟异步读-改-写间隙，若无互斥会丢更新
        const cur = cfg.pollInterval
        await new Promise<void>((r) => setTimeout(r, 5))
        cfg.pollInterval = cur + 1
        return cfg.pollInterval
      }),
    )

    const results = await Promise.all(tasks)
    // 每个任务返回递增后的值，应为 10001..10020 无重复丢更新
    expect(results).toHaveLength(20)
    const sorted = [...results].sort((a, b) => a - b)
    expect(sorted[0]).toBe(10001)
    expect(sorted[19]).toBe(10020)

    const finalCfg = await app.ctx.loadCfg()
    expect(finalCfg.pollInterval).toBe(10020)
  })

  it('withCfg 串行返回结果且错误不阻塞后续', async () => {
    const app = createApp()
    await app.ctx.withCfg(async (cfg) => {
      cfg.pollInterval = 20000
    })

    const failing = app.ctx.withCfg(async () => {
      throw new Error('intentional')
    })
    await expect(failing).rejects.toThrow('intentional')

    // 后续仍可执行
    const ok = await app.ctx.withCfg(async (cfg) => {
      cfg.pollInterval += 1
      return cfg.pollInterval
    })
    expect(ok).toBe(20001)
    const final = (await app.ctx.loadCfg()).pollInterval
    expect(final).toBe(20001)
  })

  it('只读 loadCfg 不经互斥可并发', async () => {
    const app = createApp()
    const reads = await Promise.all(Array.from({ length: 10 }, () => app.ctx.loadCfg()))
    expect(reads.every((c) => typeof c.pollInterval === 'number')).toBe(true)
  })
})
