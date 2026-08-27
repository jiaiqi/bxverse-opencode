// packages/core/src/errors.ts
// 统一错误体系（A1 横切）：单源 CoreError，承载可观测的业务错误码与结构化明细

export const CORE_ERROR_CODES = {
  GIT_TIMEOUT: 'GIT_TIMEOUT',
  GIT_CONFLICT: 'GIT_CONFLICT',
  GIT_FAILED: 'GIT_FAILED',
  TAG_CONFLICT: 'TAG_CONFLICT',
  TAG_EXISTS_DIFFERENT: 'TAG_EXISTS_DIFFERENT',
  BASE_UNREACHABLE: 'BASE_UNREACHABLE',
  REPO_NOT_FOUND: 'REPO_NOT_FOUND',
  REPO_INVALID: 'REPO_INVALID',
  RECORD_IMMUTABLE: 'RECORD_IMMUTABLE',
  RECORD_NOT_FOUND: 'RECORD_NOT_FOUND',
  PREFLIGHT_FAILED: 'PREFLIGHT_FAILED',
  BUILD_FAILED: 'BUILD_FAILED',
  INSTALL_FAILED: 'INSTALL_FAILED',
  PRE_BUILD_FAILED: 'PRE_BUILD_FAILED',
  PUSH_FAILED: 'PUSH_FAILED',
  BACKUP_FAILED: 'BACKUP_FAILED',
  TASK_BUSY: 'TASK_BUSY',
  VALIDATION: 'VALIDATION',
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',
  UNAUTHORIZED: 'UNAUTHORIZED',
  CLONE_FAILED: 'CLONE_FAILED',
  INTERNAL: 'INTERNAL',
} as const

export type CoreErrorCode = typeof CORE_ERROR_CODES[keyof typeof CORE_ERROR_CODES]

/**
 * 统一业务错误：code 机器可分类（HTTP 映射、日志、前端分支），message 人可读，detail 结构化上下文。
 * 约束：禁止 plain Error 直接跨层透传；跨包边界一律 CoreError。
 */
export class CoreError extends Error {
  code: CoreErrorCode
  detail?: Record<string, unknown>

  constructor(code: CoreErrorCode, message: string, detail?: Record<string, unknown>) {
    super(message)
    this.name = 'CoreError'
    this.code = code
    if (detail !== undefined) this.detail = detail
    // 维持 instanceof 在跨包/序列化边界的可靠
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export function isCoreError(err: unknown): err is CoreError {
  return err instanceof CoreError
}
