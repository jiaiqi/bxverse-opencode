// 临时调试脚本：复现 rotate 后 401
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

process.env.BX_HOME = mkdtempSync(path.join(tmpdir(), 'bxverse-debug-'))

const { createApp } = await import('./src/app')

const app = createApp()
const port = await app.start(0, '127.0.0.1')
const base = `http://127.0.0.1:${port}`

const get = async (p: string, token?: string) => {
  const res = await fetch(`${base}${p}`, { headers: token ? { 'X-BX-Token': token } : {} })
  return { status: res.status, body: await res.json().catch(() => null) }
}
const post = async (p: string, body: unknown, token: string) => {
  const res = await fetch(`${base}${p}`, {
    method: 'POST',
    headers: { 'X-BX-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

const init = await get('/api/config')
const t1 = init.body.token
console.log('init token:', t1)
console.log('server getToken:', app.ctx.getToken())

const rotate = await post('/api/auth/rotate', {}, t1)
console.log('rotate:', rotate.status, rotate.body)
const t2 = rotate.body.token
console.log('server getToken after rotate:', app.ctx.getToken())
console.log('client t2 === server:', t2 === app.ctx.getToken())

const create = await post('/api/projects', { name: 'x' }, t2)
console.log('create with t2:', create.status, create.body)

await app.stop()
