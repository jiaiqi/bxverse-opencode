// packages/core/src/files.ts
// 文件树与文件读取（TreeNode/FileEntry/FileContent），gitignore 感知 + 内置忽略目录 + 截断保护

import fs from 'node:fs'
import path from 'node:path'
import { DEFAULT_IGNORE_DIRS } from '@bxverse/shared'
import type { FileContent, FileEntry, TreeNode } from '@bxverse/shared'

const MAX_TREE_ENTRIES = 1000
const MAX_FILE_READ = 512 * 1024
const MAX_FILE_LINES = 5000

interface IgnorePattern {
  /** 仅匹配 basename（模式不含 /） */
  baseOnly: boolean
  re: RegExp
}

/** 简化版 .gitignore 解析（支持 *、**、尾 / 目录模式；不支持 ! 取反） */
function loadIgnorePatterns(repoPath: string): IgnorePattern[] {
  const gi = path.join(repoPath, '.gitignore')
  const out: IgnorePattern[] = []
  if (!fs.existsSync(gi)) return out
  for (const raw of fs.readFileSync(gi, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const p = line.replace(/^\/|\/$/g, '')
    if (!p) continue
    const baseOnly = !p.includes('/')
    const src = p
      .split('**')
      .map(seg => seg.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*'))
      .join('.*')
    out.push({ baseOnly, re: new RegExp(baseOnly ? `^${src}$` : `^${src}(?:/.*)?$`) })
  }
  return out
}

function isIgnored(rel: string, patterns: IgnorePattern[]): boolean {
  for (const p of patterns) {
    const target = p.baseOnly ? (rel.split('/').pop() ?? rel) : rel
    if (p.re.test(target)) return true
  }
  return false
}

/** 解析并校验仓库内相对路径，防逃逸 */
function safeAbs(repoPath: string, relPath: string): string {
  const root = path.resolve(repoPath)
  const abs = path.resolve(root, relPath)
  if (abs !== root && !abs.startsWith(root + path.sep)) throw new Error('路径越界')
  return abs
}

/** 懒加载目录树：逐层展开，内置忽略目录 + .gitignore 感知，超限截断 */
export function listTree(repoPath: string, dirPath: string): TreeNode {
  const abs = safeAbs(repoPath, dirPath)
  if (!fs.existsSync(abs)) throw new Error(`目录不存在: ${dirPath}`)
  if (!fs.statSync(abs).isDirectory()) throw new Error(`不是目录: ${dirPath}`)
  const relDir = dirPath.replace(/\\/g, '/').replace(/^\/+/, '')
  const patterns = loadIgnorePatterns(repoPath)
  const names = fs.readdirSync(abs)
  const entries: FileEntry[] = []
  let truncated = false
  for (const name of names) {
    if (entries.length >= MAX_TREE_ENTRIES) {
      truncated = true
      break
    }
    if (name === '.git') continue
    let st
    try {
      st = fs.statSync(path.join(abs, name))
    } catch {
      continue
    }
    if (st.isDirectory() && DEFAULT_IGNORE_DIRS.has(name)) continue
    const rel = relDir ? `${relDir}/${name}` : name
    if (isIgnored(rel, patterns)) continue
    entries.push({ name, type: st.isDirectory() ? 'dir' : 'file', size: st.isFile() ? st.size : 0 })
  }
  entries.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1))
  return { path: relDir, entries, truncated }
}

/** 读取文件内容：二进制检测、512KB 上限、行数截断 */
export function readFileContent(repoPath: string, filePath: string): FileContent {
  const abs = safeAbs(repoPath, filePath)
  if (!fs.existsSync(abs)) throw new Error(`文件不存在: ${filePath}`)
  const st = fs.statSync(abs)
  if (st.isDirectory()) throw new Error(`是目录: ${filePath}`)
  const rel = filePath.replace(/\\/g, '/').replace(/^\/+/, '')
  if (st.size > MAX_FILE_READ) {
    return { path: rel, size: st.size, binary: false, truncated: true, content: '', lines: 0 }
  }
  const buf = fs.readFileSync(abs)
  if (buf.includes(0)) {
    return { path: rel, size: st.size, binary: true, truncated: false, content: '', lines: 0 }
  }
  const text = buf.toString('utf8')
  const lines = text.split(/\r?\n/)
  if (lines.length > MAX_FILE_LINES) {
    return {
      path: rel,
      size: st.size,
      binary: false,
      truncated: true,
      content: lines.slice(0, MAX_FILE_LINES).join('\n'),
      lines: MAX_FILE_LINES,
    }
  }
  return { path: rel, size: st.size, binary: false, truncated: false, content: text, lines: lines.length }
}
