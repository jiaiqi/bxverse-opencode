// packages/core/src/engine.ts
// 变动检测、发布计划、发布编排（executePublish 状态机 + journal 续跑）

import fs from 'node:fs'
import path from 'node:path'
import { APP_NAME, BUILD_TAG_PREFIX, SEMVER_RE } from '@bxverse/shared'
import type {
  DiffStat,
  PlannedRepo,
  ProjectDef,
  PublishEvent,
  PublishPlan,
  PublishRequest,
  ReleaseRecord,
  RepoBackupRef,
  RepoDef,
  RepoStatus,
} from '@bxverse/shared'
import * as backup from './backup'
import * as changelog from './changelog'
import * as git from './git'
import { JournalStore } from './journal'
import type { Journal, JournalPhase } from './journal'
import { atomicWrite } from './home'
import { runPreflight } from './preflight'
import { DataStore, loadAppConfig, versionSafe } from './store'
import * as version from './version'

// ==================== 变更检测 ====================

/** 单仓实时状态（GET /api/repos/:pid/:rid/status 的数据源） */
export async function collectChanges(repo: RepoDef): Promise<RepoStatus> {
  const st: RepoStatus = {
    id: repo.id,
    name: repo.name,
    path: repo.path,
    branch: '',
    head: '',
    dirty: 0,
    hasRemote: false,
    remoteUrl: '',
    versionFile: null,
    buildTags: [],
    milestoneTag: null,
    lastPublishCommit: repo.lastPublishCommit ?? null,
    changed: false,
    warnings: [],
    truncated: false,
    commits: [],
  }
  if (!fs.existsSync(repo.path) || !(await git.isRepo(repo.path))) return st
  try {
    st.head = await git.head(repo.path)
  } catch {
    st.head = ''
  }
  if (st.head) {
    try {
      st.branch = await git.currentBranch(repo.path)
    } catch {
      st.branch = ''
    }
  }
  st.dirty = await git.dirtyCount(repo.path)
  st.hasRemote = await git.hasRemote(repo.path)
  st.remoteUrl = await git.remoteUrl(repo.path)

  const vfPath = path.join(repo.path, repo.outputDir ?? 'public', 'version.json')
  if (fs.existsSync(vfPath)) {
    try {
      const v = JSON.parse(fs.readFileSync(vfPath, 'utf8')) as Record<string, string>
      st.versionFile = { version: v.version ?? '', build: v.build ?? '', buildTime: v.buildTime ?? '' }
    } catch {
      st.versionFile = null
    }
  }

  st.buildTags = await git.listTags(repo.path, `${BUILD_TAG_PREFIX}/*`)
  const milestoneTags = (await git.listTags(repo.path, 'v*')).filter((t) => {
    const m = SEMVER_RE.exec(t)
    return m && m[4] === undefined
  })
  st.milestoneTag = milestoneTags.sort((a, b) => version.compareSemver(b, a))[0] ?? null

  if (st.head) {
    const diagnostics: string[] = []
    const maxCommits = repo.lastPublishCommit ? 3000 : 500
    st.commits = await git.commitsSince(repo.path, repo.lastPublishCommit ?? null, {
      maxCommits,
      warnings: diagnostics,
    })
    st.warnings = diagnostics
    st.truncated = diagnostics.some(message => message.includes('超过'))
    st.changed = st.commits.length > 0 || st.dirty > 0
  }
  return st
}

/** 纯函数：按已收集状态划分变动/未变动仓库（server 轮询调用） */
export function detectChanged(
  repos: RepoDef[],
  statuses: Record<string, RepoStatus>,
): { changed: RepoDef[]; unchanged: RepoDef[] } {
  const changed: RepoDef[] = []
  const unchanged: RepoDef[] = []
  for (const r of repos) {
    (statuses[r.id]?.changed ? changed : unchanged).push(r)
  }
  return { changed, unchanged }
}

// ==================== 发布计划 ====================

function repoVersionFor(project: ProjectDef, projectVersion: string, stamp: string): string {
  return project.repoVersionScheme === 'timestamp' ? `v${stamp}` : version.hybridVersion(projectVersion, stamp)
}

