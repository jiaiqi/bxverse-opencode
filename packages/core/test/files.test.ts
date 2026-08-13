import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { listTree, readFileContent } from '../src/files'
import { commit, makeRepo } from './helpers/repo'

describe('files 文件树', () => {
  it('目录优先排序 + 内置忽略 + gitignore 感知 + 截断保护', () => {
    const dir = makeRepo()
    commit(dir, 'feat: init', {
      'src/a.ts': '1',
      'b.md': '2',
      'node_modules/.bin/x': '3',
      '.gitignore': 'dist/\n*.log\n',
    })
    fs.mkdirSync(path.join(dir, 'dist'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'dist', 'bundle.js'), 'x')
    fs.writeFileSync(path.join(dir, 'debug.log'), 'x')
    fs.mkdirSync(path.join(dir, 'sub'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'sub', 'c.txt'), 'x')

    const root = listTree(dir, '')
    const names = root.entries.map(e => e.name)
    expect(names).toContain('src')
    expect(names).toContain('b.md')
    expect(names).toContain('sub')
    expect(names).not.toContain('node_modules')
    expect(names).not.toContain('dist')
    expect(names).not.toContain('debug.log')
    expect(root.entries.findIndex(e => e.name === 'src')).toBeLessThan(root.entries.findIndex(e => e.name === 'b.md'))

    const sub = listTree(dir, 'src')
    expect(sub.entries.map(e => e.name)).toContain('a.ts')
  })

  it('路径逃逸防护', () => {
    const dir = makeRepo()
    commit(dir, 'feat: init', { 'a.txt': '1' })
    expect(() => listTree(dir, '../..')).toThrow()
    expect(() => readFileContent(dir, '../../secret')).toThrow()
  })

  it('符号链接指向仓库外 → 拒绝（realpath 加固）', () => {
    const dir = makeRepo()
    commit(dir, 'feat: init', { 'a.txt': '1' })
    // 仓库外敏感目录 + 仓库内 junction 指向它
    const outside = mkdtempSync(path.join(tmpdir(), 'bxverse-outside-'))
    fs.writeFileSync(path.join(outside, 'secret.txt'), 'secret')
    try {
      fs.symlinkSync(outside, path.join(dir, 'link-out'), 'junction')
    } catch {
      // 平台不支持 junction 时跳过
      return
    }
    expect(() => listTree(dir, 'link-out')).toThrow('越界')
    expect(() => readFileContent(dir, 'link-out/secret.txt')).toThrow('越界')
  })

  it('文本文件读取与二进制判定', () => {
    const dir = makeRepo()
    commit(dir, 'feat: init', { 'a.txt': 'hello\nworld\n' })
    const f = readFileContent(dir, 'a.txt')
    expect(f.binary).toBe(false)
    expect(f.lines).toBe(3)
    expect(f.content).toContain('hello')
  })

  it('大文件截断', () => {
    const dir = makeRepo()
    commit(dir, 'feat: init', { 'a.txt': 'x'.repeat(600 * 1024) })
    const f = readFileContent(dir, 'a.txt')
    expect(f.truncated).toBe(true)
  })
})
