// M4 向导 e2e 夹具：临时 BX_HOME（由环境变量指定）+ fixture 仓库 + 项目
import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const gitEnv = { ...process.env, LC_ALL: 'C.UTF-8' }

const repoDir = mkdtempSync(path.join(tmpdir(), 'bxverse-wiz-repo-'))
const run = (args) => execFileSync('git', args, { cwd: repoDir, env: gitEnv })
run(['init', '-b', 'master'])
run(['config', 'user.name', 'tester'])
run(['config', 'user.email', 'tester@bxverse.local'])
const commit = (msg, files) => {
  for (const [f, content] of Object.entries(files)) {
    const p = path.join(repoDir, f)
    mkdirSync(path.dirname(p), { recursive: true })
    appendFileSync(p, content)
  }
  execFileSync('git', ['add', '-A'], { cwd: repoDir, env: gitEnv })
  execFileSync('git', ['commit', '-m', msg], { cwd: repoDir, env: gitEnv })
}
commit('feat(ui): 新增向导页面', { 'src/wizard.ts': 'export {};\n' })
commit('fix: 修复日志状态机', { 'src/state.ts': 'export {};\n' })
commit('docs: 更新说明', { 'README.md': '# wiz\n' })

const base = process.env.BX_BASE || `http://127.0.0.1:${process.env.BX_PORT || '18899'}`
const init = await (await fetch(`${base}/api/config`)).json()
const token = init.token
const post = async (p, body) => {
  const res = await fetch(`${base}${p}`, {
    method: 'POST',
    headers: { 'X-BX-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

const project = await post('/api/projects', { name: '发布测试项目' })
await post(`/api/projects/${project.id}/repos`, { path: repoDir })
console.log('fixture ready:', project.id, repoDir)
