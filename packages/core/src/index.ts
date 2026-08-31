// packages/core/src/index.ts
// @bxverse/core 公共导出面：五个公开模块 + files/diff 辅助模块 + backup/compare（R19）

export * as git from './git'
export * as version from './version'
export * as changelog from './changelog'
export * as store from './store'
export * as engine from './engine'
export * as files from './files'
export * as backup from './backup'
export * as compare from './compare'
export * as logger from './logger'
export * as doctor from './doctor'
export * as release from './release'
export * as matrix from './matrix'
export { CoreError, CORE_ERROR_CODES } from './errors'
export { resolveHome, ensureDirs, atomicWrite } from './home'
export type { CoreErrorCode } from './errors'
export { diffLines } from './diff'
export type { DiffLine } from './diff'
export {
  polishLog,
  testConnection,
  chatCompletion,
  generateCommitMessage,
  explainDiff,
  fetchModels,
  normalizeBaseUrl,
} from './ai'
export type { Journal, JournalStep } from './journal'
export { JournalStore } from './journal'
export { runWithPool } from './pool'
