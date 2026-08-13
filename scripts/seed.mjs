// scripts/seed.mjs
// 演示数据种子：创建示例项目 + 本地 fixture 仓库（对运行中的服务执行）
// 用法: node scripts/seed.mjs [--port 8899] [--project 演示项目]
// 注意: 需要先启动服务（pnpm start 或 pnpm dev）

import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const args = process.argv.slice(2)
const getArg = (name, fallback) => {
  const i = args.indexOf(name)
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback
}
const port = getArg('--port', '8899')
const projectName = getArg('--project', '演示项目')
const base = `http://127.0.0.1:${port}`

const gitEnv = { ...process.env, LC_ALL: 'C.UTF-8' }

function makeDemoRepo(name, commits) {
  const dir = mkdtempSync(path.join(tmpdir(), `bxverse-seed-${name}-`))
  const run = (a) => execFileSync('git', a, { cwd: dir, env: gitEnv })
  run(['init', '-b', 'master'])
  run(['config', 'user.name', 'demo'])
  run(['config', 'user.email', 'demo@bxverse.local'])
  for (const [i, c] of commits.entries()) {
    for (const [f, content] of Object.entries(c.files)) {
      const p = path.join(dir, f)
      mkdirSync(path.dirname(p), { recursive: true })
      appendFileSync(p, content)
    }
    execFileSync('git', ['add', '-A'], { cwd: dir, env: gitEnv })
    execFileSync('git', ['commit', '-m', c.message], { cwd: dir, env: gitEnv })
  }
  return dir
}

async function main() {
  // 1. 引导拿 token
  const init = await (await fetch(`${base}/api/config`)).json()
  const token = init.token
  const post = async (p, body) => {
    const res = await fetch(`${base}${p}`, {
      method: 'POST',
      headers: { 'X-BX-Token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.status >= 400) {
      const e = await res.json().catch(() => ({}))
      throw new Error(`${p} -> ${res.status} ${JSON.stringify(e)}`)
    }
    return res.json()
  }

  // 2. 项目 + 三个演示仓库
  const project = await post('/api/projects', { name: projectName, description: '演示项目（seed 脚本生成）' })
  console.log(`项目已创建: ${project.name} (${project.id})`)

  const demos = [
    {
      name: 'web-front', displayName: 'Web 前端',
      commits: [
        { message: 'feat(ui): 新增仪表盘页面', files: { 'src/views/Dashboard.vue': '<template><div>dashboard</div></template>\n' } },
        { message: 'fix: 修复暗色主题对比度', files: { 'src/styles/theme.css': ':root { --bg: #f5f6f8; }\n' } },
        { message: 'docs: 更新 README', files: { 'README.md': '# web-front\n' } },
      ],
    },
    {
      name: 'api-service', displayName: 'API 服务',
      commits: [
        { message: 'feat(auth): 新增令牌刷新接口', files: { 'src/auth.ts': 'export const refresh = () => {}\n' } },
        { message: 'perf: 缓存查询结果', files: { 'src/cache.ts': 'export const cache = new Map()\n' } },
      ],
    },
    {
      name: 'mp-weixin', displayName: '微信小程序',
      commits: [
        { message: 'feat: 首页改版', files: { 'pages/index/index.vue': '<template><view>home</view></template>\n' } },
        { message: 'fix: 修复支付回调', files: { 'api/pay.ts': 'export const pay = () => {}\n' } },
      ],
    },
  ]

  for (const d of demos) {
    const dir = makeDemoRepo(d.name, d.commits)
    const repo = await post(`/api/projects/${project.id}/repos`, { path: dir, name: d.name })
    await fetch(`${base}/api/projects/${project.id}/repos/${repo.id}`, {
      method: 'PATCH',
      headers: { 'X-BX-Token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: d.displayName }),
    })
    console.log(`仓库已接入: ${d.name}（${d.displayName}）`)
  }

  console.log(`\n完成。访问 http://127.0.0.1:${port}/ 查看演示数据（项目「${projectName}」）`)
}

main().catch((e) => {
  console.error(`seed 失败: ${e.message}`)
  process.exit(1)
})
