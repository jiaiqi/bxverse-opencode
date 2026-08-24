// apps/server/src/notifications.ts
// R29 发布 webhook 通知：适配钉钉/企微/飞书 Incoming webhook POST
// 零第三方依赖，基于 node:http / node:https，超时 5s，重试 1 次，结果记 structuredLog

import http from 'node:http'
import https from 'node:https'
import type { AppConfig } from '@bxverse/shared'
import { logger } from '@bxverse/core'

export interface WebhookPayload {
  event: 'done' | 'error'
  projectId: string
  version: string
  failedRepos: string[]
  timestamp: string
}

const TIMEOUT_MS = 5000

function isHttpsUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr)
    if (u.protocol === 'https:') return true
    // 本地回环 http 放行，便于 stub server 测试
    if (u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost' || u.hostname === '::1' || u.hostname === '[::1]')) {
      return true
    }
    return false
  } catch {
    return false
  }
}

export function validateWebhooks(webhooks: unknown): void {
  if (!Array.isArray(webhooks)) throw new Error('webhooks 必须为数组')
  const ids = new Set<string>()
  for (const raw of webhooks) {
    if (typeof raw !== 'object' || raw === null) throw new Error('webhook 元素必须为对象')
    const w = raw as Record<string, unknown>
    const id = String(w.id ?? '').trim()
    if (!id) throw new Error('webhook id 必填且为非空字符串')
    if (ids.has(id)) throw new Error(`webhook id 重复: ${id}`)
    ids.add(id)
    const url = String(w.url ?? '').trim()
    if (!url) throw new Error(`webhook ${id} url 必填`)
    if (!isHttpsUrl(url)) throw new Error(`webhook ${id} url 必须为 https 链接（本地回环 http 放行）`)
    const events = w.events
    if (!Array.isArray(events) || events.length === 0) throw new Error(`webhook ${id} events 必须为非空数组`)
    for (const e of events) {
      if (e !== 'done' && e !== 'error') throw new Error(`webhook ${id} events 仅支持 done/error，非法: ${String(e)}`)
    }
    if (typeof w.enabled !== 'boolean') throw new Error(`webhook ${id} enabled 必须为布尔`)
  }
}

async function postJson(urlStr: string, body: string): Promise<boolean> {
  return new Promise((resolve) => {
    let url: URL
    try {
      url = new URL(urlStr)
    } catch {
      resolve(false)
      return
    }
    const isHttps = url.protocol === 'https:'
    const lib = isHttps ? https : http
    const req = lib.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        // 消费响应避免挂起
        res.resume()
        const ok = res.statusCode != null && res.statusCode >= 200 && res.statusCode < 300
        resolve(!!ok)
      },
    )
    req.on('error', () => resolve(false))
    req.on('timeout', () => {
      req.destroy()
      resolve(false)
    })
    req.write(body)
    req.end()
  })
}

async function sendWithRetry(url: string, payload: WebhookPayload, id: string): Promise<void> {
  const body = JSON.stringify(payload)
  let ok = await postJson(url, body)
  if (!ok) {
    // 重试 1 次
    ok = await postJson(url, body)
  }
  if (ok) {
    logger.structuredLog('info', `webhook 通知成功: ${id}`, { webhookId: id, event: payload.event, url })
  } else {
    logger.structuredLog('warn', `webhook 通知失败: ${id}`, { webhookId: id, event: payload.event, url })
  }
}

export async function dispatchWebhooks(
  cfg: AppConfig,
  event: 'done' | 'error',
  info: { projectId: string; version: string; failedRepos: string[] },
): Promise<void> {
  const webhooks = cfg.notifications?.webhooks?.filter((w) => w.enabled && w.events.includes(event)) ?? []
  if (webhooks.length === 0) return
  const timestamp = new Date().toISOString()
  const payload: WebhookPayload = {
    event,
    projectId: info.projectId,
    version: info.version,
    failedRepos: info.failedRepos ?? [],
    timestamp,
  }
  // 逐条 POST，单条失败不影响其他与主流程
  for (const wh of webhooks) {
    try {
      await sendWithRetry(wh.url, payload, wh.id)
    } catch (e) {
      // 防御：绝不抛至主流程
      try {
        logger.structuredLog('warn', `webhook 异常: ${wh.id} ${(e as Error).message}`, { webhookId: wh.id, event })
      } catch {
        // ignore
      }
    }
  }
}
