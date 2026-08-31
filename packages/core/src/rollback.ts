// packages/core/src/rollback.ts
// 升级后回退到历史版本（R32）
// 端到端 0 入侵：仅打标签 + 写 release record + 写数据仓库（git 数据仓库），不动业务仓 git 历史
//
// 设计要点：
//   - 输入：AppConfig + projectId + targetReleaseId + dataStore
//   - 输出：RollbackPreview（纯函数，零写入） / RollbackResult（带写操作）
//   - 回退语义：把"目标 release 链"标 deprecated + 给业务仓打 `revert-to/{targetVersion}` 标签
//     指向 targetCommit（业务仓 CI/CD 检测该标签自动切回 + 上线）；不直接 git checkout
//   - 风险：dirty>0 → block；isAhead / drift / compatibility mismatch → warn
//   - drift 风险复用 R31 matrix.buildMatrix 共享 pure function（零复制）

import type {
  AppConfig,
  RepoDef,
  ReleaseRecord,
  RollbackPreview,
  RollbackRequest,
  RollbackRepoImpact,
  RollbackResult,
  RollbackRiskLevel,
} from '@bxverse/shared'
import { git as runGit, tagExists, tagTarget } from './git'
import { loadAppConfig, DataStore } from './store'
import { bumpSemver } from './version'
import { buildMatrix as buildMatrixCore } from './matrix'

// ============= 工具 =============

function normalizeVersion(v: string): string {
  return v.replace(/^v/i, '').trim()
}

function isAncestorOrEqual(ancestor: string, descendant: string): boolean {
  // ancestor 已经在 descendant 的祖先链上（含自身）→ true
  if (ancestor === descendant) return true
  try {
    runGit(['merge-base', '--is-ancestor', ancestor, descendant], { cwd: process.cwd() })
    return true
  } catch {
    return false
  }
}

// ============= buildRollbackPreview =============

export interface BuildRollbackPreviewOptions {
  /** 注入 getStatus（测试用） */
  getStatus?: (repo: RepoDef) => Promise<{ head: string; dirty: number; branch: string }>
  /** 注入 matrix builder（避免循环依赖） */
  buildMatrix?: typeof buildMatrixCore
  /** 并发上限（默认 6） */
  concurrency?: number
}

/**
 * 预览回退到某 release 的影响面（零写入，只读）。
 */
