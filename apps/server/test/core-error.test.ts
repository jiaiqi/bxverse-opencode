// apps/server/test/core-error.test.ts
// A1 统一错误体系：statusForCode 映射表 + sendError 序列化（单元级，不启 server）

import { describe, expect, it } from 'vitest'
import { CoreError, CORE_ERROR_CODES } from '@bxverse/core'
import { statusForCode } from '../src/http/errors'
import { sendError } from '../src/http/json'
import type { ServerResponse } from 'node:http'

/** 构造一个最小 mock ServerResponse，捕获 sendError 写入的 status + body
 *  返回对象形式而非解构：避免数值拷贝导致测试看不到内层更新
 */
function makeRes(): {
  res: ServerResponse
  status: number
  body: { error?: string; code?: string }
} {
  const obj = {
    res: undefined as unknown as ServerResponse,
    status: 0,
    body: {} as { error?: string; code?: string },
  }
  const fake: Record<string, unknown> = {
    writableEnded: false,
    headersSent: false,
    setHeader: () => undefined,
    writeHead: (s: number) => {
      obj.status = s
      return fake
    },
    end: (data?: string | Buffer) => {
      if (data) {
        try {
          obj.body = JSON.parse(String(data))
        } catch {
          /* ignore */
        }
      }
      fake.writableEnded = true
      return fake
    },
    destroy: () => undefined,
  }
  obj.res = fake as unknown as ServerResponse
  return obj
}

describe('A1 · statusForCode 映射表', () => {
  const cases: Array<[string, number]> = [
    // 400: 客户端输入层
    [CORE_ERROR_CODES.VALIDATION, 400],
    // 404: 资源不存在
    [CORE_ERROR_CODES.NOT_FOUND, 404],
    [CORE_ERROR_CODES.REPO_NOT_FOUND, 404],
    [CORE_ERROR_CODES.RECORD_NOT_FOUND, 404],
    // 409: 业务繁忙
    [CORE_ERROR_CODES.TASK_BUSY, 409],
    // 500: 引擎/IO/执行期错误
    [CORE_ERROR_CODES.GIT_TIMEOUT, 500],
    [CORE_ERROR_CODES.GIT_CONFLICT, 500],
    [CORE_ERROR_CODES.TAG_CONFLICT, 500],
    [CORE_ERROR_CODES.TAG_EXISTS_DIFFERENT, 500],
    [CORE_ERROR_CODES.BASE_UNREACHABLE, 500],
    [CORE_ERROR_CODES.RECORD_IMMUTABLE, 500],
    [CORE_ERROR_CODES.BUILD_FAILED, 500],
    [CORE_ERROR_CODES.INSTALL_FAILED, 500],
    [CORE_ERROR_CODES.BACKUP_FAILED, 500],
    [CORE_ERROR_CODES.GIT_FAILED, 500],
    // 兜底（default 分支）
    ['UNKNOWN_CODE', 500],
  ]
  for (const [code, expected] of cases) {
    it(`${code} → ${expected}`, () => {
      expect(statusForCode(code)).toBe(expected)
    })
  }
})

describe('A1 · sendError 序列化', () => {
  it('CoreError → 携带 code/message/detail，status 由 statusForCode 决定', () => {
    const r = makeRes()
    const err = new CoreError(CORE_ERROR_CODES.TAG_CONFLICT, '标签 v1.0.0 撞车', {
      tag: 'v1.0.0',
      currentTarget: 'abc',
    })
    sendError(r.res, err)
    expect(r.status).toBe(500)
    expect(r.body.code).toBe('TAG_CONFLICT')
    expect(r.body.error).toContain('v1.0.0')
  })

  it('CoreError + detail.status 显式 4xx → 透传（语义覆盖映射）', () => {
    const r = makeRes()
    const err = new CoreError(CORE_ERROR_CODES.VALIDATION, '仓库不存在', {
      status: 400,
      repoId: 'r_xxx',
    })
    sendError(r.res, err)
    expect(r.status).toBe(400)
    expect(r.body.code).toBe('VALIDATION')
  })

  it('plain Error → 500 + INTERNAL（不暴露内部堆栈）', () => {
    const r = makeRes()
    const err = new Error('内部炸了：secret-token-1234')
    sendError(r.res, err)
    expect(r.status).toBe(500)
    expect(r.body.code).toBe('INTERNAL')
    expect(r.body.error).toBe('内部炸了：secret-token-1234')
  })

  it('ApiError 旧形态（{status, code, message}）→ 仍兼容（v1 兼容窗口）', () => {
    const r = makeRes()
    const e = new Error('自定义') as Error & { status: number; code: string }
    e.status = 403
    e.code = 'FORBIDDEN'
    sendError(r.res, e)
    expect(r.status).toBe(403)
    expect(r.body.code).toBe('FORBIDDEN')
  })
})