/** 计算发布计划（POST /api/publish dryRun 的数据源） */
export async function planPublish(req: PublishRequest): Promise<PublishPlan> {
  const cfg = await loadAppConfig()
  const project = cfg.projects.find(p => p.id === req.projectId)
  if (!project) throw new Error(`项目不存在: ${req.projectId}`)
  const candidateIds = req.repoIds ?? project.repos.map(r => r.id)
  const invalid = candidateIds.filter(id => !project.repos.some(r => r.id === id))
  if (invalid.length) throw new Error(`工作区中不存在的仓库: ${invalid.join(', ')}`)

  const warnings: string[] = []
  const statuses: Record<string, RepoStatus> = {}
  for (const repo of project.repos) {
    if (!candidateIds.includes(repo.id)) continue
    statuses[repo.id] = await collectChanges(repo)
    warnings.push(...(statuses[repo.id].warnings ?? []).map(w => `${repo.name}：${w}`))
  }

  let changedRepos = project.repos.filter(r => candidateIds.includes(r.id) && statuses[r.id]?.changed)

  // 提交级排除（向导人工甄别「哪些 commit 值得进版本」）：
  // 排除后该仓库若无剩余提交且无 dirty → 降级为 syncedOnly
  if (req.excludeCommits) {
    for (const [repoId, hashes] of Object.entries(req.excludeCommits)) {
      const st = statuses[repoId]
      if (!st || hashes.length === 0) continue
      const excluded = new Set(hashes)
      const before = st.commits.length
      st.commits = st.commits.filter(c => !excluded.has(c.fullHash))
      if (st.commits.length < before) {
        warnings.push(`${st.name} 排除 ${before - st.commits.length} 个提交，参与本次发布 ${st.commits.length} 个`)
      }
      if (st.commits.length === 0 && st.dirty === 0) {
        st.changed = false
      }
    }
    // 排除后重算变动集合
    changedRepos = project.repos.filter(r => candidateIds.includes(r.id) && statuses[r.id]?.changed)
  }

  const allCommits = changedRepos.flatMap(r => statuses[r.id].commits)
  changelog.classifyCommits(allCommits)

  const suggestedBump = project.bump === 'manual' ? 'patch' : version.suggestBump(allCommits)
  const bump = req.bump === 'auto' ? suggestedBump : req.bump
  const projectVersion = version.bumpSemver(project.version, bump)

  // buildStamp：已有 build tag 的 stamp 集合 + 发布记录占用 → 撞名自动加序号
  const store = new DataStore({ dataDir: cfg.dataDir })
  const usedStamps = new Set<string>()
  for (const r of changedRepos) {
    for (const t of statuses[r.id].buildTags) {
      const m = t.match(/(\d{8,10})$/)
      if (m) usedStamps.add(m[1])
    }
  }
  const recordTaken = (s: string): boolean =>
    changedRepos.some(r =>
      fs.existsSync(path.join(store.dataDir, 'releases', r.id, versionSafe(repoVersionFor(project, projectVersion, s)), 'data.json')),
    )
  let stamp = version.buildStamp(new Date(), usedStamps)
  while (recordTaken(stamp)) {
    usedStamps.add(stamp)
    stamp = version.buildStamp(new Date(), usedStamps)
  }

  // diff 统计（并行；失败降级全 0 + warning）
  const diffs: Record<string, DiffStat> = {}
  await Promise.all(
    changedRepos.map(async (r) => {
      diffs[r.id] = await git.diffStat(r.path, r.lastPublishCommit ?? null, { warnings })
    }),
  )

  const changed: PlannedRepo[] = changedRepos.map((repo) => {
    const st = statuses[repo.id]
    const commits = st.commits
    if (commits.length === 0 && st.dirty > 0) {
      warnings.push(`${repo.name} 仅有未提交改动，无新提交参与本次发布`)
    }
    return {
      repoId: repo.id,
      name: repo.name,
      changed: true,
      version: repoVersionFor(project, projectVersion, stamp),
      from: repo.lastPublishCommit ?? null,
      to: st.head,
      commits,
      buildCommand: repo.buildCommand,
      diffStat: diffs[repo.id],
      warnings: st.warnings,
    }
  })

  const syncedOnly: PlannedRepo[] = project.repos
    .filter(r => candidateIds.includes(r.id) && !statuses[r.id]?.changed)
    .map(r => ({
      repoId: r.id,
      name: r.name,
      changed: false,
      version: projectVersion,
      from: r.lastPublishCommit ?? null,
      to: statuses[r.id]?.head ?? '',
      commits: [],
      buildCommand: r.buildCommand,
    }))

  const now = new Date().toISOString()
  const milestoneTag = projectVersion
  const externalDraft = changelog.renderExternal(allCommits, {
    version: projectVersion,
    date: now,
    repoName: '全部仓库',
    projectName: project.name,
    buildStamp: stamp,
    exclude: project.externalExclude,
  })
  const internalDraft = changelog.renderInternal(allCommits, {
    version: projectVersion,
    baseVersion: project.version,
    date: now,
    repoName: '全部仓库',
    projectName: project.name,
    buildStamp: stamp,
    from: null,
    tags: [milestoneTag],
    stats: changelog.computeStats(allCommits, Object.values(diffs).reduce((sum, diff) => ({
      filesChanged: sum.filesChanged + diff.filesChanged,
      insertions: sum.insertions + diff.insertions,
      deletions: sum.deletions + diff.deletions,
    }), { filesChanged: 0, insertions: 0, deletions: 0 })),
  })

  if (!(await git.hasRemote(store.dataDir))) {
    warnings.push('数据仓库未配置远程，发布后仅本地提交（可稍后手动同步）')
  }

  // 执行上下文保留完整提交文件列表；HTTP 层如需压缩应构造独立 DTO，不能污染落盘记录。

  return {
    projectId: project.id,
    projectName: project.name,
    projectVersion,
    buildStamp: stamp,
    bump,
    suggestedBump,
    changed,
    syncedOnly,
    milestoneTag,
    tags: changed.map(r => ({ repoId: r.repoId, name: r.name, tag: `${BUILD_TAG_PREFIX}/${r.version}` })),
    externalDraft,
    internalDraft,
    warnings,
  }
}

