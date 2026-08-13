// packages/core/src/backup/tar.ts
// 零依赖 tar.gz 写入器：ustar 头 + node:zlib gzip 流式写出（R19/M6）
// 长路径（>100 字节，含中文）走 GNU 'L' longname 扩展头；不落临时文件。

import fs from 'node:fs'
import zlib from 'node:zlib'

function octal(n: number, len: number): string {
  return n.toString(8).padStart(len - 1, '0') + '\0'
}

/** ustar 512 字节头（name 需 ≤100 字节；更长由调用方先写 'L' 头） */
function headerBlock(opts: { name: string; size: number; typeflag: string; mtime: number }): Buffer {
  const buf = Buffer.alloc(512)
  const nameBuf = Buffer.from(opts.name, 'utf8')
  nameBuf.copy(buf, 0, 0, Math.min(nameBuf.length, 100))
  buf.write(octal(0o644, 8), 100, 'ascii')
  buf.write(octal(0, 8), 108, 'ascii')
  buf.write(octal(0, 8), 116, 'ascii')
  buf.write(octal(opts.size, 12), 124, 'ascii')
  buf.write(octal(Math.floor(opts.mtime / 1000), 12), 136, 'ascii')
  buf.fill(0x20, 148, 156)
  buf.write(opts.typeflag, 156, 'ascii')
  buf.write('ustar\0', 257, 'ascii')
  buf.write('00', 263, 'ascii')
  let sum = 0
  for (const b of buf) sum += b
  buf.write(octal(sum, 6) + '\0 ', 148, 'ascii')
  return buf
}

function padTo512(len: number): number {
  return (512 - (len % 512)) % 512
}

/**
 * 把 files（绝对路径 + 归档内相对路径）写成 tar.gz。
 * 自动补目录条目；空文件/大文件均流式处理。
 */
export async function createTarGz(files: { abs: string; rel: string; size: number }[], outFile: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const gzip = zlib.createGzip({ level: 6 })
    const out = fs.createWriteStream(outFile)
    let failed = false
    gzip.on('error', (e) => { failed = true; reject(e) })
    out.on('error', (e) => { failed = true; reject(e) })

    const w = (b: Buffer): boolean => !failed && gzip.write(b)

    const dirs = new Set<string>()
    for (const f of files) {
      const parts = f.rel.split('/')
      for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'))
    }
    const now = Date.now()
    for (const d of [...dirs].sort()) {
      if (!w(headerBlock({ name: `${d}/`, size: 0, typeflag: '5', mtime: now }))) return
    }

    const writeFile = (f: { abs: string; rel: string; size: number }, cb: () => void): void => {
      if (failed) return cb()
      const nameBuf = Buffer.from(f.rel, 'utf8')
      if (nameBuf.length > 100) {
        const lh = headerBlock({ name: '././@LongLink', size: nameBuf.length, typeflag: 'L', mtime: now })
        if (!w(lh) || !w(nameBuf)) return cb()
        const pad = Buffer.alloc(padTo512(nameBuf.length))
        if (pad.length && !w(pad)) return cb()
      }
      if (!w(headerBlock({ name: f.rel, size: f.size, typeflag: '0', mtime: now }))) return cb()
      const src = fs.createReadStream(f.abs)
      src.on('data', (d: Buffer | string) => { if (failed) return; gzip.write(d) })
      src.on('error', () => { if (!failed) { failed = true; reject(new Error(`读取失败: ${f.abs}`)) } })
      src.on('end', () => {
        const pad = Buffer.alloc(padTo512(f.size))
        if (pad.length) w(pad)
        cb()
      })
    }

    const run = (idx: number): void => {
      if (failed) return
      if (idx >= files.length) {
        w(Buffer.alloc(1024))
        gzip.end(() => resolve())
        return
      }
      writeFile(files[idx], () => run(idx + 1))
    }
    run(0)
    gzip.pipe(out)
  })
}
