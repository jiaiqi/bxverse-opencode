// packages/core/src/logger.ts
// 结构化日志（P1-2）：JSON 行，便于检索；兼容现有文本日志

import fs from 'node:fs'
import path from 'node:path'
import { resolveHome } from './home'

export type LogLevel = 'info' | 'warn' | 'error'

export interface LogFields extends Record<string, unknown> {
  traceId?: string
}

function logFile(): string {
  const d = resolveHome().logsDir
  fs.mkdirSync(d, { recursive: true })
  const day = new Date().toISOString().slice(0, 10)
  return path.join(d, `server-${day}.log`)
}

export function structuredLog(level: LogLevel, message: string, fields: LogFields = {}): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    ...fields,
  }
  const line = JSON.stringify(entry) + '\n'
  try {
    fs.appendFileSync(logFile(), line)
  } catch {
    // 降级到 console
    console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](line.trim())
  }
  // 同步输出到控制台（开发可见）
  if (process.env.NODE_ENV !== 'production') {
    console[level === 'error' ? 'error' : 'log'](`[${level}] ${message}`, Object.keys(fields).length ? fields : '')
  }
}