// ==================== 版本文件写入 ====================

interface HistoryItem {
  version: string
  build: string
  buildTime: string
  sync?: boolean
}

function appendHistory(outDir: string, item: HistoryItem): void {
  const hp = path.join(outDir, 'version-history.json')
  let arr: HistoryItem[] = []
  if (fs.existsSync(hp)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(hp, 'utf8'))
      arr = Array.isArray(parsed) ? parsed : []
    } catch {
      arr = []
    }
  }
  arr.push(item)
  atomicWrite(hp, JSON.stringify(arr, null, 2))
}

/**
 * 写入业务仓库 version.json + version-history.json（受 writeVersionFile 开关控制）。
 * 幂等：与本次计划内容一致 → 跳过；与上次发布记录版本一致 → 正常覆盖；其余 → 抛错防误覆盖。
 */
export async function writeVersionFiles(
  repo: RepoDef,
  plan: PlannedRepo,
  _project: ProjectDef,
  buildStamp: string,
  prevRecordVersion?: string,
): Promise<void> {
  if (repo.writeVersionFile === false) return
  const outDir = path.join(repo.path, repo.outputDir ?? 'public')
  fs.mkdirSync(outDir, { recursive: true })
  const vfPath = path.join(outDir, 'version.json')
  const data: HistoryItem = { version: plan.version, build: buildStamp, buildTime: new Date().toISOString() }
  if (fs.existsSync(vfPath)) {
    let existing: HistoryItem | null = null
    try {
      existing = JSON.parse(fs.readFileSync(vfPath, 'utf8')) as HistoryItem
    } catch {
      existing = null
    }
    if (existing && existing.version === data.version && existing.build === data.build) return
    if (!existing || (prevRecordVersion && existing.version !== prevRecordVersion)) {
      throw new Error(`version.json 与计划不一致（可能被外部修改）: ${vfPath}`)
    }
  }
  atomicWrite(vfPath, JSON.stringify(data, null, 2))
  appendHistory(outDir, data)
}

