#!/usr/bin/env node
// scripts/doctor.mjs
// 诊断脚本：调用 core/doctor 跑一致性体检（与系统健康页同源）
// 只读操作，不修改任何数据；无需服务运行。
// 用法: node scripts/doctor.mjs [--home ~/.bxverse] [--project 项目名或id] [--json]

import { readFileSync, existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

// 解析 @bxverse/core 产物（脚本不在 monorepo 上下文中）
const coreDist = path.resolve(process.cwd(), 'packages/core/dist/index.js')
if (!existsSync(coreDist)) {
  console.error('[X] 缺少 packages/core/dist/index.js，请先 `pnpm --filter @bxverse/core build`')
  process.exit(1)
}
const { doctor } = await import(pathToFileURL(coreDist).href)

const args = process.argv.slice(2)
const getArg = (name, fallback) => {
  const i = args.indexOf(name)
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback
}
const hasFlag = (name) => args.includes(name)

const home = path.resolve(getArg('--home', path.join(os.homedir(), '.bxverse')))
const projectFilter = getArg('--project', '')
const appJsonPath = path.join(home, 'app.json')
if (!existsSync(appJsonPath)) {
  console.error(`[X] 未找到 ${appJsonPath}（BX_HOME 不对？用 --home 指定）`)
  process.exit(1)
}
let cfg
try {
  cfg = JSON.parse(readFileSync(appJsonPath, 'utf8'))
} catch (e) {
  console.error(`[X] app.json 不是合法 JSON: ${e.message}`)
  process.exit(1)
}

const report = await doctor.runDoctor(cfg, home, { projectFilter })
if (hasFlag('--json')) {
  console.log(JSON.stringify(report, null, 2))
  process.exit(report.overall === 'error' ? 2 : 0)
}

console.log(`BX_HOME = ${home}`)
console.log(`整体 ${report.overall} · ok=${report.counts.ok} warn=${report.counts.warn} error=${report.counts.error}\n`)
for (const p of report.projects) {
  console.log(`=== ${p.projectName} (${p.projectId})  v${p.projectVersion} ===`)
  for (const r of p.repos) {
    const tag = `[${r.state.toUpperCase()}]`
    console.log(`  ${tag} ${r.repoName}  HEAD=${r.head}  base=${r.lastPublishCommit ?? 'null'}  ahead=${r.ahead}  dirty=${r.dirty}  branch=${r.branch}`)
    for (const h of r.hints) console.log(`         · ${h}`)
    if (r.buildTagsRecent.length || r.vTagsCount || r.plainTagsCount) {
      console.log(`         tags: build ${r.buildTagsRecent.join(',') || '-'} | v* ${r.vTagLatest ?? '-'} (×${r.vTagsCount}) | 语义 ${r.plainTagsRecent.join(',') || '-'} (×${r.plainTagsCount})`)
    }
    if (r.otherBranches.length) console.log(`         other: ${r.otherBranches.join(' | ')}`)
  }
  console.log('')
}
process.exit(report.overall === 'error' ? 2 : 0)
