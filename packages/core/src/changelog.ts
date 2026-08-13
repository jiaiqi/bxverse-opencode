// packages/core/src/changelog.ts
// 提交分类（Conventional Commits）、统计、对内/对外双轨日志渲染

import {
  COMMIT_TYPE_LABELS,
  COMMIT_TYPES,
  DEFAULT_EXTERNAL_EXCLUDE,
  EXTERNAL_SECTIONS,
} from '@bxverse/shared'
import type { CommitInfo, CommitType, DiffStat, Stats } from '@bxverse/shared'

const CONVENTIONAL_RE = /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.*)$/

/** 按 Conventional Commits 规则解析 subject → type/scope/breaking/rest（rest = 去除前缀后的正文） */
export function classifyCommit(subject: string): { type: CommitType; scope: string | null; breaking: boolean; rest: string } {
  const m = CONVENTIONAL_RE.exec(subject)
  if (!m) {
    return { type: 'other', scope: null, breaking: subject.includes('BREAKING'), rest: subject }
  }
  const type = (COMMIT_TYPES as string[]).includes(m[1]) ? (m[1] as CommitType) : 'other'
  return {
    type,
    scope: m[2] ?? null,
    breaking: m[3] === '!' || subject.includes('BREAKING'),
    rest: m[4] ?? '',
  }
}

/**
 * 就地补全 type/scope/breaking，并将匹配规范前缀的 subject 归一为正文（幂等）：
 * - subject 匹配规范前缀 → 剥离前缀、重分类
 * - 不匹配（已归一或非规范提交）→ 不动 subject，type 兜底（保持既有分类）
 */
export function classifyCommits(commits: CommitInfo[]): CommitInfo[] {
  for (const c of commits) {
    const m = CONVENTIONAL_RE.exec(c.subject)
    if (!m) {
      if (!(COMMIT_TYPES as string[]).includes(c.type)) c.type = 'other'
      continue
    }
    const rest = m[4] ?? ''
    c.subject = rest
    c.type = (COMMIT_TYPES as string[]).includes(m[1]) ? (m[1] as CommitType) : 'other'
    c.scope = m[2] ?? null
    c.breaking = m[3] === '!' || rest.includes('BREAKING')
  }
  return commits
}

/** 统计：byType 全量 12 键；filesChanged 优先取 diff，否则去重文件并集 */
export function computeStats(commits: CommitInfo[], diff?: DiffStat): Stats {
  const byType = {} as Record<CommitType, number>
  for (const t of COMMIT_TYPES) byType[t] = 0
  const fileSet = new Set<string>()
  for (const c of commits) {
    byType[c.type] += 1
    for (const f of c.files) fileSet.add(f)
  }
  return {
    commits: commits.length,
    filesChanged: diff?.filesChanged ?? fileSet.size,
    insertions: diff?.insertions ?? 0,
    deletions: diff?.deletions ?? 0,
    byType,
  }
}

export interface RenderInternalOpts {
  /** 完整版本号（含 v 前缀），如 v1.2.0.26081315 */
  version: string
  baseVersion: string
  date: string
  repoName: string
  projectName: string
  buildStamp: string
  /** 上次发布 commit（null = 首次发布） */
  from: string | null
  tags: string[]
  stats: Stats
}

/** 对内日志：全量技术细节（提交明细 + 影响文件 + 统计），信息不裁剪 */
export function renderInternal(commits: CommitInfo[], opts: RenderInternalOpts): string {
  const lines: string[] = []
  lines.push(`# ${opts.version} 发布记录（内部）`, '')
  lines.push(`> 项目：${opts.projectName}｜仓库：${opts.repoName}`)
  lines.push(`> 基版：${opts.baseVersion}（${opts.from === null ? '首次发布，全量收集' : opts.from}）`)
  lines.push(`> 构建：${opts.buildStamp}｜日期：${opts.date}`)
  lines.push(`> 标签：${opts.tags.length ? opts.tags.join('、') : '无'}`, '')
  lines.push('## 概览', '')
  lines.push(`- 提交：${opts.stats.commits} 个｜影响文件：${opts.stats.filesChanged}｜+${opts.stats.insertions} / -${opts.stats.deletions}`)
  const dist = COMMIT_TYPES
    .map(t => ({ t, n: opts.stats.byType[t] ?? 0 }))
    .filter(x => x.n > 0)
    .map(x => `${COMMIT_TYPE_LABELS[x.t]}(${x.t})×${x.n}`)
    .join('、')
  lines.push(`- 类型分布：${dist || '无'}`, '')
  lines.push('## 变更明细', '')
  if (commits.length === 0) {
    lines.push('本次无提交明细。', '')
  } else {
    for (const t of COMMIT_TYPES) {
      const group = commits.filter(c => c.type === t)
      if (group.length === 0) continue
      lines.push(`### ${COMMIT_TYPE_LABELS[t]}（${t}）`, '')
      for (const c of group) {
        lines.push(`#### ${t}${c.breaking ? '!' : ''}${c.scope ? `(${c.scope})` : ''}：${c.subject} \`${c.hash}\``, '')
        lines.push(`- 作者：${c.author}｜日期：${c.date}`)
        const files = [...c.files].sort()
        lines.push(`- 影响文件（${files.length}）：`)
        if (files.length === 0) {
          lines.push('  - （无文件级信息）')
        } else {
          for (const f of files) lines.push(`  - ${f}`)
        }
        if (c.breaking) lines.push('  - **[BREAKING]**')
        lines.push('')
      }
    }
  }
  lines.push('---', '', '> 由 BX 版本管理台自动生成，可人工编辑确认。')
  return lines.join('\n')
}

export interface RenderExternalOpts {
  /** 完整版本号（含 v 前缀） */
  version: string
  date: string
  repoName: string
  projectName: string
  buildStamp: string
  exclude?: CommitType[]
}

/** 对外日志：分节 + 过滤 + breaking 强制收录；不含 hash/作者/文件 */
export function renderExternal(commits: CommitInfo[], opts: RenderExternalOpts): string {
  const exclude = opts.exclude ?? DEFAULT_EXTERNAL_EXCLUDE
  const usable = commits.filter(c => !exclude.includes(c.type) || c.breaking)
  const lines: string[] = [
    `# ${opts.projectName} ${opts.version} 更新日志`,
    '',
    `> 发布日期：${opts.date}｜构建：${opts.buildStamp}`,
  ]
  let emitted = false
  for (const section of EXTERNAL_SECTIONS) {
    const items = usable.filter(c => section.types.includes(c.type))
    if (items.length === 0) continue
    lines.push('', `## ${section.title}`)
    for (const c of items) {
      const prefix = c.breaking ? '**[BREAKING]**：' : ''
      lines.push(`- ${prefix}${c.subject}${c.scope ? `（${c.scope}）` : ''}`)
    }
    emitted = true
  }
  if (!emitted) lines.push('', '本次发布无用户可见变更。')
  return lines.join('\n')
}