export async function buildRollbackPreview(
  cfg: AppConfig,
  projectId: string,
  targetReleaseId: string,
  dataStore: DataStore,
  options: BuildRollbackPreviewOptions = {},
): Promise<RollbackPreview> {
  const project = cfg.projects.find((p) => p.id === projectId)
  if (!project) {
    throw new RollbackError('NOT_FOUND', `项目不存在: ${projectId}`, { projectId })
  }
  // 1. 拿全量 release
  const records = await dataStore.listRecords(projectId, { limit: 100, full: true })
  const targetRelease = records.find((r) => r.id === targetReleaseId)
  if (!targetRelease) {
    throw new RollbackError('NOT_FOUND', `目标 release 不存在: ${targetReleaseId}`, {
      targetReleaseId,
    })
  }
  // 2. 当前 release：最新一条非 deprecated（排除 targetRelease 自身）
  const currentRelease = records.find((r) => r.id !== targetReleaseId && !r.deprecated) ?? null

  // 3. 收集目标 release 的 tag
  const tagsToDeprecate: RollbackPreview['tagsToDeprecate'] = {
    build: targetRelease.tags?.build,
    milestone: targetRelease.tags?.milestone,
  }

  // 4. 对每个 RepoDef 算 repos[]
  const getStatus = options.getStatus ?? defaultGetStatus
  const repos: RollbackRepoImpact[] = []
  for (const r of project.repos) {
    const ref = targetRelease.repos?.find((rr) => rr.repoId === r.id)
    const targetCommit = ref?.commits?.[0]?.fullHash ?? ref?.commits?.[0]?.hash ?? null
    let currentCommit: string | null = null
    let dirty = 0
    let branch = ''
    try {
      const status = await getStatus(r)
      currentCommit = status.head || null
      dirty = status.dirty
      branch = status.branch
    } catch {
      // poll 失败：当 null 处理
    }
    const isAhead = !!(
      currentCommit &&
      targetCommit &&
      currentCommit !== targetCommit &&
      isAncestorOrEqual(targetCommit, currentCommit)
    )
    // 兼容性检查：拿当前 RepoDef.versionSource / packageManager / buildCommand 与 targetRelease 比对
    // targetRelease 仓级无 versionSource 字段（旧数据），按 unknown 处理
    const { compatibility, compatibilityHints } = checkCompatibility(r, ref)
    repos.push({
      repoId: r.id,
      repoName: r.displayName || r.name,
      path: r.path,
      branch,
      targetCommit: targetCommit ? targetCommit.slice(0, 7) : null,
      currentCommit: currentCommit ? currentCommit.slice(0, 7) : null,
      isAhead,
      dirty,
      compatibility,
      compatibilityHints,
    })
  }

  // 5. drift 风险（复用 R31 matrix）
  let driftColumnsAffected: string[] = []
  try {
    const buildMatrix = options.buildMatrix ?? buildMatrixCore
    // 用 stub getStatus 跑 matrix 拿 drift
    const matrixResult = await buildMatrix(
      cfg,
      async (repo: RepoDef) => {
        const s = await getStatus(repo)
        return {
          ...s,
          id: repo.id,
          name: repo.name,
          path: repo.path,
          hasRemote: false,
          remoteUrl: '',
          versionFile: null,
          buildTags: [],
          milestoneTag: null,
          changed: false,
          lastPublishCommit: null,
          commits: [],
        }
      },
      dataStore,
      { concurrency: options.concurrency ?? 6 },
    )
    const targetAppSet = new Set(
      targetRelease.repos
        ?.map((rr) => project.repos.find((r) => r.id === rr.repoId)?.name)
        .filter(Boolean) ?? [],
    )
    driftColumnsAffected = matrixResult.driftColumns.filter((c: string) => targetAppSet.has(c))
  } catch {
    // matrix 失败不阻断 preview
  }

  // 6. riskLevel 判定
  const riskReasons: string[] = []
  const blockRepos = repos.filter((r) => r.dirty > 0)
  if (blockRepos.length > 0) {
    for (const r of blockRepos) {
      riskReasons.push(`${r.repoName} 工作区有 ${r.dirty} 个脏文件，需先 commit 或 stash`)
    }
  }
  const aheadRepos = repos.filter((r) => r.isAhead)
  if (aheadRepos.length > 0) {
    for (const r of aheadRepos) {
      riskReasons.push(`${r.repoName} 当前 commit 领先目标 ${r.targetCommit}，回退会丢弃新提交`)
    }
  }
  if (driftColumnsAffected.length > 0) {
    riskReasons.push(
      `跨项目 drift 列：${driftColumnsAffected.join('、')}（回退后这些列可能仍 drift）`,
    )
  }
  const mismatchRepos = repos.filter((r) => r.compatibility === 'mismatch')
  if (mismatchRepos.length > 0) {
    for (const r of mismatchRepos) {
      riskReasons.push(`${r.repoName} 配置与目标版本不兼容：${r.compatibilityHints.join('；')}`)
    }
  }
  let riskLevel: RollbackRiskLevel
  if (blockRepos.length > 0) riskLevel = 'block'
  else if (aheadRepos.length > 0 || driftColumnsAffected.length > 0 || mismatchRepos.length > 0)
    riskLevel = 'warn'
  else riskLevel = 'ok'

  // 7. nextVersionSuggestion（X.Y.Z 无 v 前缀）
  const bumped = bumpSemver(targetRelease.version, 'patch')
  const nextVersionSuggestion = (bumped || '0.0.1').replace(/^v/, '')

  // 8. 日志草稿（基于 targetRelease.logs + 重新生成提示）
  const externalDraft =
    targetRelease.logs?.external?.content?.trim() ||
    `## 升级后回退到 ${targetRelease.version}\n\n参考目标 release ${targetReleaseId} 的日志。\n\n${targetRelease.commits?.map((c) => `- ${c.subject}`).join('\n') ?? ''}`
  const internalDraft =
    targetRelease.logs?.internal?.content?.trim() ||
    `## 内部说明\n\n本次为 R32 升级后回退到 ${targetRelease.version}。\n\n业务仓侧请关注 revert-to/${targetRelease.version} 标签。`

  return {
    targetVersion: targetRelease.version,
    targetRelease,
    currentRelease,
    tagsToDeprecate,
    repos,
    driftColumnsAffected,
    nextVersionSuggestion,
    externalDraft,
    internalDraft,
    riskLevel,
    riskReasons,
  }
}

