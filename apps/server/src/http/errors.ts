// apps/server/src/http/errors.ts
// CoreError code → HTTP status 映射（A1 统一错误体系）

import { CORE_ERROR_CODES } from '@bxverse/core'

// 由 core 复用，避免重复定义（core 已导出 CORE_ERROR_CODES / CoreErrorCode）
// 若 core 未导出，回退到本地定义
export function statusForCode(code: string): number {
  switch (code) {
    case CORE_ERROR_CODES.VALIDATION:
    case 'VALIDATION':
      return 400
    case CORE_ERROR_CODES.TASK_BUSY:
    case 'TASK_BUSY':
      return 409
    case CORE_ERROR_CODES.NOT_FOUND:
    case 'NOT_FOUND':
    case CORE_ERROR_CODES.REPO_NOT_FOUND:
    case 'REPO_NOT_FOUND':
    case CORE_ERROR_CODES.RECORD_NOT_FOUND:
    case 'RECORD_NOT_FOUND':
      return 404
    // 以下均 500（服务端/执行期错误）
    case CORE_ERROR_CODES.GIT_TIMEOUT:
    case 'GIT_TIMEOUT':
    case CORE_ERROR_CODES.GIT_CONFLICT:
    case 'GIT_CONFLICT':
    case CORE_ERROR_CODES.TAG_CONFLICT:
    case 'TAG_CONFLICT':
    case CORE_ERROR_CODES.TAG_EXISTS_DIFFERENT:
    case 'TAG_EXISTS_DIFFERENT':
    case CORE_ERROR_CODES.BASE_UNREACHABLE:
    case 'BASE_UNREACHABLE':
    case CORE_ERROR_CODES.RECORD_IMMUTABLE:
    case 'RECORD_IMMUTABLE':
    case CORE_ERROR_CODES.BUILD_FAILED:
    case 'BUILD_FAILED':
    case CORE_ERROR_CODES.INSTALL_FAILED:
    case 'INSTALL_FAILED':
    case CORE_ERROR_CODES.BACKUP_FAILED:
    case 'BACKUP_FAILED':
    case CORE_ERROR_CODES.GIT_FAILED:
    case 'GIT_FAILED':
    default:
      // 兼容旧 apiError code：UNAUTHORIZED→401, FORBIDDEN→403 等已在 throw 处带 status，此处兜底 500
      return 500
  }
}
