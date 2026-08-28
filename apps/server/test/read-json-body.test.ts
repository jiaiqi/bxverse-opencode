// apps/server/test/read-json-body.test.ts
// F1 · body 解析 UTF-8 多字节截断（optimization-plan F1）
// readJsonBody 现状：Buffer 数组累积 + 末尾 Buffer.concat().toString('utf8') 一次性 decode。
// 本测试通过 1KB 切分大 body 强制多字节字符跨 chunk，验证不会出现 U+FFFD 替换。

import { PassThrough } from 'node:stream'
import type { IncomingMessage } from 'node:http'
import { describe, expect, it } from 'vitest'
import { readJsonBody } from '../src/http/json'

/** 模拟 IncomingMessage：把指定 Buffer 序列以 1KB chunk 形式推入后 end */
function fakeReq(chunks: Buffer[]): IncomingMessage {
  const pt = new PassThrough()
  for (const c of chunks) pt.write(c)
  pt.end()
  return pt as unknown as IncomingMessage
}

/** 把 Buffer 按固定大小切块，模拟跨 chunk 边界 */
function sliceInto(full: Buffer, size: number): Buffer[] {
  const out: Buffer[] = []
  for (let i = 0; i < full.length; i += size) {
    out.push(full.subarray(i, Math.min(i + size, full.length)))
  }
  return out
}

describe('F1 · readJsonBody UTF-8 多字节', () => {
  it('中文字符跨 1KB chunk 边界不损坏（>64KB 高水位线）', async () => {
    // 20000 个 '中' = 60000 字节 UTF-8；1KB 切分 → 至少 60 个 chunk，必然跨多字节字符边界
    const s = '中'.repeat(20000)
    const body = JSON.stringify({ content: s })
    const full = Buffer.from(body, 'utf8')
    const chunks = sliceInto(full, 1024)
    const req = fakeReq(chunks)
    const parsed = (await readJsonBody(req)) as { content: string }
    expect(parsed.content).toBe(s)
    expect(parsed.content.length).toBe(20000)
    // 任何位置都不应是 U+FFFD 替换符
    expect(parsed.content.includes('\uFFFD')).toBe(false)
  })

  it('中英混合 + emoji 跨 chunk 不损坏', async () => {
    // 混排 CJK + emoji（4 字节 UTF-8） + ASCII，1KB 切分
    const s = '中文-😀-English-✨-' + '字'.repeat(5000)
    const body = JSON.stringify({ content: s })
    const full = Buffer.from(body, 'utf8')
    const chunks = sliceInto(full, 1024)
    const req = fakeReq(chunks)
    const parsed = (await readJsonBody(req)) as { content: string }
    expect(parsed.content).toBe(s)
    expect(parsed.content.includes('\uFFFD')).toBe(false)
  })

  it('32MB 上限排空：超限后 reject VALIDATION 且不破坏后续流', async () => {
    // 推 33 个 1MB chunk（33MB）超过 32MB 上限 → 应 reject apiError(400, 'VALIDATION', ...)
    // 内存策略：每推完一块 await 一次 nextTick 模拟真实流
    const pt = new PassThrough()
    const req = pt as unknown as IncomingMessage
    const pushAll = async (): Promise<void> => {
      for (let i = 0; i < 33; i++) {
        pt.write(Buffer.alloc(1024 * 1024, 0x41))
        await new Promise<void>((r) => setImmediate(r))
      }
      pt.end()
    }
    const settled = readJsonBody(req).catch((e: Error & { status?: number; code?: string }) => e)
    await pushAll()
    const err = await settled
    expect(err.status).toBe(400)
    expect(err.code).toBe('VALIDATION')
    expect(err.message).toMatch(/32MB|上限/)
  })

  it('空 body 返回 {}（不抛错）', async () => {
    const req = fakeReq([])
    const parsed = await readJsonBody(req)
    expect(parsed).toEqual({})
  })

  it('非 JSON body → 400 VALIDATION', async () => {
    const req = fakeReq([Buffer.from('not json', 'utf8')])
    const err = await readJsonBody(req).catch((e: Error & { status?: number; code?: string }) => e)
    expect(err.status).toBe(400)
    expect(err.code).toBe('VALIDATION')
  })
})
