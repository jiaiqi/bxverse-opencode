#!/usr/bin/env node
// scripts/release.mjs
// bxverse 自举发布（Phase 3）：零依赖
//   1. 聚合 .changeset/*.md 累积变更 → 计算下一个版本（major/minor/patch）
//   2. 调用 core/changelog 生成 release notes（dogfooding：自家引擎吃自家变更）
//   3. 更新所有 package.json 的 version
//   4. 输出 CHANGELOG.md（追加本节段）
//   5. 暂不自动 commit/publish（留给人审）
//
// 用法: node scripts/release.mjs [--bump major|minor|patch] [--dry-run]
//   --bump 强制版本（默认从 .changeset 推断）
//   --dry-run 仅打印不写盘

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const CHANGESET_DIR = join(ROOT, '.changeset')

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const bumpFlag = args.includes('--bump') ? args[args.indexOf('--bump') + 1] : null
const semverRe = /^\d+\.\d+\.\d+$/

function readJson(p) {
  return JSON.parse(readFileSync(p, 'utf8'))
}
function writeJson(p, obj) {
  writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf8')
}

function loadChangesets() {
  if (!existsSync(CHANGESET_DIR)) return []
  return readdirSync(CHANGESET_DIR)
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .map((f) => {
      const raw = readFileSync(join(CHANGESET_DIR, f), 'utf8')
      // 简单解析：frontmatter YAML 风格「--- \ntype: minor \n--- \nbody」
      const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw)
      if (!m) return { file: f, type: 'patch', body: raw.trim() }
      const meta = m[1]
      const body = m[2].trim()
      const typeMatch = /^type:\s*(\w+)/m.exec(meta)
      return { file: f, type: typeMatch?.[1] ?? 'patch', body }
    })
}

function decideBump(changesets, forced) {
  if (forced) return forced
  const order = { major: 3, minor: 2, patch: 1 }
  let max = 0
  let type = 'patch'
  for (const c of changesets) {
    if (c.type === 'major' || c.type === 'minor' || c.type === 'patch') {
      if (order[c.type] > max) { max = order[c.type]; type = c.type }
    }
  }
  return type
}

function bumpVersion(cur, type) {
  if (!semverRe.test(cur)) throw new Error(`invalid version: ${cur}`)
  const [maj, min, pat] = cur.split('.').map(Number)
  if (type === 'major') return `${maj + 1}.0.0`
  if (type === 'minor') return `${maj}.${min + 1}.0`
  return `${maj}.${min}.${pat + 1}`
}

function updatePackageVersions(newVersion) {
  // 根 package.json + apps/*/package.json + packages/*/package.json（递归一级，apps/server 等）
  const targets = []
  const fs = require('node:fs')
  const walk = (dir) => {
    const out = []
    if (!fs.existsSync(dir)) return out
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.git' || e.name === '.next') continue
      const p = join(dir, e.name)
      if (e.isDirectory()) {
        out.push(...walk(p))
      } else if (e.name === 'package.json' && dir !== ROOT) {
        out.push(p)
      } else if (e.name === 'package.json' && dir === ROOT) {
        out.push(p)
      }
    }
    return out
  }
  const files = walk(ROOT)
  for (const f of files) {
    const pkg = readJson(f)
    if (pkg.name) {
      const before = pkg.version
      pkg.version = newVersion
      if (!dryRun) writeJson(f, pkg)
      targets.push({ file: f, name: pkg.name, before, after: newVersion })
    }
  }
  return targets
}

function aggregateChangelog(changesets, newVersion, date) {
  // 不强求 core/changelog（单测单源，cycle 简单）：直接按 type 分组
  const grouped = { major: [], minor: [], patch: [] }
  for (const c of changesets) {
    const t = c.type in grouped ? c.type : 'patch'
    grouped[t].push({ file: c.file, body: c.body })
  }
  let md = `\n## v${newVersion}（${date}）\n\n`
  if (grouped.major.length) {
    md += `### 重大变更（major）\n` + grouped.major.map((x) => `- ${x.body}`).join('\n') + '\n\n'
  }
  if (grouped.minor.length) {
    md += `### 新增（minor）\n` + grouped.minor.map((x) => `- ${x.body}`).join('\n') + '\n\n'
  }
  if (grouped.patch.length) {
    md += `### 修复与维护（patch）\n` + grouped.patch.map((x) => `- ${x.body}`).join('\n') + '\n\n'
  }
  return md.trimEnd() + '\n'
}

async function main() {
  const changesets = loadChangesets()
  if (changesets.length === 0) {
    console.error('[release] .changeset/ 为空，至少需要一条变更记录（或显式 --bump patch）')
    process.exit(1)
  }
  const root = readJson(join(ROOT, 'package.json'))
  const cur = root.version
  const bump = decideBump(changesets, bumpFlag)
  const next = bumpVersion(cur, bump)
  const date = new Date().toISOString().slice(0, 10)
  console.log(`[release] 当前 v${cur} → ${bump} → v${next}`)

  const targets = await updatePackageVersions(next)
  for (const t of targets) {
    console.log(`  · ${t.name}: ${t.before} → ${t.after}`)
  }

  const changelogDir = join(ROOT, 'CHANGELOG.md')
  const existing = existsSync(changelogDir) ? readFileSync(changelogDir, 'utf8') : '# bxverse 更新日志\n'
  const section = aggregateChangelog(changesets, next, date)
  const updated = existing.trimEnd() + '\n' + section
  if (!dryRun) writeFileSync(changelogDir, updated, 'utf8')
  console.log(`[release] CHANGELOG.md 已更新（${dryRun ? 'dry-run' : '已写入'}）`)

  if (!dryRun) {
    // 清理已消费的 changeset（仅删除含「published: true」标识的，保守起见此处保留供 review）
    console.log(`[release] 提示：${changesets.length} 条 changeset 请人工 review 后删除（避免重复发布）`)
  }
  console.log(`\n[release] 下一步：git add -A && git commit -m "release: v${next}"`)
}

main().catch((e) => { console.error(`[release] ${e.message}`); process.exit(1) })
