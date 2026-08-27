#!/usr/bin/env node
// apps/cli/src/index.ts
// bx-manager 命令薄壳（不复制业务逻辑）：
//   start     启动管理台（node server dist）
//   dev       开发模式（tsx server src，watch）
//   data-dir  打印数据目录
//   status    查看管理台运行状态

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { store } from '@bxverse/core'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const SERVER_DIR = path.join(ROOT, 'apps', 'server')
const SERVER_DIST = path.join(SERVER_DIR, 'dist', 'index.js')
const SERVER_SRC = path.join(SERVER_DIR, 'src', 'index.ts')

const parseArgs = (argv: string[]): Record<string, string | boolean> => {
  const out: Record<string, string | boolean> = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const [key, value] = a.slice(2).split('=')
    if (value !== undefined) out[key] = value
    else if (argv[i + 1] && !argv[i + 1].startsWith('--')) out[key] = argv[++i]
    else out[key] = true
  }
  return out
}

const openBrowser = (url: string): void => {
  const cmd = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open'
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url]
  spawn(cmd, args, { stdio: 'ignore', detached: true }).unref()
}

const spawnServer = (args: string[], env: NodeJS.ProcessEnv): void => {
  const child = spawn(process.execPath, args, { stdio: 'inherit', env: { ...process.env, ...env } })
  child.on('exit', (code) => {
    if (code !== 0) process.exit(code ?? 1)
  })
}

/** 看门狗模式启动：崩溃（非 0 退出）3s 内自动拉起；用户 Ctrl+C 一并退出 */
function spawnServerWithWatchdog(args: string[], env: NodeJS.ProcessEnv, opts: { respawnDelayMs?: number } = {}): void {
  const delay = opts.respawnDelayMs ?? 3000
  let stopping = false
  const start = (): void => {
    if (stopping) return
    const child = spawn(process.execPath, args, { stdio: 'inherit', env: { ...process.env, ...env } })
    let exited = false
    child.on('exit', (code, signal) => {
      if (stopping) return
      if (signal) {
        // Ctrl+C / SIGTERM：用户主动停，不重拉
        process.exit(0)
      }
      if (!exited) {
        exited = true
        // console.error 因为 stdio 已经继承，直接写入 stderr
        process.stderr.write(`[bx-manager] 服务退出 (code=${code})，${delay}ms 后自动拉起（Ctrl+C 退出）\n`)
      }
      setTimeout(start, delay)
    })
  }
  process.on('SIGINT', () => { stopping = true; process.exit(0) })
  process.on('SIGTERM', () => { stopping = true; process.exit(0) })
  start()
}

/** 升级检测：拉 npm registry 拿 latest 版本与当前对比（零依赖） */
async function checkUpdate(): Promise<void> {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as { name: string; version: string }
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg.name)}/latest`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) throw new Error(`registry http ${res.status}`)
    const latest = (await res.json()) as { version?: string }
    const cur = pkg.version
    const cmp = (a: string, b: string): number => {
      const pa = a.split('.').map((x) => Number(x) || 0)
      const pb = b.split('.').map((x) => Number(x) || 0)
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        if ((pa[i] ?? 0) < (pb[i] ?? 0)) return -1
        if ((pa[i] ?? 0) > (pb[i] ?? 0)) return 1
      }
      return 0
    }
    const remote = latest.version ?? '?'
    if (cmp(cur, remote) < 0) {
      console.log(`[bx-manager] 当前 v${cur}，最新 v${remote}（升级：pnpm i -g ${pkg.name}@latest）`)
      process.exit(0)
    } else {
      console.log(`[bx-manager] 已是最新 v${cur}`)
      process.exit(0)
    }
  } catch (e) {
    console.error(`[bx-manager] 检查更新失败: ${(e as Error).message}`)
    process.exit(1)
  }
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2)
  const args = parseArgs(rest)
  const port = Number(args.port ?? process.env.BX_PORT ?? 8899)

  switch (command ?? 'start') {
    case 'start': {
      if (!fs.existsSync(SERVER_DIST)) {
        console.error('[bx-manager] 服务端未构建，请先在项目根执行: pnpm build（或 pnpm --filter @bxverse/server build）')
        process.exit(1)
      }
      console.log(`[bx-manager] 启动管理台: http://127.0.0.1:${port}（数据目录 ${store.APP_DIR}）`)
      if (args.watchdog === true) {
        spawnServerWithWatchdog([SERVER_DIST], { BX_PORT: String(port) })
      } else {
        spawnServer([SERVER_DIST], { BX_PORT: String(port) })
      }
      if (args.open !== false) {
        setTimeout(() => openBrowser(`http://127.0.0.1:${port}`), 1500)
      }
      break
    }
    case 'dev': {
      console.log(`[bx-manager] 开发模式启动（tsx watch）: http://127.0.0.1:${port}`)
      spawnServer(['--import', 'tsx', 'watch', SERVER_SRC], { BX_PORT: String(port) })
      if (args.open !== false) {
        setTimeout(() => openBrowser(`http://127.0.0.1:${port}`), 2500)
      }
      break
    }
    case 'data-dir': {
      console.log(store.APP_DIR)
      break
    }
    case 'update': {
      await checkUpdate()
      break
    }
    case 'status': {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(2000) })
        const body = (await res.json()) as { ok?: boolean; version?: string }
        console.log(`管理台运行中: ${res.ok && body.ok ? '✓' : '✗'} http://127.0.0.1:${port}（v${body.version ?? '?'}）`)
        process.exit(res.ok ? 0 : 1)
      } catch {
        console.log(`管理台未运行: http://127.0.0.1:${port}（用 bx-manager start 启动）`)
        process.exit(1)
      }
      break
    }
    case 'help':
    case '--help':
    case '-h':
    default: {
      console.log('bx-manager —— BX 版本管理台命令薄壳\n')
      console.log('  bx-manager start [--port 8899] [--no-open] [--watchdog]  启动管理台（生产，--watchdog 启用 3s 自动拉起）')
      console.log('  bx-manager dev   [--port 8899] [--no-open]               开发模式（tsx watch）')
      console.log('  bx-manager data-dir                                       打印数据目录')
      console.log('  bx-manager status [--port 8899]                          查看运行状态')
      console.log('  bx-manager update                                         检查更新（npm registry）')
      break
    }
  }
}

main().catch((e) => {
  console.error(`[bx-manager] ${(e as Error).message}`)
  process.exit(1)
})
