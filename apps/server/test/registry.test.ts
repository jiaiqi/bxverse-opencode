// R33 阶段 2 · 仓库注册表 + attach/detach 端到端契约
// 隔离 BX_HOME 起 app：验证 GET/PUT registry、attach 迁移语义（内嵌→refs）、
// detach、展开生效（GET /api/projects 返回物化 repos）、边界（404/400）

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Server } from 'node:http'
import type { AppConfig, ProjectDef } from '@bxverse/shared'
import { store as coreStore, ensureDirs } from '@bxverse/core'
import { createApp } from '../src/app'

let server: Server
let port: number
let token: string
let base: string

async function req(
  method: string,
  p: string,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${base}${p}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-bx-token': token },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

beforeAll(async () => {
  const home = mkdtempSync(path.join(tmpdir(), 'bx-registry-'))
  process.env.BX_HOME = home
  ensureDirs()
  const base0 = await coreStore.loadAppConfig()
  const cfg: AppConfig = {
    ...base0,
    projects: [
      {
        id: 'p_main',
        name: '主产品线',
        version: 'v1.0.0',
        bump: 'auto',
        repoVersionScheme: 'hybrid',
        externalExclude: [],
        repos: [
          { id: 'r_app', name: 'web-app', path: '/repo/web-app', displayName: '前端' },
          { id: 'r_api', name: 'api-server', path: '/repo/api' },
        ],
      },
      {
        id: 'p_gray',
        name: '灰度线',
        version: 'v0.8.0',
        bump: 'auto',
        repoVersionScheme: 'hybrid',
        externalExclude: [],
        repos: [{ id: 'r_gray_app', name: 'web-app', path: '/repo/web-app' }],
      },
    ],
  }
  await coreStore.saveAppConfig(cfg)
  fs.writeFileSync(path.join(cfg.dataDir, '.keep'), '')

  const app = createApp()
  await app.start(0, '127.0.0.1')
  server = app.server
  const addr = server.address()
  port = typeof addr === 'object' && addr ? addr.port : 0
  base = `http://127.0.0.1:${port}`
  const cfgRes = await fetch(`${base}/api/config`)
  token = ((await cfgRes.json()) as { token: string }).token
}, 30_000)

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe('R33 · 仓库注册表与挂载', () => {
  it('GET 初始为空注册表', async () => {
    const r = await req('GET', '/api/repos-registry')
    expect(r.status).toBe(200)
    expect(r.body.registry).toEqual([])
  })

  it('PUT 写入并回读（非法条目 400 / id 重复 400）', async () => {
    const bad = await req('PUT', '/api/repos-registry', {
      registry: [{ id: '', name: 'x', path: '/x' }],
    })
    expect(bad.status).toBe(400)
    const dup = await req('PUT', '/api/repos-registry', {
      registry: [
        { id: 'r_a', name: 'a', path: '/a' },
        { id: 'r_a', name: 'b', path: '/b' },
      ],
    })
    expect(dup.status).toBe(400)
    const ok = await req('PUT', '/api/repos-registry', {
      registry: [{ id: 'r_ext', name: 'ext-repo', path: '/repo/ext' }],
    })
    expect(ok.status).toBe(200)
    expect(ok.body.registry).toHaveLength(1)
  })

  it('attach 按 path：内嵌仓库迁移进注册表，两项目共享同一 registry id', async () => {
    const r = await req('POST', '/api/projects/p_gray/repos/attach', {
      path: '/repo/api',
      name: 'api-server',
    })
    expect(r.status).toBe(200)
    const proj = r.body as ProjectDef
    expect(proj.repoRefs).toHaveLength(2)

    // 注册表：web-app 与 api-server 均已注册（灰度线的 r_gray_app 与主产品线 r_app 同 path 归并）
    const reg = (await req('GET', '/api/repos-registry')).body.registry as Array<{
      id: string
      path: string
    }>
    const apiEntry = reg.find((x) => x.path === '/repo/api')
    expect(apiEntry).toBeDefined()
    // 灰度线挂载的就是主产品线同款 api 条目（path 归并复用）
    expect(proj.repoRefs).toContain(apiEntry!.id)

    // GET /api/projects 返回物化 repos（展开语义）
    const projects = (await req('GET', '/api/projects')).body as ProjectDef[]
    const gray = projects.find((p) => p.id === 'p_gray')!
    expect(gray.repos.map((x) => x.path).sort()).toEqual(['/repo/api', '/repo/web-app'])
  })

  it('attach 后同项目重复挂载幂等', async () => {
    const r = await req('POST', '/api/projects/p_gray/repos/attach', { path: '/repo/api' })
    expect(r.status).toBe(200)
    expect((r.body as ProjectDef).repoRefs).toHaveLength(2)
  })

  it('detach 按 path：移除挂载但注册表保留', async () => {
    const r = await req('POST', '/api/projects/p_gray/repos/detach', { path: '/repo/api' })
    expect(r.status).toBe(200)
    expect((r.body as ProjectDef).repoRefs).toHaveLength(1)
    const reg = (await req('GET', '/api/repos-registry')).body.registry as unknown[]
    expect(reg.length).toBeGreaterThanOrEqual(2)
    const projects = (await req('GET', '/api/projects')).body as ProjectDef[]
    expect(projects.find((p) => p.id === 'p_gray')!.repos.map((x) => x.path)).toEqual([
      '/repo/web-app',
    ])
  })

  it('边界：未知项目 404 / 未知 repoId 404 / 空 body 400', async () => {
    expect((await req('POST', '/api/projects/p_none/repos/attach', { path: '/x' })).status).toBe(
      404,
    )
    expect(
      (await req('POST', '/api/projects/p_main/repos/attach', { repoId: 'r_ghost' })).status,
    ).toBe(404)
    expect((await req('POST', '/api/projects/p_main/repos/attach', {})).status).toBe(400)
    expect((await req('POST', '/api/projects/p_main/repos/detach', {})).status).toBe(400)
  })
})
