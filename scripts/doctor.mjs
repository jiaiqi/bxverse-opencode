// scripts/doctor.mjs
// 诊断脚本：核对 app.json 基准与各仓库真实 git 状态，定位「全部显示最新/提交流为空」类问题
// 用法: node scripts/doctor.mjs [--home ~/.bxverse] [--project 项目名或id]
// 只读操作，不修改任何数据；无需服务运行。

import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const args = process.argv.slice(2)
const getArg = (name, fallback) => {
  const i = args.indexOf(name)
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback
}

const home = path.resolve(getArg('--home', path.join(os.homedir(), '.bxverse')))
const projectFilter = getArg('--project', '')
const appJsonPath = path.join(home, 'app.json')
const gitEnv = { ...process.env, LC_ALL: 'C.UTF-8' }

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

function git(a, cwd, allowFail = false) {
  try {
    return execFileSync('git', a, { cwd, env: gitEnv, encoding: 'utf8' }).trim()
  } catch {
    if (allowFail) return null
    throw new Error(`git ${a.join(' ')} 失败（cwd=${cwd}）`)
  }
}

const projects = cfg.projects.filter(p => !projectFilter || p.id === projectFilter || p.name === projectFilter)
if (projects.length === 0) {
  console.error(`[X] 未匹配项目 '${projectFilter}'；现有: ${cfg.projects.map(p => p.name).join('、')}`)
  process.exit(1)
}

console.log(`BX_HOME = ${home}`)
console.log(`匹配项目数 = ${projects.length}\n`)

for (const p of projects) {
  console.log(`=== 项目 ${p.name} (${p.id}) ===`)
  console.log(`  repoVersionFormat=${p.repoVersionFormat ?? '(未设,走旧scheme)'} scheme=${p.repoVersionScheme ?? '-'} projectVersion=${p.version}`)
  for (const r of p.repos) {
    console.log(`\n  -- ${r.displayName || r.name} [${r.id}]`)
    console.log(`     path=${r.path}`)
    console.log(`     versionSource=${r.versionSource ?? 'derived'} versionSyncCommit=${r.versionSyncCommit ?? 'package(默认)'}`)

    if (!existsSync(r.path)) { console.log('     [X] 路径不存在'); continue }
    if (git(['rev-parse', '--git-dir'], r.path, true) === null) { console.log('     [X] 不是 git 仓库（缺 .git）'); continue }

    const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], r.path, true) ?? '?'
    const headFull = git(['rev-parse', 'HEAD'], r.path, true) ?? ''
    const base = r.lastPublishCommit || null
    const dirtyRaw = git(['status', '--porcelain', '--untracked-files=no'], r.path, true) ?? ''
    const dirty = dirtyRaw ? dirtyRaw.split(/\r?\n/).filter(Boolean).length : 0

    let ahead = -1
    let baseAncestor = null
    if (base) {
      baseAncestor = git(['merge-base', '--is-ancestor', base, 'HEAD'], r.path, true) !== null
      const cnt = git(['rev-list', `${base}..HEAD`, '--count'], r.path, true)
      ahead = cnt === null ? -1 : Number(cnt)
    } else {
      const cnt = git(['rev-list', 'HEAD', '--count'], r.path, true)
      ahead = cnt === null ? -1 : Number(cnt)
    }

    console.log(`     branch=${branch} HEAD=${headFull.slice(0, 8)}`)
    console.log(`     lastPublishCommit=${base ? base.slice(0, 8) : 'null(从未发布)'}`)

    if (base && headFull && base === headFull) {
      console.log('     · 基准==HEAD：发布后无新提交 → 检测「最新」是正确行为')
    }
    if (base && baseAncestor === false) {
      console.log('     [!] 基准不可达（不在当前分支历史：切过分支/force-push）→ 引擎降级全量收集')
    }
    if (ahead > 0) console.log(`     · 基准落后 ${ahead} 个提交 → changed 应为 true`)
    if (ahead === 0 && dirty > 0) console.log(`     · 无新提交但 ${dirty} 个脏文件 → changed 应为 true(dirty)`)
    if (!base) console.log('     · 从未发布，首次发布将全量收集(≤500)')

    // 常见误区：新提交在其它分支上
    if (base && ahead === 0 && baseAncestor !== false) {
      const branches = (git(['for-each-ref', 'refs/heads', '--format=%(refname:short) %(objectname:short)'], r.path, true) ?? '')
        .split(/\r?\n/).filter(Boolean)
      const others = branches.filter(b => !b.includes(headFull.slice(0, 7)))
      if (others.length) console.log(`     其他分支(可能藏着你的新提交): ${others.join(' | ')}`)
    }

    const buildTags = (git(['tag', '-l', 'build/*'], r.path, true) ?? '').split(/\r?\n/).filter(Boolean)
    const vTags = (git(['tag', '-l', 'v*'], r.path, true) ?? '').split(/\r?\n/).filter(Boolean)
    const plainTags = (git(['tag', '-l'], r.path, true) ?? '').split(/\r?\n/).filter(t => /^\d+\.\d+\.\d+/.test(t))
    console.log(`     tags: build x${buildTags.length}${buildTags.length ? `(末两个: ${buildTags.slice(-2).join(', ')})` : ''} | v* x${vTags.length}${vTags.length ? `(最新: ${vTags.at(-1)})` : ''} | 无前缀语义 x${plainTags.length}${plainTags.length ? `(${plainTags.slice(-2).join(',')})` : ''}`)

    if (r.versionSource === 'packageJson') {
      const last = git(['log', '-1', '--format=%h %s', '--', 'package.json'], r.path, true)
      if (last) console.log(`     package.json 最近改动: ${last.split('\n')[0]}`)
    }
  }
  console.log('')
}

console.log('提示: 总览页卡片读轮询缓存(默认30s)；仓库详情「刷新」按钮走 fresh=true 实时检测。')
console.log('提示: GitTab「提交流与Diff」展示的是工作区改动(暂存/未暂存/未追踪)，干净仓库显示"工作区干净"属正常。')
