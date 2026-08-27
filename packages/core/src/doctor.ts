// packages/core/src/doctor.ts
// 一致性体检（zero-dep pure function over AppConfig）—— 核对 app.json 的
// lastPublishCommit 与各仓库真实 git 状态，专治「全部显示最新/提交流为空」。
// 只读：只跑 git read-only 命令，不动工作区、不打标签、不写任何东西。
//
// 设计要点：
//   - 输入：AppConfig（与 engine 保持一致，不读 store 副作用）
//   - 输出：DoctorReport（结构化，含 project/repo 维度 + 诊断 hints）
//   - 并行：仓库级体检走 runWithPool 上限 6（同 overview），单仓失败降级 ok=false
//   - 错误隔离：单仓异常不影响其他仓；多项目逐个体检

import { runWithPool } from './pool'
import { git as runGit, isRepo, head as gitHead, currentBranch, dirtyCount, listTags } from './git'
import fs from 'node:fs'
import type { AppConfig, ProjectDef, RepoDef } from '@bxverse/shared'

export type DoctorProbeState = 'ok' | 'warn' | 'error' | 'checking'

export interface DoctorRepoReport {
  /** RepoDef.id */
  repoId: string
  /** 仓库名（displayName ?? name） */
  repoName: string
  /** 当前 HEAD（短 8 位） */
  head: string
  /** 当前分支 */
  branch: string
  /** lastPublishCommit 短 8 位；null = 从未发布 */
  lastPublishCommit: string | null
  /** dirty 文件数（status --porcelain --untracked-files=no） */
  dirty: number
  /** 基准落后提交数（lastPublishCommit..HEAD；无 base 走 HEAD 全量计） */
  ahead: number
  /** 基准是否在当前分支历史内（false=force-push/切过分支 引擎将全量收集） */
  baseAncestor: boolean
  /** 该仓全部分支（短 hash + 名），用于提示「提交在别的分支」 */
  otherBranches: string[]
  /** build 标签最近 2 个 */
  buildTagsRecent: string[]
  /** v* 标签数 + 最新一条 */
  vTagsCount: number
  vTagLatest: string | null
  /** 无前缀语义标签数 + 最近 2 个（X.Y.Z） */
  plainTagsCount: number
  plainTagsRecent: string[]
  /** versionSource=packageJson 时：package.json 最近 commit（短 hash + subject） */
  packageJsonLastCommit: string | null
  state: DoctorProbeState
  /** 人类可读诊断（hints 列表；前端可逐条渲染） */
  hints: string[]
}

export interface DoctorProjectReport {
  projectId: string
  projectName: string
  projectVersion: string
  repos: DoctorRepoReport[]
}

export interface DoctorReport {
  /** BX_HOME 根（与 lastPublishCommit 对账之源） */
  home: string
  /** 跑测时间 ISO */
  at: string
  /** 异常/警告/OK 仓计数（state=error/warn/ok） */
  counts: { ok: number; warn: number; error: number }
  /** 整体结论：全 ok → ok；任一 warn 且无 error → warn；任一 error → error */
  overall: DoctorProbeState
  projects: DoctorProjectReport[]
}

export interface RunDoctorOptions {
  /** 只检指定项目（id 或 name）；缺省全检 */
  projectFilter?: string
  /** 并发上限（默认 6） */
  concurrency?: number
}

/** 调度入口 */
export async function runDoctor(
  cfg: AppConfig,
  home: string,
  options: RunDoctorOptions = {},
): Promise<DoctorReport> {
  const projects = (cfg.projects ?? []).filter(
    (p) => !options.projectFilter || p.id === options.projectFilter || p.name === options.projectFilter,
  )
  const at = new Date().toISOString()
  if (projects.length === 0) {
    return { home, at, counts: { ok: 0, warn: 0, error: 0 }, overall: 'ok', projects: [] }
  }
  const projectReports: DoctorProjectReport[] = []
  for (const p of projects) {
    projectReports.push(await runProject(p, options.concurrency ?? 6))
  }
  const counts = { ok: 0, warn: 0, error: 0 }
  for (const pr of projectReports) {
    for (const r of pr.repos) {
      if (r.state === 'ok') counts.ok += 1
      else if (r.state === 'warn') counts.warn += 1
      else if (r.state === 'error') counts.error += 1
    }
  }
  const overall: DoctorProbeState =
    counts.error > 0 ? 'error' : counts.warn > 0 ? 'warn' : 'ok'
  return { home, at, counts, overall, projects: projectReports }
}

async function runProject(p: ProjectDef, concurrency: number): Promise<DoctorProjectReport> {
  const repos: DoctorRepoReport[] = []
  await runWithPool(p.repos, concurrency, async (r) => {
    repos.push(await runOneRepo(r))
  })
  return {
    projectId: p.id,
    projectName: p.name,
    projectVersion: p.version,
    repos,
  }
}

