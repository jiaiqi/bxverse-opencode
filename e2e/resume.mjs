// M4-14 中断续跑演练：执行中 kill server → 重启 → 重新发起 → 幂等续跑不重复打标签
import { execFileSync, spawn } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HOME = process.env.BX_HOME
const PORT = process.env.BX_PORT || '18898'
const BASE = `http://127.0.0.1:${PORT}`
const SERVER = fileURLToPath(new URL('../apps/server/dist/index.js', import.meta.url))
if (!HOME) {
  console.error('请先设置隔离环境变量 BX_HOME（勿指向真实数据目录）')
  process.exit(1)
}
const gitEnv = { ...process.env, LC_ALL: 'C.UTF-8' }

function makeRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), 'bxverse-resume-'))
  const run = (a) => execFileSync('git', a, { cwd: dir, env: gitEnv })
  run(['init', '-b', 'master'])
  run(['config', 'user.name', 't'])
  run(['config', 'user.email', 't@b.local'])
  const commit = (m, f) => {
    for (const [k, v] of Object.entries(f)) {
      const p = path.join(dir, k)
      mkdirSync(path.dirname(p), { recursive: true })
      appendFileSync(p, v)
    }
    execFileSync('git', ['add', '-A'], { cwd: dir, env: gitEnv })
    execFileSync('git', ['commit', '-m', m], { cwd: dir, env: gitEnv })
  }
  commit('feat: init', { 'a.txt': '1' })
  return dir
}

const repoA = makeRepo()
const repoB = makeRepo()
// B 的构建要 15s（中途 kill 的窗口）
const slowBuild = `node -e "setTimeout(()=>{},15000)"`

function startServer() {
  const child = spawn('node', [SERVER], {
    stdio: 'ignore',
    env: { ...process.env, BX_HOME: HOME, BX_PORT: PORT },
  })
  return child
}
function kill(child) {
  try {
    child.kill('SIGKILL')
  } catch {}
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitServer() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`)
      if (r.ok) return
    } catch {}
    await sleep(500)
  }
  throw new Error('server 未就绪')
}

let token = ''
async function api(path, method = 'GET', body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'X-BX-Token': token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status >= 400) {
    const e = await res.json().catch(() => ({}))
    throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(e)}`)
  }
  return res.json()
}

const tags = (dir) =>
  execFileSync('git', ['tag', '-l'], { cwd: dir, env: gitEnv })
    .toString()
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)

// ============ 主流程 ============
let server = startServer()
await waitServer()
const init = await (await fetch(`${BASE}/api/config`)).json()
token = init.token

const project = await api('/api/projects', 'POST', { name: '续跑演练' })
await api(`/api/projects/${project.id}/repos`, 'POST', { path: repoA })
const repoBDef = await api(`/api/projects/${project.id}/repos`, 'POST', { path: repoB })
await api(`/api/projects/${project.id}/repos/${repoBDef.id}`, 'PATCH', { buildCommand: slowBuild })

// 1. 发起发布（A 快、B 慢），3s 后 kill（B 正在构建）
const t1 = await api('/api/publish', 'POST', {
  projectId: project.id,
  bump: 'minor',
  offline: true,
})
console.log('task1:', t1.taskId)
await sleep(3000)
kill(server)
console.log('server killed mid-publish')
await sleep(1000)

// 2. 重启 → journal 被标记 interrupted
server = startServer()
await waitServer()
console.log('server restarted')

// 3. 重新发起同项目发布 → 续跑
const t2 = await api('/api/publish', 'POST', {
  projectId: project.id,
  bump: 'minor',
  offline: true,
})
console.log('task2（续跑）:', t2.taskId)

// 4. 等完成（B 构建 15s + 重跑开销）
let done = false
for (let i = 0; i < 60; i++) {
  const cur = await api('/api/publish/current')
  if (cur.status === 'done') {
    done = true
    break
  }
  if (cur.status === 'failed') throw new Error('续跑失败')
  await sleep(2000)
}
if (!done) throw new Error('续跑未在 120s 内完成')

// 5. 验证：标签不重复、记录不重复、版本前移一次
const tagsA = tags(repoA)
const tagsB = tags(repoB)
console.log('A tags:', tagsA)
console.log('B tags:', tagsB)
if (tagsA.filter((t) => t.startsWith('build/')).length !== 1)
  throw new Error(`A build 标签数 != 1: ${tagsA}`)
if (tagsA.filter((t) => t === 'v0.2.0').length !== 1) throw new Error('A 里程碑标签异常')
if (tagsB.filter((t) => t.startsWith('build/')).length !== 1)
  throw new Error(`B build 标签数 != 1: ${tagsB}`)
if (tagsB.filter((t) => t === 'v0.2.0').length !== 1) throw new Error('B 里程碑标签异常')

const releases = await api(`/api/projects/${project.id}/releases`)
if (releases.filter((r) => r.kind === 'project').length !== 1) throw new Error('项目记录数 != 1')
const projects = await api('/api/projects')
const p = projects.find((x) => x.id === project.id)
if (p.version !== 'v0.2.0') throw new Error(`项目版本: ${p.version}`)

const journalFiles = readdirSync(path.join(HOME, 'journal')).filter((f) => f.endsWith('.json'))
const j = JSON.parse(readFileSync(path.join(HOME, 'journal', journalFiles[0]), 'utf8'))
console.log('journal status:', j.status, 'steps:', j.steps.length)

kill(server)
console.log('RESUME TEST PASSED')
