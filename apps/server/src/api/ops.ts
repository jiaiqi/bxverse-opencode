// apps/server/src/api/ops.ts
// GET /api/ops/process —— 进程指标（自举版本 / 内存 / uptime / BX_HOME 路径）
// GET /api/ops/logs?level=info|warn|error|all —— 今日引擎日志流（30 天滚动文件）

import fs from 'node:fs'
import path from 'node:path'
import type { Ctx } from '../http/router'
import { sendJson } from '../http/json'
import { resolveHome } from '@bxverse/core'

function selfVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8')) as { version?: string }
    return pkg.version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

function memMB(): number {
  const m = process.memoryUsage()
  return Math.round(m.rss / 1024 / 1024)
}

function uptimeSec(): number {
  return Math.round(process.uptime())
}

function logFile(): string {
  const day = new Date().toISOString().slice(0, 10)
  return path.join(resolveHome().logsDir, `server-${day}.log`)
}

export function register(router: import('../http/router').Router): void {
  router.get('/api/ops/process', (ctx: Ctx) => {
    sendJson(ctx.res, 200, {
      version: selfVersion(),
      home: resolveHome().root,
      memMB: memMB(),
      uptimeSec: uptimeSec(),
      nodeVersion: process.version,
      platform: process.platform,
      startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
      now: new Date().toISOString(),
    })
  })

  router.get('/api/ops/logs', (ctx: Ctx) => {
    const level = (ctx.query.get('level') ?? 'all').toLowerCase()
    const file = logFile()
    const lines: Array<{ ts: string; level: string; message: string; fields: Record<string, unknown> }> = []
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, 'utf8')
      for (const ln of raw.split('\n')) {
        if (!ln) continue
        try {
          const obj = JSON.parse(ln) as { ts?: string; level?: string; message?: string; [k: string]: unknown }
          const lv = String(obj.level ?? '').toLowerCase()
          if (level !== 'all' && lv !== level) continue
          const { ts, level: lv2, message, ...rest } = obj
          lines.push({ ts: String(ts ?? ''), level: String(lv2 ?? ''), message: String(message ?? ''), fields: rest })
        } catch {
          // 跳过非 JSON 行
        }
      }
    }
    // 末尾倒序（最新在前），最多 500 行
    const recent = lines.slice(-500).reverse()
    sendJson(ctx.res, 200, { file, total: lines.length, lines: recent })
  })
}