async function runOneRepo(r: RepoDef): Promise<DoctorRepoReport> {
  const baseReport: Omit<DoctorRepoReport, 'state' | 'hints'> = {
    repoId: r.id,
    repoName: r.displayName || r.name,
    head: '',
    branch: '?',
    lastPublishCommit: r.lastPublishCommit ? r.lastPublishCommit.slice(0, 8) : null,
    dirty: 0,
    ahead: -1,
    baseAncestor: false,
    otherBranches: [],
    buildTagsRecent: [],
    vTagsCount: 0,
    vTagLatest: null,
    plainTagsCount: 0,
    plainTagsRecent: [],
    packageJsonLastCommit: null,
  }
  const hints: string[] = []
  if (!fs.existsSync(r.path)) {
    return { ...baseReport, state: 'error', hints: [`路径不存在：${r.path}`] }
  }
  if (!(await isRepo(r.path))) {
    return { ...baseReport, state: 'error', hints: [`不是 git 仓库（缺 .git）`] }
  }
  // HEAD / branch
  let head = ''
  try {
    head = await gitHead(r.path)
  } catch {
    return { ...baseReport, state: 'error', hints: ['空仓库（无提交）'] }
  }
  const branch = await currentBranch(r.path)
  const dirty = await dirtyCount(r.path)
  // ahead & baseAncestor
  let ahead = 0
  let baseAncestor = false
  if (r.lastPublishCommit) {
    const isAnc = await runGit(['merge-base', '--is-ancestor', r.lastPublishCommit, 'HEAD'], { cwd: r.path })
    baseAncestor = isAnc.ok
    const cnt = await runGit(['rev-list', `${r.lastPublishCommit}..HEAD`, '--count'], { cwd: r.path })
    ahead = cnt.ok ? Number(cnt.stdout.trim() || '0') : -1
  } else {
    const cnt = await runGit(['rev-list', 'HEAD', '--count'], { cwd: r.path })
    ahead = cnt.ok ? Number(cnt.stdout.trim() || '0') : 0
  }
  // tags
  const buildTags = await listTags(r.path, 'build/*')
  const vTags = await listTags(r.path, 'v*')
  const plainAll = await listTags(r.path)
  const plainTags = plainAll.filter((t) => /^\d+\.\d+\.\d+/.test(t))
  // 其他分支
  const branchListRes = await runGit(
    ['for-each-ref', 'refs/heads', '--format=%(refname:short) %(objectname:short)'],
    { cwd: r.path },
  )
  const otherBranches = branchListRes.ok
    ? branchListRes.stdout
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.split(' ')[1]?.startsWith(head.slice(0, 7)))
    : []
  // package.json 最近 commit
  let packageJsonLastCommit: string | null = null
  if (r.versionSource === 'packageJson') {
    const pj = await runGit(['log', '-1', '--format=%h %s', '--', 'package.json'], { cwd: r.path })
    if (pj.ok && pj.stdout.trim()) packageJsonLastCommit = pj.stdout.split('\n')[0] ?? null
  }
  // hints 合成
  if (r.lastPublishCommit && r.lastPublishCommit === head) {
    hints.push('基准 == HEAD：发布后无新提交 → 检测「最新」是正确行为')
  } else if (!r.lastPublishCommit) {
    hints.push('从未发布，首次发布将全量收集（≤500）')
  } else if (ahead > 0) {
    hints.push(`基准落后 ${ahead} 个提交 → changed 应为 true`)
  } else if (ahead === 0 && dirty > 0) {
    hints.push(`无新提交但 ${dirty} 个脏文件 → changed 应为 true（dirty）`)
  }
  if (r.lastPublishCommit && !baseAncestor) {
    hints.push('基准不可达（不在当前分支历史：切过分支/force-push）→ 引擎降级全量收集')
  }
  if (r.lastPublishCommit && ahead === 0 && baseAncestor && otherBranches.length > 0) {
    hints.push(`其他分支可能藏着新提交：${otherBranches.join(' | ')}`)
  }
  // state 决策：error 必须显式（路径/非 git/空仓）已在上方提前返回；
  // 区分 warn：基准不可达（force-push 风险提示）
  const state: DoctorProbeState = !baseAncestor && r.lastPublishCommit ? 'warn' : 'ok'
  return {
    ...baseReport,
    head: head.slice(0, 8),
    branch,
    dirty,
    ahead,
    baseAncestor,
    otherBranches,
    buildTagsRecent: buildTags.slice(-2),
    vTagsCount: vTags.length,
    vTagLatest: vTags.at(-1) ?? null,
    plainTagsCount: plainTags.length,
    plainTagsRecent: plainTags.slice(-2),
    packageJsonLastCommit,
    state,
    hints,
  }
}
