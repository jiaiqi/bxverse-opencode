// packages/core/src/backup/tar.ts
// 零依赖 tar.gz 写入器：ustar 头 + node:zlib gzip 流式写出（R19/M6）
// 长路径（>100 字节，含中文）走 GNU 'L' longname 扩展头；不落临时文件。

import fs from 'node:fs'
import { once } from 'node:events'
import { pipeline } from 'node:stream/promises'
import type { Writable } from 'node:stream'
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

async function writeChunk(stream: Writable, chunk: Buffer): Promise<void> {
  if (stream.destroyed) throw new Error('tar 输出流已关闭')
  if (stream.write(chunk)) return
  await Promise.race([
    once(stream, 'drain').then(() => undefined),
    once(stream, 'error').then(([error]) => { throw error instanceof Error ? error : new Error(String(error)) }),
  ])
}

/**
 * 把 files（绝对路径 + 归档内相对路径）写成 tar.gz。
 * 自动补目录条目；空文件/大文件均流式处理。
 */
export async function createTarGz(files: { abs: string; rel: string; size: number }[], outFile: string): Promise<void> {
  const gzip = zlib.createGzip({ level: 6 })
  const output = fs.createWriteStream(outFile)
  const outputPromise = pipeline(gzip, output)
  const now = Date.now()

  try {
    const dirs = new Set<string>()
    for (const f of files) {
      const parts = f.rel.split('/')
      for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'))
    }
    for (const d of [...dirs].sort()) {
      await writeChunk(gzip, headerBlock({ name: `${d}/`, size: 0, typeflag: '5', mtime: now }))
    }

    for (const f of files) {
      const nameBuf = Buffer.from(f.rel, 'utf8')
      if (nameBuf.length > 100) {
        await writeChunk(gzip, headerBlock({ name: '././@LongLink', size: nameBuf.length, typeflag: 'L', mtime: now }))
        await writeChunk(gzip, nameBuf)
        const longNamePad = padTo512(nameBuf.length)
        if (longNamePad) await writeChunk(gzip, Buffer.alloc(longNamePad))
      }
      await writeChunk(gzip, headerBlock({ name: f.rel, size: f.size, typeflag: '0', mtime: now }))
      const source = fs.createReadStream(f.abs)
      for await (const chunk of source) {
        await writeChunk(gzip, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      }
      const filePad = padTo512(f.size)
      if (filePad) await writeChunk(gzip, Buffer.alloc(filePad))
    }

    await writeChunk(gzip, Buffer.alloc(1024))
    gzip.end()
    await outputPromise
  } catch (error) {
    gzip.destroy()
    output.destroy()
    await outputPromise.catch(() => {})
    try { fs.rmSync(outFile, { force: true }) } catch { /* 清理尽力而为 */ }
    throw error instanceof Error ? error : new Error(String(error))
  }
}
