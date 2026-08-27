// scripts/_reset-versions.mjs（一次性使用）
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const req = createRequire(import.meta.url)
const fs = req('node:fs')
function setVer(p, v) { const o = JSON.parse(fs.readFileSync(p, 'utf8')); o.version = v; fs.writeFileSync(p, JSON.stringify(o, null, 2) + '\n', 'utf8') }
const files = ['package.json', 'apps/cli/package.json', 'apps/server/package.json', 'apps/web/package.json', 'packages/core/package.json', 'packages/shared/package.json']
for (const p of files) setVer(join(root, p), '0.1.0')
const ch = join(root, 'CHANGELOG.md')
if (existsSync(ch)) unlinkSync(ch)
console.log('reset ok, files:', files.length, 'CHANGELOG:', !existsSync(ch))
