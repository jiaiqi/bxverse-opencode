// scripts/gen-pwa-icons.cjs
// 零依赖生成 PWA PNG 图标（手写 PNG 编码器：crc32 + zlib，借鉴 verse 做法）
// 输出: apps/web/public/pwa-192.png / pwa-512.png / maskable-512.png
// 用法: node scripts/gen-pwa-icons.cjs

const fs = require('node:fs')
const zlib = require('node:zlib')
const path = require('node:path')

function crc32(buf) {
  const table = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

// 品牌渐变（token 体系 brand-400 → brand-700）
const TOP = [116, 143, 252] // #748FFC
const BOTTOM = [47, 73, 184] // #2F49B8
const WHITE = [255, 255, 255]

function inRoundedRect(x, y, size, radius) {
  const r = radius / size
  if (x < r && y < r) return Math.hypot(x - r, y - r) <= r
  if (x > 1 - r && y < r) return Math.hypot(x - (1 - r), y - r) <= r
  if (x < r && y > 1 - r) return Math.hypot(x - r, y - (1 - r)) <= r
  if (x > 1 - r && y > 1 - r) return Math.hypot(x - (1 - r), y - (1 - r)) <= r
  return true
}

/** 白色立方体（等距三面线框，品牌色底） */
function cubePixel(x, y) {
  // 顶面菱形 + 左右侧面
  const cx = 0.5
  const cy = 0.46
  const w = 0.30
  const h = 0.12
  const top = (px, py) => Math.abs((px - cx) / w + (py - cy) / h) + Math.abs((px - cx) / w - (py - cy) / h) <= 1.02
  const left = (px, py) => px >= cx - w && px <= cx && py >= cy && py <= cy + h * 1.9 && (px - (cx - w)) / w <= (py - cy) / (h * 1.9) + 0.06 && (px - (cx - w)) / w >= 0.94 - (py - cy) / (h * 1.9) - 0.06
  const right = (px, py) => px >= cx && px <= cx + w && py >= cy && py <= cy + h * 1.9 && (px - cx) / w >= 0.94 - (py - cy) / (h * 1.9) - 0.06 && (px - cx) / w <= (py - cy) / (h * 1.9) + 0.06
  // 线宽近似：对边界加厚度
  const d = 0.022
  return top(x, y) || left(x, y) || right(x, y)
    || (Math.abs(Math.abs((x - cx) / w + (y - cy) / h) + Math.abs((x - cx) / w - (y - cy) / h) - 1) < d && Math.abs((x - cx) / w + (y - cy) / h) + Math.abs((x - cx) / w - (y - cy) / h) < 1.1)
    || (Math.abs(x - cx) < d && y > cy - 0.02 && y < cy + h * 1.9)
    || (Math.abs((x - cx) / w + (y - cy) / h - 1) < d && x > cx - w && x < cx)
    || (Math.abs((x - cx) / w - (y - cy) / h + 1) < d && x > cx && x < cx + w)
}

function makePng(size, drawPixel, radius) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0 // filter none
    const t = y / size
    const bg = [
      Math.round(TOP[0] + (BOTTOM[0] - TOP[0]) * t),
      Math.round(TOP[1] + (BOTTOM[1] - TOP[1]) * t),
      Math.round(TOP[2] + (BOTTOM[2] - TOP[2]) * t),
    ]
    for (let x = 0; x < size; x++) {
      const off = y * (size * 4 + 1) + 1 + x * 4
      const px = x / size
      const py = y / size
      if (!inRoundedRect(px, py, size, radius)) {
        raw[off] = raw[off + 1] = raw[off + 2] = raw[off + 3] = 0
        continue
      }
      if (drawPixel(px, py)) {
        raw[off] = WHITE[0]
        raw[off + 1] = WHITE[1]
        raw[off + 2] = WHITE[2]
        raw[off + 3] = 255
      } else {
        raw[off] = bg[0]
        raw[off + 1] = bg[1]
        raw[off + 2] = bg[2]
        raw[off + 3] = 255
      }
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const idat = zlib.deflateSync(raw, { level: 9 })
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const outDir = path.join(__dirname, '..', 'apps', 'web', 'public')
fs.mkdirSync(outDir, { recursive: true })

fs.writeFileSync(path.join(outDir, 'pwa-192.png'), makePng(192, cubePixel, 42))
fs.writeFileSync(path.join(outDir, 'pwa-512.png'), makePng(512, cubePixel, 112))
// maskable：内容安全区更大（立方体缩小）
fs.writeFileSync(path.join(outDir, 'maskable-512.png'), makePng(512, (x, y) => {
  const sx = (x - 0.5) / 0.8 + 0.5
  const sy = (y - 0.5) / 0.8 + 0.5
  if (sx < 0 || sx > 1 || sy < 0 || sy > 1) return false
  return cubePixel(sx, sy)
}, 112))

console.log('PWA 图标已生成: apps/web/public/pwa-192.png / pwa-512.png / maskable-512.png')