/** 未变动仓库仅同步基版：version.json 的 version 更新为本次发布的项目版本，build/buildTime 保持上次值 */
export async function syncUnchangedVersionFile(repo: RepoDef, projectVersion: string): Promise<void> {
  if (repo.writeVersionFile === false) return
  const outDir = path.join(repo.path, repo.outputDir ?? 'public')
  fs.mkdirSync(outDir, { recursive: true })
  const vfPath = path.join(outDir, 'version.json')
  let base: Partial<HistoryItem> = {}
  if (fs.existsSync(vfPath)) {
    try {
      base = JSON.parse(fs.readFileSync(vfPath, 'utf8')) as HistoryItem
    } catch {
      base = {}
    }
  }
  const data: HistoryItem = {
    version: projectVersion,
    build: base.build ?? '',
    buildTime: base.buildTime ?? '',
  }
  atomicWrite(vfPath, JSON.stringify(data, null, 2))
  appendHistory(outDir, { ...data, sync: true })
}

// ==================== 发布编排 ====================

export interface ExecuteResult {
  releaseId: string | null
  failedRepos: string[]
}

/**
 * 发布执行状态机（串行、失败隔离、journal 续跑）：
 * preflight → [per-repo: build → tags → backup(R19) → version-file → push → record] → sync-unchanged
 * → project-record → data-commit（里程碑 tag + commit + push）→ done
 */
