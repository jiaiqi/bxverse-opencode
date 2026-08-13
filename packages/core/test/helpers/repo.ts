// 测试夹具：临时 git 仓库
import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const gitEnv = { ...process.env, LC_ALL: 'C.UTF-8' }

export function makeRepo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'bxverse-repo-'))
  const run = (args: string[]) => execFileSync('git', args, { cwd: dir, env: gitEnv })
  run(['init', '-b', 'master'])
  run(['config', 'user.name', 'tester'])
  run(['config', 'user.email', 'tester@bxverse.local'])
  return dir
}

export function commit(
  dir: string,
  message: string,
  files: Record<string, string>,
  date?: string,
): string {
  for (const [f, content] of Object.entries(files)) {
    const p = path.join(dir, f)
    mkdirSync(path.dirname(p), { recursive: true })
    appendFileSync(p, content)
  }
  const env = date
    ? { ...gitEnv, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }
    : gitEnv
  execFileSync('git', ['add', '-A'], { cwd: dir, env })
  execFileSync('git', ['commit', '-m', message], { cwd: dir, env })
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, env }).toString().trim()
}

export function tag(dir: string, name: string, message?: string, date?: string): void {
  const env = date ? { ...gitEnv, GIT_COMMITTER_DATE: date } : gitEnv
  execFileSync('git', ['tag', '-a', name, '-m', message ?? name], { cwd: dir, env })
}
