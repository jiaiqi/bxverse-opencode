// apps/web/src/constants/icons.ts
// CommitType 图标映射（引用 @iconify-json/carbon；类名完整静态拼写，禁止动态生成）

import type { CommitType } from '@bxverse/shared'

export const COMMIT_TYPE_ICONS: Record<CommitType, string> = {
  feat: 'i-carbon-add',
  fix: 'i-carbon-tools',
  perf: 'i-carbon-flash',
  refactor: 'i-carbon-code',
  style: 'i-carbon-color-palette',
  chore: 'i-carbon-tool-box',
  docs: 'i-carbon-document',
  test: 'i-carbon-checkbox-checked',
  build: 'i-carbon-package',
  ci: 'i-carbon-cycle',
  revert: 'i-carbon-undo',
  other: 'i-carbon-dot-mark',
}

/** 按扩展名映射文件图标（carbon） */
export function fileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'mts'].includes(ext)) return 'i-carbon-code'
  if (['vue', 'svelte'].includes(ext)) return 'i-carbon-cube'
  if (['css', 'scss', 'less', 'styl'].includes(ext)) return 'i-carbon-color-palette'
  if (['html', 'htm'].includes(ext)) return 'i-carbon-html'
  if (['json', 'jsonc'].includes(ext)) return 'i-carbon-data-table'
  if (['md', 'markdown'].includes(ext)) return 'i-carbon-document'
  if (['svg', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico'].includes(ext)) return 'i-carbon-image'
  if (['yml', 'yaml', 'toml', 'ini', 'conf', 'config'].includes(ext)) return 'i-carbon-settings'
  if (['lock'].includes(ext)) return 'i-carbon-locked'
  if (['sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd'].includes(ext)) return 'i-carbon-terminal'
  if (['gitignore', 'editorconfig'].includes(name)) return 'i-carbon-settings'
  return 'i-carbon-document'
}
