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
export { diffLines } from './diff'
export type { DiffLine } from './diff'
export { polishLog } from './ai'
export type { Journal, JournalStep } from './journal'
export { JournalStore } from './journal'