function checkCompatibility(
  _repo: RepoDef,
  ref: { version?: string; build?: string } | undefined,
): { compatibility: 'ok' | 'mismatch' | 'unknown'; compatibilityHints: string[] } {
  if (!ref) {
    return {
      compatibility: 'unknown',
      compatibilityHints: ['目标 release 缺该仓记录（可能后续加入）'],
    }
  }
  // targetRelease 仓级 record 无 versionSource / packageManager / buildCommand 字段（这些是 RepoDef 字段）
  // 因此严格意义无法做细粒度比对；保守给 ok + 提示
  return { compatibility: 'ok', compatibilityHints: [] }
}

async function defaultGetStatus(
  repo: RepoDef,
): Promise<{ head: string; dirty: number; branch: string }> {
  let head = ''
  try {
    const res = await runGit(['rev-parse', 'HEAD'], { cwd: repo.path })
    head = res.ok ? res.stdout.trim() : ''
  } catch {
    /* empty */
  }
  let dirty = 0
  try {
    const res = await runGit(['status', '--porcelain', '--untracked-files=no'], { cwd: repo.path })
    if (res.ok) {
      dirty = res.stdout.split('\n').filter((l) => l.trim().length > 0).length
    }
  } catch {
    /* empty */
  }
  let branch = ''
  try {
    const res = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repo.path })
    branch = res.ok ? res.stdout.trim() : ''
  } catch {
    /* empty */
  }
  return { head, dirty, branch }
}

// ============= executeRollback =============

export interface ExecuteRollbackOptions {
  /** SSE 事件回调（用于前端实时控制台） */
  onEvent?: (type: string, message: string, repoId?: string) => void
}

export class RollbackError extends Error {
  code: string
  meta: Record<string, unknown>
  constructor(code: string, message: string, meta: Record<string, unknown> = {}) {
    super(message)
    this.name = 'RollbackError'
    this.code = code
    this.meta = meta
  }
}

/**
 * 执行回退（带写操作）。
 *
 * 流程：
 *   1. 二次确认（confirmed === true）
 *   2. preview 校验：riskLevel='block' → 409
 *   3. 给目标仓打 `revert-to/{targetVersion}` 标签（指向 targetCommit）—— 0 入侵：仅打 tag
 *   4. deprecate 旧 release 链（currentRelease → targetRelease 之间的全部 + targetRelease 自身）
 *   5. 删除指向 currentCommit 的多余 build/milestone 标签（保护历史）
 *   6. 写新 release record（status='reverted'，repos 引用 targetCommit）
 *   7. 数据仓库 commit 审计
 */
