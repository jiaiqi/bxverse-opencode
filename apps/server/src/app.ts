// apps/server/src/app.ts
// 应用组装：鉴权链 → API 路由 → 静态托管；暴露 createApp 供 index.ts 与测试复用

import http from 'node:http'
import type { AppConfig } from '@bxverse/shared'
import { store } from '@bxverse/core'
import { Router } from './http/router'
import { authenticate, timingSafeCompare } from './http/auth'
import { sendError } from './http/json'
import { serveStatic } from './http/static'
import { SseHub } from './sse'
import { PublishQueue } from './queue'
import { PollCache } from './poll'
import { register as registerConfig } from './api/config'
import { register as registerAuthApi, rotateToken } from './api/auth'
import { register as registerProjects } from './api/projects'
import { register as registerRepos } from './api/repos'
import { register as registerFiles } from './api/files'
import { register as registerHistory } from './api/history'
import { register as registerPublish } from './api/publish'
import { register as registerEvents } from './api/events'
import { register as registerSync } from './api/sync'
import { register as registerOverview } from './api/overview'
import { register as registerVersions } from './api/versions'
import { register as registerBackups } from './api/backups'
import { register as registerAi } from './api/ai'
import { register as registerGit } from './api/git'

export interface App {
  server: http.Server
  ctx: {
    loadCfg: () => Promise<AppConfig>
    saveCfg: (cfg: AppConfig) => Promise<void>
    getToken: () => string
    rotateToken: () => Promise<string>
    queue: PublishQueue
    sse: SseHub
    poll: PollCache
    dataStore: store.DataStore
    checkToken: (provided: string) => boolean
  }
  start(port: number, host: string): Promise<number>
  stop(): Promise<void>
}

export function createApp(opts: { token?: string } = {}): App {
  let token = opts.token ?? ''
  let boundHost = '127.0.0.1'
  const ensureToken = async (): Promise<void> => {
    if (token) return
    const cred = await store.loadCredentials()
    token = cred.token || store.generateToken()
    if (!cred.token) {
      cred.token = token
      await store.saveCredentials(cred)
    }
  }

  const sse = new SseHub()
  const queue = new PublishQueue(sse)
  const cfgHolder: { current: AppConfig | null } = { current: null }
  let dataStore: store.DataStore | null = null
  const loadCfg = async (): Promise<AppConfig> => {
    cfgHolder.current = await store.loadAppConfig()
    // 数据仓库目录跟随配置（可在 app.json 中定制）
    if (!dataStore || dataStore.dataDir !== cfgHolder.current.dataDir) {
      dataStore = new store.DataStore({ dataDir: cfgHolder.current.dataDir })
      registerHistoryServices.dataStore = dataStore
      registerSyncServices.dataStore = dataStore
      registerOverviewServices.dataStore = dataStore
    }
    return cfgHolder.current
  }
  const saveCfg = async (cfg: AppConfig): Promise<void> => {
    await store.saveAppConfig(cfg)
    cfgHolder.current = cfg
  }
  const poll = new PollCache(() => cfgHolder.current?.pollInterval ?? 30_000)
  const rotate = async (): Promise<string> => {
    const next = await rotateToken()
    token = next
    sse.closeAll()
    return next
  }

  // 服务引用（dataStore 懒初始化后回填）
  const registerHistoryServices = { loadCfg, lockedProjectId: () => queue.lockedProjectId, dataStore: null as unknown as store.DataStore }
  const registerSyncServices = { dataStore: null as unknown as store.DataStore }
  const registerOverviewServices = { loadCfg, poll, dataStore: null as unknown as store.DataStore }

  const router = new Router()
  // 健康检查（免 token，供 CLI status 使用）
  router.get('/api/health', async (ctx) => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    let version = '0.0.0'
    try {
      const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as { version?: string }
      version = pkg.version ?? '0.0.0'
    } catch {
      // ignore
    }
    const { sendJson } = await import('./http/json')
    sendJson(ctx.res, 200, { ok: true, version })
  })
  registerConfig(router, { loadCfg, saveCfg, getToken: () => token })
  registerAuthApi(router, { rotateToken: rotate })
  registerProjects(router, { loadCfg, saveCfg, lockedProjectId: () => queue.lockedProjectId })
  registerRepos(router, { loadCfg, saveCfg, lockedProjectId: () => queue.lockedProjectId, poll })
  registerFiles(router, { loadCfg })
  registerHistory(router, registerHistoryServices)
  registerPublish(router, { loadCfg, queue })
  registerEvents(router, { queue, sse })
  registerSync(router, registerSyncServices)
  registerOverview(router, registerOverviewServices)
  registerVersions(router, { loadCfg, poll })
  registerBackups(router, { loadCfg, getDataStore: () => dataStore as store.DataStore })
  registerAi(router, { loadCfg, saveCfg })
  registerGit(router, { loadCfg })

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const pathname = url.pathname
    try {
      await ensureToken()
      if (pathname.startsWith('/api/')) {
        const method = req.method ?? 'GET'
        const skipToken = pathname === '/api/health' && method === 'GET'
        // Config bootstrap is intentionally available before the browser has a token.
        // The server warns when bound beyond loopback; protected mutations still require the token.
        const allowBootstrap = pathname === '/api/config' && method === 'GET'
        authenticate(req, { token }, { skipToken: skipToken || allowBootstrap })
        await router.dispatch(req, res, pathname)
        return
      }
      if (req.method === 'GET' || req.method === 'HEAD') {
        serveStatic(res, pathname)
        return
      }
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Method Not Allowed')
    } catch (e) {
      sendError(res, e)
    }
  })

  const app: App = {
    server,
    ctx: {
      loadCfg,
      saveCfg,
      getToken: () => token,
      rotateToken: rotate,
      queue,
      sse,
      poll,
      get dataStore(): store.DataStore {
        if (!dataStore) throw new Error('数据仓库尚未初始化（loadCfg 之后可用）')
        return dataStore
      },
      checkToken: (provided: string) => timingSafeCompare(provided, token),
    },
    start: async (port: number, host: string) =>
      new Promise<number>((resolve, reject) => {
        boundHost = host
        server.once('error', reject)
        server.listen(port, host, () => {
          server.off('error', reject)
          const addr = server.address()
          resolve(typeof addr === 'object' && addr ? addr.port : port)
        })
      }),
    stop: async () => {
      sse.closeAll()
      await new Promise<void>((resolve) => {
        server.close(() => resolve())
        server.closeAllConnections?.()
      })
    },
  }
  return app
}
