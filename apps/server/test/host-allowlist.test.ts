// apps/server/test/host-allowlist.test.ts
// F4 · Host 头校验封堵 DNS rebinding（optimization-plan F4）
// 现状：apps/server/src/http/auth.ts isHostAllowed + apps/server/src/app.ts:148-157
//   - 在 HTTP 入口管线最前面（auth 之前）校验 Host
//   - 不匹配返回 403 + Connection: close + finish 时 destroy socket
//   - 白名单：localhost / 127.0.0.1 / [::1] + AppConfig 配置的 host
//   - 空 Host 直接拒绝
//
// 本测试用 Node http.request 底层调用（fetch 不允许自定义 Host forbidden header）。

import http from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { isHostAllowed } from '../src/http/auth'

let port = 0

beforeAll(async () => {
  const app = createApp()
  port = await app.start(0, '127.0.0.1')
})

afterAll(async () => {
  // 用 start 时拿到的 port 反查 server 不方便；createApp 内部维护实例，
  // 此处通过关闭监听释放端口——为避免耦合，依赖 vitest 进程退出释放。
})

interface RawResp {
  status: number
  body: string
  connection: string | undefined
}

function rawRequest(hostHeader: string, path: string): Promise<RawResp> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path,
        method: 'GET',
        headers: { Host: hostHeader },
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
            connection: res.headers.connection,
          })
        })
        res.on('error', () => {
          // 服务端在 finish 后 destroy socket，客户端可能收到 ECONNRESET；
          // 但 promise 已在 'end' 中 resolve，无需处理
        })
      },
    )
    req.on('error', (e) => {
      // 服务端 destroy 后客户端可能 ECONNRESET；此场景下 'end' 通常已触发过
      if ((e as NodeJS.ErrnoException).code === 'ECONNRESET') return
      reject(e)
    })
    req.end()
  })
}

describe('F4 · Host 头白名单（DNS rebinding 封堵）', () => {
  it('evil.com Host → 403 FORBIDDEN + Connection: close', async () => {
    const res = await rawRequest('evil.com', '/api/health')
    expect(res.status).toBe(403)
    expect(res.connection).toBe('close')
    const body = JSON.parse(res.body) as { error: string; code: string }
    expect(body.code).toBe('FORBIDDEN')
    expect(body.error).toMatch(/Host/)
  })

  it('外网 host 含端口（如 attacker.io:9999）→ 403', async () => {
    const res = await rawRequest('attacker.io:9999', '/api/health')
    expect(res.status).toBe(403)
  })

  it('空 Host → 403', async () => {
    // HTTP/1.1 协议栈必填 Host，Node http.request 不允许真发空 Host
    // → 改用 isHostAllowed 单元测试覆盖防御分支
    expect(isHostAllowed(undefined, undefined)).toBe(false)
    expect(isHostAllowed('', undefined)).toBe(false)
  })

  it('isHostAllowed 单元：configured host 放行（含端口）', () => {
    expect(isHostAllowed('evil.com:9999', 'lan.local:7777')).toBe(false)
    expect(isHostAllowed('lan.local:7777', 'lan.local:7777')).toBe(true)
    expect(isHostAllowed('lan.local', 'lan.local:7777')).toBe(true)
  })

  it('localhost:port → 200 健康检查通过', async () => {
    const res = await rawRequest(`localhost:${port}`, '/api/health')
    expect(res.status).toBe(200)
    const body = JSON.parse(res.body) as { ok: boolean }
    expect(body.ok).toBe(true)
  })

  it('127.0.0.1:port → 200 健康检查通过', async () => {
    const res = await rawRequest(`127.0.0.1:${port}`, '/api/health')
    expect(res.status).toBe(200)
  })

  it('GET /api/config 路径同样受 Host 校验（拿不到 token）', async () => {
    // 即便 GET /api/config 是 bootstrap 路径，恶意 Host 仍被前置校验拦截
    const res = await rawRequest('evil.com', '/api/config')
    expect(res.status).toBe(403)
    const body = JSON.parse(res.body) as { code: string }
    expect(body.code).toBe('FORBIDDEN')
  })

  it('合法 Host 拿 GET /api/config 可得 token', async () => {
    const res = await rawRequest(`127.0.0.1:${port}`, '/api/config')
    expect(res.status).toBe(200)
    const body = JSON.parse(res.body) as { token: string }
    expect(typeof body.token).toBe('string')
    expect(body.token.length).toBeGreaterThan(0)
  })
})
