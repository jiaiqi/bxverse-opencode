// apps/server/src/validate.ts
// 运行时校验（P1 OpenAPI）：基于 openApiSpec 的最小可用校验，零依赖

import { apiError } from './http/json'

export function assertBackupRetention(obj: unknown, field = 'retention'): asserts obj is import('@bxverse/shared').BackupRetention {
  if (obj == null) return
  if (typeof obj !== 'object' || Array.isArray(obj)) throw apiError(400, 'VALIDATION', `${field} 必须为对象`)
  const r = obj as Record<string, unknown>
  if (r.keepLast !== undefined && r.keepLast !== null && (!Number.isInteger(r.keepLast) || (r.keepLast as number) < 1)) {
    throw apiError(400, 'VALIDATION', `${field}.keepLast 必须为 >=1 的整数`)
  }
  if (r.maxBytes !== undefined && r.maxBytes !== null && (!Number.isInteger(r.maxBytes) || (r.maxBytes as number) < 0)) {
    throw apiError(400, 'VALIDATION', `${field}.maxBytes 必须为 >=0 的整数`)
  }
  if (r.keepDays !== undefined && r.keepDays !== null && (!Number.isInteger(r.keepDays) || (r.keepDays as number) < 1)) {
    throw apiError(400, 'VALIDATION', `${field}.keepDays 必须为 >=1 的整数`)
  }
}

export function assertBackupCleanupBody(body: Record<string, unknown>): void {
  if (body.retention !== undefined) assertBackupRetention(body.retention, 'retention')
  if (body.projectId !== undefined && typeof body.projectId !== 'string') throw apiError(400, 'VALIDATION', 'projectId 必须为字符串')
  if (body.repoId !== undefined && typeof body.repoId !== 'string') throw apiError(400, 'VALIDATION', 'repoId 必须为字符串')
  if (body.dryRun !== undefined && typeof body.dryRun !== 'boolean') throw apiError(400, 'VALIDATION', 'dryRun 必须为布尔')
}

export function assertRestoreBody(body: Record<string, unknown>): void {
  const required = ['releaseId', 'repoId', 'kind', 'targetDir']
  for (const k of required) {
    if (!body[k] || typeof body[k] !== 'string' || !(body[k] as string).trim()) {
      throw apiError(400, 'VALIDATION', `${k} 必填`)
    }
  }
  if (!['source-bundle', 'source-archive', 'artifact'].includes(String(body.kind))) {
    throw apiError(400, 'VALIDATION', 'kind 必须为 source-bundle/source-archive/artifact')
  }
  const targetDir = String(body.targetDir)
  // 基础路径校验：必须为绝对路径且不为根
  const isAbsolute = /^[a-zA-Z]:[\\/]/.test(targetDir) || targetDir.startsWith('/')
  if (!isAbsolute) throw apiError(400, 'VALIDATION', 'targetDir 必须为绝对路径')
  if (/^\/?$/.test(targetDir) || /^[a-zA-Z]:[\\/]?$/.test(targetDir)) throw apiError(400, 'VALIDATION', 'targetDir 不能为根目录')
}
