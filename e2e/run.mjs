// e2e 编排器：隔离 BX_HOME + 端口，依次运行
//   1) resume.mjs（中断续跑，自管理 server 生命周期）
//   2) prepare-fixture.mjs + wizard-flow.py（六步向导，需 Python+Playwright，缺失则跳过并提示）
//   3) onboarding.py（M5-08 首次引导，空 BX_HOME 自动弹出 + 重看，需 Python+Playwright）
// 前置条件：先执行 pnpm build（需要 server 与 web 的产物）。
// 用法：pnpm test:e2e
import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const SERVER = path.join(ROOT, 'apps', 'server', 'dist', 'index.js')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

if (!process.env.BX_PORT) process.env.BX_PORT = '18898'

function fail(msg) {
  console.error(`[e2e] ${msg}`)
  process.exit(1)
}

function run(cmd, args, env) {
  execFileSync(cmd, args, { stdio: 'inherit', cwd: ROOT, env: { ...process.env, ...env } })
}

async function waitHealth(port) {
  const base = `http://127.0.0.1:${port}`
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${base}/api/health`)
      if (r.ok) return base
    } catch {
      /* retry */
    }
    await sleep(500)
  }
  fail(`server 未在端口 ${port} 就绪`)
}

function killTree(child) {
  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    } else {
      child.kill('SIGKILL')
    }
  } catch {
    /* 已退出 */
  }
}

// ── 前置检查 ──
try {
  await fetch('http://127.0.0.1:18898/api/health', { signal: AbortSignal.timeout(300) })
    .then((r) => r.ok)
    .catch(() => false)
    .then((ok) => {
      if (ok) fail('端口 18898 已被占用（可能已有 bxverse 在运行），请先释放')
    })
} catch {
  /* 未占用 */
}

let stat
try {
  stat = (await import('node:fs')).statSync(SERVER)
} catch {
  /* missing */
}
if (!stat || !stat.isFile()) fail('缺少 apps/server/dist/index.js，请先执行 pnpm build')

// ── 场景 1：中断续跑 ──
console.log('\n===== [1/3] resume.mjs（中断续跑）=====')
const homeResume = mkdtempSync(path.join(tmpdir(), 'bx-e2e-resume-'))
run(process.execPath, ['e2e/resume.mjs'], { BX_HOME: homeResume, BX_PORT: '18898' })

// ── 场景 2：六步向导 ──
console.log('\n===== [2/3] wizard-flow.py（发布向导六步）=====')
let python = null
for (const cand of ['python', 'python3']) {
  try {
    execFileSync(cand, ['-c', 'import playwright'], { stdio: 'ignore' })
    python = cand
    break
  } catch {
    /* next */
  }
}
if (!python) {
  console.log('[e2e] 未检测到 Python + Playwright，跳过向导场景。')
  console.log('      安装：pip install playwright && playwright install chromium')
} else {
  const homeWiz = mkdtempSync(path.join(tmpdir(), 'bx-e2e-wiz-'))
  const child = spawn(process.execPath, [SERVER], {
    stdio: 'ignore',
    cwd: ROOT,
    env: { ...process.env, BX_HOME: homeWiz, BX_PORT: '18999' },
  })
  try {
    await waitHealth('18999')
    run(process.execPath, ['e2e/prepare-fixture.mjs'], { BX_BASE: 'http://127.0.0.1:18999' })
    // BX_HOME 透传给 python：恢复演练断言文件落盘
    run(python, ['e2e/wizard-flow.py'], { BX_BASE: 'http://127.0.0.1:18999', BX_HOME: homeWiz })
  } finally {
    killTree(child)
  }

  // ── 场景 3：首次使用引导（空 BX_HOME → 自动弹出） ──
  // label 已在上面 [3/3] 标好；本场景在 python 检测成功后才执行
  const homeOb = mkdtempSync(path.join(tmpdir(), 'bx-e2e-ob-'))
  const ob = spawn(process.execPath, [SERVER], {
    stdio: 'ignore',
    cwd: ROOT,
    env: { ...process.env, BX_HOME: homeOb, BX_PORT: '18998' },
  })
  try {
    await waitHealth('18998')
    run(python, ['e2e/onboarding.py'], { BX_BASE: 'http://127.0.0.1:18998' })
  } finally {
    killTree(ob)
  }
}

console.log('\n[e2e] ALL SCENARIOS PASSED')
