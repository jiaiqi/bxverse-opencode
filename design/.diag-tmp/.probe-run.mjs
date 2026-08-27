// 临时探针：只跑 wizard 场景并输出页面实况（调试用，不进编排器）
import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const SERVER = path.join(ROOT, 'apps', 'server', 'dist', 'index.js')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitHealth(port) {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/health`)
      if (r.ok) return
    } catch { /* retry */ }
    await sleep(500)
  }
  throw new Error('server not ready')
}

const home = mkdtempSync(path.join(tmpdir(), 'bx-probe-'))
const child = spawn(process.execPath, [SERVER], { stdio: 'ignore', cwd: ROOT, env: { ...process.env, BX_HOME: home, BX_PORT: '18999' } })
try {
  await waitHealth('18999')
  execFileSync(process.execPath, ['e2e/prepare-fixture.mjs'], { stdio: 'inherit', cwd: ROOT, env: { ...process.env, BX_BASE: 'http://127.0.0.1:18999' } })
  execFileSync('python', ['e2e/.probe-wiz.py'], { stdio: 'inherit', cwd: ROOT, env: { ...process.env, BX_BASE: 'http://127.0.0.1:18999', PYTHONIOENCODING: 'utf-8' } })
} finally {
  try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }) } catch { /* gone */ }
}