export async function executePublish(
  req: PublishRequest,
  opts: { onEvent: (e: PublishEvent) => void; taskId?: string },
): Promise<ExecuteResult> {
  const { onEvent } = opts
  const emit = (type: PublishEvent['type'], message: string, extra: Partial<PublishEvent> = {}) =>
    onEvent({ type, message, ...extra } as PublishEvent)

  const cfg = await loadAppConfig()
  const project = cfg.projects.find(p => p.id === req.projectId)
  if (!project) throw new Error(`项目不存在: ${req.projectId}`)
  const store = new DataStore({ dataDir: cfg.dataDir })
  const journalStore = new JournalStore()

  // ---- 备份配置（R19：总开关默认开启；单次发布必须显式打开具体备份类型） ----
  const backupCfg = { enabled: true, source: 'both' as const, onFailure: 'warn' as const, ...(cfg.backup ?? {}) }
  const backupRoot = backupCfg.dir?.trim() || path.join(store.homeDir, 'backups')

  // ---- 续跑检测：同项目存在活跃 journal → 复用其 taskId 与锁存计划 ----
  const existing = journalStore.findActive(project.id)
  const resume = !!(existing && existing.plan)
  const journal: Journal = resume && existing
    ? { ...existing, status: 'running' }
    : {
        taskId: opts.taskId ?? `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        projectId: project.id,
        startedAt: new Date().toISOString(),
        status: 'running',
        request: req,
        plan: null,
        steps: [],
      }
  const plan = resume ? (journal.plan as PublishPlan) : await planPublish(req)
  journal.plan = plan
  journalStore.save(journal)
  if (resume) emit('log', `检测到中断任务 ${journal.taskId}，从断点续跑（跳过已完成仓库）`)

  const stepOf = (repoId: string | null, phase: JournalPhase) =>
    journal.steps.find(s => s.repoId === repoId && s.phase === phase)
  const setStep = (
    repoId: string | null,
    phase: JournalPhase,
    state: 'pending' | 'running' | 'done' | 'failed',
    detail = '',
    result: Partial<NonNullable<ReturnType<typeof stepOf>>> = {},
  ) => {
    const now = new Date().toISOString()
    const s = stepOf(repoId, phase)
    if (s) {
      s.state = state
      s.detail = detail
      Object.assign(s, result)
      if (state === 'running') s.startedAt = now
      if (state === 'done' || state === 'failed') s.finishedAt = now
    } else {
      journal.steps.push({
        seq: journal.steps.length + 1,
        repoId,
        phase,
        state,
        detail,
        ...result,
        ...(state === 'running' ? { startedAt: now } : {}),
        ...(state === 'done' || state === 'failed' ? { finishedAt: now } : {}),
      })
    }
    journalStore.save(journal)
    if (detail) emit('step', detail, repoId ? { repoId } : {})
  }
  const failCurrent = (repoId: string | null, message: string) => {
    const s = journal.steps.filter(x => x.repoId === repoId && x.state === 'running').pop()
    if (s) {
      s.state = 'failed'
      s.detail = message
      journalStore.save(journal)
    }
  }

  const repoDefOf = (id: string): RepoDef => {
    const r = project.repos.find(x => x.id === id)
    if (!r) throw new Error(`仓库不存在: ${id}`)
    return r
  }

  // ---- 1. 预检 ----
  const failedRepos: string[] = []
  for (const planned of plan.changed) {
    if (resume && stepOf(planned.repoId, 'record')?.state === 'done') continue
    setStep(planned.repoId, 'preflight', 'running')
    const pf = await runPreflight(repoDefOf(planned.repoId), planned, project)
    if (!pf.ok) {
      setStep(planned.repoId, 'preflight', 'failed', pf.blocked.join('；'))
      emit('repo-error', `${planned.name} 预检未通过：${pf.blocked.join('；')}`, { repoId: planned.repoId })
      failedRepos.push(planned.repoId)
    } else {
      setStep(planned.repoId, 'preflight', 'done')
    }
  }

  // ---- 2. 逐 changed 仓库（串行，失败隔离） ----
  const repoRecords: ReleaseRecord[] = []
  const backupRefs: RepoBackupRef[] = []
  if (resume) {
    for (const planned of plan.changed) {
      const step = stepOf(planned.repoId, 'record')
      if (step?.state !== 'done') continue
      const recordId = step.releaseId ?? store.nextReleaseId('repo', planned.repoId, planned.version)
      const record = await store.readRecord(recordId)
      if (!record) throw new Error(`恢复失败：已完成仓库记录不存在 ${recordId}`)
      repoRecords.push(record)
      for (const ref of record.backups ?? step.backupRefs ?? []) {
        if (!backupRefs.some(existingRef => existingRef.releaseId === ref.releaseId && existingRef.repoId === ref.repoId)) {
          backupRefs.push(ref)
        }
      }
    }
  }
  const syncWarnings: string[] = []
  const syncFailedRepos: string[] = []
  // 仓库级并行（默认串行 1，可通过 AppConfig.publish.concurrency 开启；隔离验证：每仓库独立路径，无共享写入，saveProject 合并批量落盘）
  const concurrency = Math.min(Math.max(Number((cfg as unknown as { publish?: { concurrency?: number } }).publish?.concurrency ?? 1), 1), 5)
  const toRun = plan.changed.filter(p => !(resume && stepOf(p.repoId, 'record')?.state === 'done') && !failedRepos.includes(p.repoId))
  async function runWithPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
    if (limit <= 1) { for (const it of items) await fn(it); return }
    const queue = [...items]
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (queue.length > 0) { const it = queue.shift()!; await fn(it) }
    })
    await Promise.all(workers)
  }
  await runWithPool(toRun, concurrency, async (planned) => {
    const repo = repoDefOf(planned.repoId)
    const repoReleaseId = store.nextReleaseId('repo', repo.id, planned.version)
    emit('repo-start', `${planned.name} 开始发布 → ${planned.version}`, { repoId: planned.repoId })
    try {
      // 2.1 构建（失败 → repo-error，未打标签无污染）
      if (repo.buildCommand && !req.skipBuild) {
        setStep(planned.repoId, 'build', 'running')
        emit('log', `执行构建: ${repo.buildCommand}`, { repoId: planned.repoId })
        const r = await git.runShell(repo.buildCommand, repo.path, line => emit('log', line, { repoId: planned.repoId }))
        if (!r.ok) throw new Error(`构建失败: ${r.stderr.split('\n')[0] || `退出码 ${r.code}`}`)
        setStep(planned.repoId, 'build', 'done')
      } else if (repo.buildCommand && req.skipBuild) {
        emit('log', '跳过构建（--skip-build）', { repoId: planned.repoId })
      }

      // 2.2 标签（幂等）
      const m = planned.version.match(/^v?(\d+)\.(\d+)\.(\d+)/)
      const milestone = m ? `v${m[1]}.${m[2]}.${m[3]}` : plan.milestoneTag
      setStep(planned.repoId, 'tag-milestone', 'running')
      await git.createTag(repo.path, milestone, { message: `Release ${milestone}` })
      setStep(planned.repoId, 'tag-milestone', 'done', milestone)

      const buildTag = `${BUILD_TAG_PREFIX}/${planned.version}`
      setStep(planned.repoId, 'tag-build', 'running')
      await git.createTag(repo.path, buildTag, { message: `Build ${planned.version}` })
      setStep(planned.repoId, 'tag-build', 'done', buildTag)

      // 2.3 备份（R19：源码 bundle/快照 + 产物归档；失败策略 AppConfig.backup.onFailure）
      let repoBackup: RepoBackupRef | null = null
      const wantSource = backupCfg.enabled && req.backupSource === true
      const wantArtifact = backupCfg.enabled && req.backupArtifacts === true
      if (wantSource || wantArtifact) {
        setStep(planned.repoId, 'backup', 'running')
        try {
          repoBackup = await backup.backupRepo({
            projectId: project.id,
            repoId: repo.id,
            repoName: planned.name,
            repoPath: repo.path,
            version: planned.version,
            releaseId: repoReleaseId,
            commit: planned.to || (await git.head(repo.path)),
            tag: buildTag,
            backupDir: backupRoot,
            source: wantSource,
            sourceMode: backupCfg.source,
            artifact: wantArtifact,
            artifactDir: repo.artifactDir,
            log: msg => emit('log', msg, { repoId: planned.repoId }),
          })
          if (repoBackup) {
            await store.writeBackupMeta(repoBackup)
            backupRefs.push(repoBackup)
          }
          setStep(
            planned.repoId,
            'backup',
            'done',
            repoBackup ? `${repoBackup.items.length} 类备份完成` : '无备份内容',
            repoBackup ? { backupRefs: [repoBackup], outputRefs: repoBackup.items.map(item => item.file) } : {},
          )
        } catch (e) {
          if (backupCfg.onFailure === 'fail') throw e
          emit('log', `备份失败（降级为警告，发布继续）: ${(e as Error).message}`, { repoId: planned.repoId })
          setStep(planned.repoId, 'backup', 'failed', (e as Error).message)
        }
      }

      // 2.4 版本文件（幂等）
      setStep(planned.repoId, 'version-file', 'running')
      const prevRecord = (await store.listRecords(repo.id, 1))[0]
      await writeVersionFiles(repo, planned, project, plan.buildStamp, prevRecord?.version)
      setStep(planned.repoId, 'version-file', 'done')

      // 2.5 推送（失败降级纯本地）
      let pushed = false
      if (!req.offline) {
        setStep(planned.repoId, 'push', 'running')
        try {
          await git.pushTag(repo.path, milestone)
          await git.pushTag(repo.path, buildTag)
          pushed = true
          setStep(planned.repoId, 'push', 'done')
        } catch (e) {
          emit('log', `推送失败（降级纯本地）: ${(e as Error).message}`, { repoId: planned.repoId })
          setStep(planned.repoId, 'push', 'failed', (e as Error).message)
        }
      }

      // 2.6 仓库记录（不可变落盘）+ 前移检测基准（并发安全：先收敛内存，落盘在池外批量）
      setStep(planned.repoId, 'record', 'running')
      const date = new Date().toISOString()
      const stats = changelog.computeStats(planned.commits, planned.diffStat)
      const internal = changelog.renderInternal(planned.commits, {
        version: planned.version,
        baseVersion: plan.projectVersion,
        date,
        repoName: planned.name,
        projectName: project.name,
        buildStamp: plan.buildStamp,
        from: planned.from ?? null,
        tags: [buildTag, milestone],
        stats,
      })
      const external = changelog.renderExternal(planned.commits, {
        version: planned.version,
        date,
        repoName: planned.name,
        projectName: project.name,
        buildStamp: plan.buildStamp,
        exclude: project.externalExclude,
      })
      const record: ReleaseRecord = {
        id: repoReleaseId,
        kind: 'repo',
        scopeId: repo.id,
        scopeName: planned.name,
        version: planned.version,
        baseVersion: plan.projectVersion,
        buildStamp: plan.buildStamp,
        bump: plan.bump,
        date,
        from: planned.from ?? null,
        to: planned.to,
        commits: planned.commits,
        stats,
        logs: {
          internal: { state: 'auto', content: internal, autoDraft: internal },
          external: { state: 'auto', content: external, autoDraft: external },
        },
        tags: { build: buildTag, milestone },
        pushed,
        builtBy: APP_NAME,
        backups: repoBackup ? [repoBackup] : undefined,
      }
      await store.writeRecord(record)
      repoRecords.push(record)
      setStep(planned.repoId, 'record', 'done', record.id, {
        releaseId: record.id,
        targetCommit: planned.to,
        recordPath: `releases/${record.scopeId}/${versionSafe(record.version)}/data.json`,
        backupRefs: record.backups,
      })

      repo.lastPublishCommit = planned.to ?? null

      emit('repo-done', `${planned.name} → ${planned.version}`, { repoId: planned.repoId })
    } catch (e) {
      failCurrent(planned.repoId, (e as Error).message)
      emit('repo-error', `${planned.name} 发布失败: ${(e as Error).message}`, { repoId: planned.repoId })
      failedRepos.push(planned.repoId)
    }
  })
  // 批量持久化项目 lastPublishCommit（避免并发 saveProject 竞态）
  if (toRun.length > 0) await store.saveProject(project)

  // ---- 2.5 备份保留策略自动清理（R19 扩展） ----
  if (backupCfg.retention && (backupCfg.retention.keepLast != null || backupCfg.retention.maxBytes != null || backupCfg.retention.keepDays != null)) {
    try {
      const cr = await backup.enforceRetention({
        backupDir: backupRoot,
        dataStore: store,
        retention: backupCfg.retention,
        projectId: project.id,
        log: msg => emit('log', msg),
      })
      if (cr.deleted.length > 0) emit('log', `保留策略已清理 ${cr.deleted.length} 份过期备份，释放 ${cr.freedBytes} 字节`)
    } catch (e) {
      emit('log', `保留策略执行失败: ${(e as Error).message}`)
    }
  }

  // ---- 3. 未变动仓库同步基版 ----
  for (const s of plan.syncedOnly) {
    const repo = repoDefOf(s.repoId)
    try {
      await syncUnchangedVersionFile(repo, plan.projectVersion)
      emit('log', `${s.name} 同步基版版本号 → ${plan.projectVersion}（未变动，无标签无记录）`)
    } catch (e) {
      syncWarnings.push(`${s.name} 基版同步失败: ${(e as Error).message}`)
      syncFailedRepos.push(s.repoId)
      emit('log', syncWarnings.at(-1)!)
    }
  }

  // ---- 4. 项目聚合记录 ----
  const okCount = plan.changed.length - failedRepos.length
  // changed 全失败且无任何基版同步动作 → 无有效产出，报整体失败
  if (okCount === 0 && plan.syncedOnly.length === 0) {
    emit('error', '全部仓库失败，未生成发布记录')
    journal.status = 'failed'
    journalStore.save(journal)
    return { releaseId: null, failedRepos }
  }
  setStep(null, 'project-record', 'running')
  const allCommits = repoRecords.flatMap(r => r.commits)
  const internal = req.internalContent ?? plan.internalDraft
  const external = req.externalContent ?? plan.externalDraft
  const projectRecord: ReleaseRecord = {
    id: store.nextReleaseId('project', project.id, plan.projectVersion),
    kind: 'project',
    scopeId: project.id,
    scopeName: project.name,
    version: plan.projectVersion,
    baseVersion: project.version,
    buildStamp: plan.buildStamp,
    bump: plan.bump,
    date: new Date().toISOString(),
    commits: allCommits,
    stats: changelog.computeStats(allCommits, repoRecords.reduce((sum, record) => ({
      filesChanged: sum.filesChanged + record.stats.filesChanged,
      insertions: sum.insertions + record.stats.insertions,
      deletions: sum.deletions + record.stats.deletions,
    }), { filesChanged: 0, insertions: 0, deletions: 0 })),
    logs: {
      internal: {
        state: internal === plan.internalDraft ? 'auto' : 'edited',
        content: internal,
        autoDraft: plan.internalDraft,
      },
      external: {
        state: external === plan.externalDraft ? 'auto' : 'edited',
        content: external,
        autoDraft: plan.externalDraft,
      },
    },
    repos: project.repos.map(repo => {
      const rec = repoRecords.find(r => r.scopeId === repo.id)
      if (rec) {
        return {
          repoId: rec.scopeId,
          repoName: rec.scopeName,
          displayName: repoDefOf(rec.scopeId).displayName,
          version: rec.version,
          commits: rec.commits,
        }
      }
      // 未变动（同步基版）或发布失败的仓库也要进清单：版本取仓库当前 version.json
      // （syncedOnly 已被 syncUnchangedVersionFile 写为项目基版；失败仓库保持旧版本）
      let v = project.version
      try {
        const vfPath = path.join(repo.path, repo.outputDir ?? 'public', 'version.json')
        if (fs.existsSync(vfPath)) {
          const vf = JSON.parse(fs.readFileSync(vfPath, 'utf8')) as { version?: string }
          if (vf.version) v = vf.version
        }
      } catch {
        // 版本文件缺失/损坏 → 用项目版本兜底
      }
      return {
        repoId: repo.id,
        repoName: repo.name,
        displayName: repo.displayName,
        version: v,
        commits: [],
      }
    }),
    tags: { milestone: plan.milestoneTag },
    pushed: repoRecords.every(r => r.pushed),
    builtBy: APP_NAME,
    status: failedRepos.length > 0 || syncFailedRepos.length > 0 ? 'partial' : 'completed',
    warnings: [...plan.warnings, ...syncWarnings],
    backups: backupRefs.length > 0 ? backupRefs : undefined,
  }
  await store.writeRecord(projectRecord)
  setStep(null, 'project-record', 'done', projectRecord.id)
  project.version = plan.projectVersion
  await store.saveProject(project)

  // ---- 5. 数据仓库：里程碑标签 + commit + push ----
  try {
    await store.ensureDataRepo()
    await git.createTag(store.dataDir, plan.milestoneTag, { message: `Unified release ${plan.projectVersion}` })
  } catch (e) {
    emit('log', `数据仓库里程碑标签失败: ${(e as Error).message}`)
  }
  setStep(null, 'data-commit', 'running')
  try {
    const hash = await store.commitRecords(`release(project:${project.id}): ${plan.projectVersion}`)
    if (hash) emit('log', `数据仓库已提交 ${hash}`)
    else emit('log', '数据仓库无变更')
  } catch (e) {
    emit('log', `数据仓库提交失败: ${(e as Error).message}`)
  }
  if (!req.offline) {
    const pushR = await store.syncDataRepo('push')
    if (pushR.ok) emit('log', '数据仓库已推送')
    else emit('log', `数据仓库推送失败（仅本地提交）: ${pushR.message ?? ''}`)
  }
  setStep(null, 'data-commit', 'done')

  // ---- 6. 收尾 ----
  journal.status = 'done'
  journalStore.save(journal)
  journalStore.cleanup()
  emit('done', `统一发布完成: ${plan.projectVersion}`, {
    data: {
      releaseId: projectRecord.id,
      version: plan.projectVersion,
      failedRepos,
      syncFailedRepos: syncFailedRepos.length > 0 ? syncFailedRepos : undefined,
    },
  })
  return { releaseId: projectRecord.id, failedRepos }
}