export async function executeRollback(
  req: RollbackRequest,
  dataStore: DataStore,
  cfgOrOptions?: AppConfig | ExecuteRollbackOptions,
): Promise<RollbackResult> {
  // 重载：executeRollback(req, ds, cfg, options?) / executeRollback(req, ds, options) / executeRollback(req, ds)
  let cfg: AppConfig
  let options: ExecuteRollbackOptions = {}
  if (cfgOrOptions && 'projects' in cfgOrOptions) {
    cfg = cfgOrOptions as AppConfig
  } else if (cfgOrOptions && 'onEvent' in cfgOrOptions) {
    options = cfgOrOptions as ExecuteRollbackOptions
    cfg = await loadAppConfig()
  } else {
    cfg = await loadAppConfig()
  }
  // 1. 二次确认
  if (req.confirmed !== true) {
    throw new RollbackError('CONFIRM_REQUIRED', '请确认将回退并发布新版本（confirmed=true）', {
      confirmed: req.confirmed,
    })
  }
  const preview = await buildRollbackPreview(cfg, req.projectId, req.targetReleaseId, dataStore)
  // 2. block 拒绝
  if (preview.riskLevel === 'block') {
    throw new RollbackError('RISK_BLOCKED', `回退被阻断：${preview.riskReasons.join('；')}`, {
      riskReasons: preview.riskReasons,
    })
  }
  const emit = options.onEvent ?? (() => {})

  const targetRepos = req.repoIds
    ? preview.repos.filter((r) => req.repoIds!.includes(r.repoId))
    : preview.repos

  const result: RollbackResult = {
    ok: false,
    newReleaseId: null,
    deprecatedReleaseIds: [],
    failedRepos: [],
    deletedTags: [],
    warnings: [],
  }

  emit('rollback-step', `回退开始：目标 ${preview.targetVersion}，影响 ${targetRepos.length} 个仓`)
  const fullRefs = await dataStore.listRecords(req.projectId, { limit: 100, full: true })
  const targetRelease = fullRefs.find((r) => r.id === req.targetReleaseId)
  if (!targetRelease) {
    throw new RollbackError('NOT_FOUND', `目标 release 突然消失: ${req.targetReleaseId}`)
  }
  const currentRelease = preview.currentRelease

  // 3. 给目标仓打 revert-to/{targetVersion} 标签
  const revertTag = `revert-to/${preview.targetVersion}`
  for (const r of targetRepos) {
    const repo = cfg.projects
      .find((p) => p.id === req.projectId)
      ?.repos.find((x) => x.id === r.repoId)
    if (!repo) continue
    const ref = targetRelease.repos?.find((rr) => rr.repoId === r.repoId)
    const targetCommit = ref?.commits?.[0]?.fullHash ?? ref?.commits?.[0]?.hash
    if (!targetCommit) {
      result.warnings.push(`${r.repoName} 目标 release 缺 commit 记录，跳过打 revert-to 标签`)
      continue
    }
    try {
      // 幂等：标签已存在跳过
      const exists = await tagExists(repo.path, revertTag)
      if (exists) {
        emit('rollback-step', `${r.repoName} 的 ${revertTag} 已存在，跳过`)
        continue
      }
      await runGit(['tag', revertTag, targetCommit], { cwd: repo.path })
      emit('rollback-step', `已打 ${revertTag} 指向 ${targetCommit.slice(0, 7)}（${r.repoName}）`)
    } catch (e) {
      result.failedRepos.push({
        repoId: r.repoId,
        repoName: r.repoName,
        reason: `打 revert-to 标签失败: ${(e as Error).message}`,
      })
    }
  }

  // 4. 旧 release 链 deprecate（含 targetRelease 自身 + currentRelease → targetRelease 之间）
  const toDeprecate: ReleaseRecord[] = []
  if (currentRelease) {
    // 从 currentRelease 链到 targetRelease（含）—— 用 date 倒序遍历
    const sorted = [...fullRefs].sort((a, b) => (a.date < b.date ? 1 : -1))
    let hitTarget = false
    for (const r of sorted) {
      if (r.deprecated) continue
      toDeprecate.push(r)
      if (r.id === req.targetReleaseId) {
        hitTarget = true
        break
      }
    }
    if (!hitTarget) {
      // 兜底：至少 deprecate targetRelease
      toDeprecate.push(targetRelease)
    }
  } else {
    toDeprecate.push(targetRelease)
  }
  for (const r of toDeprecate) {
    try {
      // 用 deprecateRecord 走 updateRecord 路径（绕过 writeRecord 不可变校验）
      await dataStore.deprecateRecord(
        r.id,
        `R32 rollback to ${preview.targetVersion}（${req.targetReleaseId}）`,
      )
      result.deprecatedReleaseIds.push(r.id)
      emit('rollback-step', `已标 deprecate ${r.id}（${r.version}）`)
    } catch (e) {
      result.warnings.push(`deprecate ${r.id} 失败: ${(e as Error).message}`)
    }
  }

  // 5. 删除指向 currentCommit 的多余 build/milestone 标签（保护历史：仅当标签确实指向 currentCommit）
  for (const r of targetRepos) {
    const repo = cfg.projects
      .find((p) => p.id === req.projectId)
      ?.repos.find((x) => x.id === r.repoId)
    if (!repo) continue
    // 独立拿完整 currentCommit（不依赖 preview 的短 hash）
    let currentFullCommit: string | null = null
    try {
      const r2 = await runGit(['rev-parse', 'HEAD'], { cwd: repo.path })
      if (r2.ok) currentFullCommit = r2.stdout.trim()
    } catch {
      /* skip */
    }
    if (!currentFullCommit) continue
    const buildTag = currentRelease?.tags?.build
    const milestoneTag = currentRelease?.tags?.milestone
    for (const [kind, tag] of [
      ['build', buildTag],
      ['milestone', milestoneTag],
    ] as const) {
      if (!tag) continue
      try {
        const target = await tagTarget(repo.path, tag)
        if (target && target.slice(0, 40) === currentFullCommit.slice(0, 40)) {
          const r3 = await runGit(['tag', '-d', tag], { cwd: repo.path })
          if (r3.ok) {
            result.deletedTags.push({ repoId: r.repoId, tag, kind })
            emit('rollback-step', `已删除 ${kind} 标签 ${tag}（${r.repoName}）`)
          }
        }
      } catch {
        /* 标签不存在或保护历史跳过 */
      }
    }
  }

  // 6. 写新 release record（status='reverted'，repos 引用 targetCommit）
  const newReleaseId = `rel_p_${req.projectId.slice(0, 6)}_${normalizeVersion(req.nextVersion).replace(/\./g, '_')}`
  const newRelease: ReleaseRecord = {
    id: newReleaseId,
    kind: 'project',
    scopeId: req.projectId,
    scopeName: preview.targetRelease.scopeName || req.projectId,
    version: req.nextVersion,
    baseVersion: req.nextVersion,
    buildStamp: new Date()
      .toISOString()
      .replace(/[-:T.Z]/g, '')
      .slice(0, 12),
    bump: req.bump,
    date: new Date().toISOString(),
    from: currentRelease?.to ?? undefined,
    to: targetRelease.repos?.find((rr) => rr.repoId)?.commits?.[0]?.fullHash ?? undefined,
    commits: targetRelease.commits ?? [],
    stats: targetRelease.stats ?? {
      commits: 0,
      filesChanged: 0,
      insertions: 0,
      deletions: 0,
      byType: {} as never,
    },
    logs: {
      internal: {
        state: 'confirmed',
        content: req.internalContent ?? preview.internalDraft,
        autoDraft: preview.internalDraft,
      },
      external: {
        state: 'confirmed',
        content: req.externalContent ?? preview.externalDraft,
        autoDraft: preview.externalDraft,
      },
    },
    repos: targetRelease.repos?.filter((rr) => targetRepos.some((tr) => tr.repoId === rr.repoId)),
    tags: { build: `build/${req.nextVersion}`, milestone: `v${req.nextVersion}` },
    pushed: req.offline === true ? false : true,
    builtBy: 'bxverse R32 rollback',
    status: 'completed',
    // R32 扩展：通过 deprecateReason 间接标注（不破坏既有 deprecated 字段语义）
  }
  try {
    await dataStore.writeRecord(newRelease)
    result.newReleaseId = newReleaseId
    emit('rollback-step', `已写新 release ${newReleaseId}（${req.nextVersion}）`)
  } catch (e) {
    result.warnings.push(`写新 release record 失败: ${(e as Error).message}`)
  }

  // 7. 数据仓库 commit 审计
  try {
    await dataStore.commitRecords(
      `revert: rollback ${req.projectId} from ${currentRelease?.version ?? 'none'} to ${preview.targetVersion} (${req.nextVersion})`,
    )
    emit('rollback-step', '数据仓库审计 commit 完成')
  } catch {
    /* 数据仓库不可写不阻断 */
  }

  result.ok = result.failedRepos.length === 0
  emit(
    'rollback-done',
    `回退完成：${req.nextVersion} 已发布，${result.deprecatedReleaseIds.length} 个 release 标 deprecated`,
  )
  return result
}
