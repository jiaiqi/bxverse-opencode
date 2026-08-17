// packages/shared/src/constants.ts
// 全局共享常量

import type { CommitType } from './types'

/** 语义版本匹配：v1.0.6 / 1.0.6 / v1.0.6.26081315 */
export const SEMVER_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:\.(\d{6,10}))?$/

/** 混合版本：vX.Y.Z.YYMMDDHH */
export const HYBRID_VERSION_RE = /^v\d+\.\d+\.\d+\.\d{8,10}$/

/** build 标签：build/vX.Y.Z.YYMMDDHH */
export const BUILD_TAG_PREFIX = 'build'

export const COMMIT_TYPES: CommitType[] = [
  'feat', 'fix', 'perf', 'refactor', 'style',
  'chore', 'docs', 'test', 'build', 'ci', 'revert', 'other',
]

export const COMMIT_TYPE_LABELS: Record<CommitType, string> = {
  feat: '新增',
  fix: '修复',
  perf: '优化',
  refactor: '重构',
  style: '样式',
  chore: '杂项',
  docs: '文档',
  test: '测试',
  build: '构建',
  ci: '持续集成',
  revert: '回滚',
  other: '其他',
}

/** 对外日志默认排除的提交类型（仅收录用户可感知的变更） */
export const DEFAULT_EXTERNAL_EXCLUDE: CommitType[] = [
  'chore', 'docs', 'test', 'style', 'ci', 'build', 'revert',
]

/** 对外日志分节与提交类型映射 */
export const EXTERNAL_SECTIONS: { title: string; types: CommitType[] }[] = [
  { title: '新增', types: ['feat'] },
  { title: '优化', types: ['perf', 'refactor'] },
  { title: '修复', types: ['fix'] },
  { title: '其他', types: ['style', 'chore', 'docs', 'test', 'build', 'ci', 'revert', 'other'] },
]

/** 文件树默认忽略目录（gitignore 之外的兜底） */
export const DEFAULT_IGNORE_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'out', 'coverage', '.idea', '.vscode',
  '.cache', '.nuxt', '.next', '.output', 'target', '__pycache__', '.DS_Store',
])

/** 应用常量 */
export const APP_NAME = 'BX 版本管理台'
export const APP_DEFAULT_PORT = 8899
export const APP_DATA_DIR_NAME = '.bxverse'

/** 扩展：R21 AI 供应商预设（OpenAI 兼容；baseUrl 可在添加弹窗内修改；模型名以平台控制台为准） */
export const AI_PRESET_PROVIDERS: { key: string; name: string; baseUrl: string; placeholderModel: string; hint?: string }[] = [
  { key: 'deepseek', name: 'DeepSeek 官方', baseUrl: 'https://api.deepseek.com/v1', placeholderModel: 'deepseek-chat' },
  { key: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', placeholderModel: 'gpt-4o-mini' },
  { key: 'ollama', name: 'Ollama 本地', baseUrl: 'http://127.0.0.1:11434/v1', placeholderModel: 'qwen2.5:7b' },
  { key: 'kimi', name: 'Kimi coding plan', baseUrl: 'https://api.moonshot.cn/v1', placeholderModel: 'kimi-k2.6', hint: '模型名以 Kimi 开放平台控制台为准' },
  { key: 'mimo', name: '小米 MiMo API', baseUrl: 'https://api.xiaomimimo.com/v1', placeholderModel: 'mimo-v2.5-pro', hint: '按量付费端点；Token Plan 订阅用户在控制台获取专属地址' },
  { key: 'minimax', name: 'MiniMax coding plan', baseUrl: 'https://api.minimaxi.com/v1', placeholderModel: 'MiniMax-M3', hint: '国内站；国际站为 https://api.minimax.io/v1' },
]
