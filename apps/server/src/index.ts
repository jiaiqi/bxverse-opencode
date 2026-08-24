// apps/server/src/index.ts
// 进程入口：启动序列 + 轮询定时器 + SIGINT/SIGTERM 优雅退出

import { logger, store } from '@bxverse/core'
import { JournalStore } from '@bxverse/core'
import { createApp } from './app'

const log = (...args: unknown[]) => console.log('[bxverse]', ...args)

async function main(): Promise<void> {
  // 1. 配置（store 导入时已按 BX_HOME 确保目录）
  const cfg = await store.loadAppConfig()
  const port = Number(process.env.BX_PORT) || cfg.port
  const host = cfg.host || '127.0.0.1'

  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
    log(`⚠ 安全警告：服务将绑定非回环地址 ${host}，任何能访问该地址的机器都可访问管理台（请勿在不可信网络使用）`)
  }

  // 2. 数据仓库 + 中断任务扫描
  const dataStore = new store.DataStore({ dataDir: cfg.dataDir })
  await dataStore.ensureDataRepo()
  const journalStore = new JournalStore()
  const interrupted = journalStore.scanInterrupted()
  if (interrupted.length) {
    log(`⚠ 检测到 ${interrupted.length} 个中断的发布任务（${interrupted.map(j => j.taskId).join(', ')}），可重新发起同项目发布续跑`)
  }

  // 3. 启动 HTTP
  const app = createApp()
  await app.start(port, host)
  log(`BX 版本管理台已启动: http://${host}:${port}`)
  log(`数据目录: ${store.APP_DIR}`)

  // 4. 轮询定时器（发布执行中跳过该任务锁定项目）
  const tick = async (): Promise<void> => {
    try {
      const current = await app.ctx.loadCfg()
      await app.ctx.poll.refreshAll(current.projects, app.ctx.queue.lockedProjectId)
    } catch (e) {
      log(`轮询失败: ${(e as Error).message}`)
    }
  }
  void tick()
  const timer = setInterval(() => void tick(), Math.max(cfg.pollInterval, 5000))

  // 5. 优雅退出
  const shutdown = async (signal: string): Promise<void> => {
    log(`收到 ${signal}，正在关闭…`)
    clearInterval(timer)
    await app.stop()
    log('服务已关闭')
    process.exit(0)
  }
  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))

  // 未处理的 Promise 拒绝：记日志不退出（S1）
  process.on('unhandledRejection', (reason) => {
    const msg = reason instanceof Error ? reason.message : String(reason)
    try {
      logger.structuredLog('error', `unhandledRejection: ${msg}`, { reason: String(reason) })
    } catch {
      // ignore logger failure
    }
    console.error('[bxverse] unhandledRejection:', reason)
  })

  // 端口占用等启动错误提示
  process.on('uncaughtException', (e) => {
    if ((e as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      console.error(`[bxverse] ✗ 端口 ${port} 已被占用，可用环境变量 BX_PORT 指定其他端口`)
      process.exit(1)
    }
    console.error(`[bxverse] 未预期错误:`, e)
    process.exit(1)
  })
}

main().catch((e) => {
  console.error(`[bxverse] 启动失败: ${(e as Error).message}`)
  process.exit(1)
})
