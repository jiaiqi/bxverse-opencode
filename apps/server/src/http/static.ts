// apps/server/src/http/static.ts
// 生产静态托管：apps/web/dist（SPA fallback）；web 未构建时返回占位页

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ServerResponse } from 'node:http'

/**
 * 定位前端构建产物目录，不依赖 cwd：
 * pnpm start 的 cwd 是 apps/server（process.cwd() 指向错误位置），
 * 从本模块所在目录与 cwd 向上查找含 apps/web/dist/index.html 的仓库根。
 */
function findWebDist(): string {
  const starts = [path.dirname(fileURLToPath(import.meta.url)), process.cwd()]
  for (const start of starts) {
    let dir = path.resolve(start)
    for (let i = 0; i < 8; i++) {
      const candidate = path.join(dir, 'apps', 'web', 'dist', 'index.html')
      if (fs.existsSync(candidate)) return path.dirname(candidate)
      const parent = path.dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  }
  return ''
}

const WEB_DIST = findWebDist()

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.map': 'application/json',
}

const PLACEHOLDER = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>BX 版本管理台</title></head>
<body style="font-family:system-ui;display:flex;height:100vh;margin:0;align-items:center;justify-content:center;background:#f5f6f8">
<div style="text-align:center">
  <h1 style="color:#4c6ef5;margin:0">BX 版本管理台</h1>
  <p style="color:#666">服务已启动，前端尚未构建（M3 完成后运行 pnpm --filter @bxverse/web build 即可）。</p>
  <p style="color:#999;font-size:14px">开发模式请运行 pnpm dev 访问 http://127.0.0.1:5173</p>
</div>
</body></html>`

/** 响应静态文件；返回 false 表示未命中（SPA fallback 由调用方处理） */
export function serveStatic(res: ServerResponse, pathname: string): void {
  if (!fs.existsSync(WEB_DIST)) {
    if (pathname === '/' || pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end(PLACEHOLDER)
      return
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Not Found（前端未构建）')
    return
  }

  let rel = pathname.replace(/^\/+/, '') || 'index.html'
  if (rel.includes('..')) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Bad Request')
    return
  }
  let file = path.join(WEB_DIST, rel)
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    // SPA fallback
    file = path.join(WEB_DIST, 'index.html')
  }
  const ext = path.extname(file).toLowerCase()
  const isHashAsset = /\/assets\/.+\.(js|css|png|svg|woff2?)$/.test(pathname)
  const cache = pathname.endsWith('.html') || pathname === '/' || pathname.endsWith('.webmanifest')
    ? 'no-store'
    : isHashAsset
      ? 'public, max-age=31536000, immutable'
      : 'no-cache'
  res.writeHead(200, {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'Content-Length': fs.statSync(file).size,
    'Cache-Control': cache,
  })
  fs.createReadStream(file).pipe(res)
}
