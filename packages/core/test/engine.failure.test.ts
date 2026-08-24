// T2 失败隔离集成测试：5 场景各断言失败隔离、journal 状态、错误可定位
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { DataStore, loadAppConfig, saveAppConfig } from '../src/store'
import { executePublish } from '../src/engine'
import { JournalStore } from '../src/journal'
import * as git from '../src/git'
import * as backup from '../src/backup'
import type { ProjectDef, PublishEvent } from '@bxverse/shared'
import { makeRepo, commit } from './helpers/repo'

function clearJournals(): void {
  const dir = path.join(process.env.BX_HOME!, 'journal')
  if (!fs.existsSync(dir)) return
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith('.json')) {
      try { fs.unlinkSync(path.join(dir, f)) } catch {}
    }
    if (f.endsWith('.events.jsonl')) {
      try { fs.unlinkSync(path.join(dir, f)) } catch {}
    }
  }
}

async function setProjects(projects: ProjectDef[]): Promise<void> {
  const cfg = await loadAppConfig()
  cfg.projects = projects
  await saveAppConfig(cfg)
}

function findJournalForProject(projectId: string): ReturnType<JournalStore['listAll']>[number] | null {
  const js = new JournalStore()
  const all = js.listAll().filter(j => j.projectId === projectId)
  if (all.length === 0) return null
  // 最新的 done 优先按 startedAt 倒序
  all.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  return all[0]
}

describe('engine failure isolation (T2 Wave1 P0)', () => {
  beforeEach(() => {
    clearJournals()
    vi.restoreAllMocks()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('场景1 构建失败：repoA buildCommand=exit 1 失败隔离，其余继续，failedRepos 含 A，journal 最终 done', async () => {
    const repoAPath = makeRepo()
    commit(repoAPath, 'feat(a): 功能A', { 'src/a.ts': 'aaa' })
    const repoBPath = makeRepo()
    commit(repoBPath, 'feat(b): 功能B', { 'src/b.ts': 'bbb' })

    const repoAId = `r_fail_build_a_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`
    const repoBId = `r_fail_build_b_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`
    const projectId = `p_fail_build_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`
    const project: ProjectDef = {
      id: projectId,
      name: 'fail-build',
      version: 'v1.0.0',
      bump: 'auto',
      repoVersionScheme: 'hybrid',
      externalExclude: ['chore', 'docs'],
      repos: [
        { id: repoAId, name: 'repo-A', path: repoAPath, writeVersionFile: true, outputDir: 'public', lastPublishCommit: null, buildCommand: 'exit 1' },
        { id: repoBId, name: 'repo-B', path: repoBPath, writeVersionFile: true, outputDir: 'public', lastPublishCommit: null },
      ],
      createdAt: new Date().toISOString(),
    }
    await setProjects([project])

    const events: PublishEvent[] = []
    const result = await executePublish({ projectId, bump: 'auto', offline: true }, { onEvent: e => events.push(e) })

    // 断言1：失败仓库标记 failed 且其余继续
    expect(result.failedRepos).toContain(repoAId)
    expect(result.failedRepos).not.toContain(repoBId)
    expect(result.releaseId).toBeTruthy() // 部分成功仍产出 project record

    // 断言2：其余仓库不受影响（B 的记录与标签已落盘，A 无记录）
    const cfg = await loadAppConfig()
    const store = new DataStore({ dataDir: cfg.dataDir })
    const recA = await store.listRecords(repoAId)
    const recB = await store.listRecords(repoBId)
    expect(recA).toHaveLength(0)
    expect(recB).toHaveLength(1)
    expect(recB[0].version).toMatch(/^v1\./)

    const tagsB = await git.listTags(repoBPath)
    expect(tagsB.some(t => t.startsWith('build/'))).toBe(true)
    // repoA 未到 tag 阶段（构建失败在 tag 之前），无 build tag
    const tagsA = await git.listTags(repoAPath)
    expect(tagsA.filter(t => t.startsWith('build/'))).toHaveLength(0)

    // 断言3：journal 最终 done（部分成功仍为 done，非 failed）
    const journal = findJournalForProject(projectId)
    expect(journal).not.toBeNull()
    expect(journal!.status).toBe('done')
    const buildStepA = journal!.steps.find(s => s.repoId === repoAId && s.phase === 'build')
    expect(buildStepA?.state).toBe('failed')
    expect(buildStepA?.detail).toMatch(/构建失败|exit|BUILD_FAILED/i)

    // 断言4：错误信息可定位（repo-error 带 repoId 与失败原因）
    const repoErrorA = events.find(e => e.type === 'repo-error' && e.repoId === repoAId)
    expect(repoErrorA).toBeDefined()
    expect(repoErrorA!.message).toContain('repo-A')
    expect(repoErrorA!.message).toMatch(/构建失败|exit/i)
    const repoDoneB = events.find(e => e.type === 'repo-done' && e.repoId === repoBId)
    expect(repoDoneB).toBeDefined()
    const doneEvt = events.find(e => e.type === 'done')
    expect(doneEvt).toBeDefined()
    expect((doneEvt!.data as { failedRepos?: string[] })?.failedRepos).toContain(repoAId)

    // 断言5：项目版本已前移（部分成功仍更新）
    const updated = (await loadAppConfig()).projects.find(p => p.id === projectId)!
    expect(updated.version).toMatch(/^v1\./)
    expect(updated.repos.find(r => r.id === repoBId)!.lastPublishCommit).toBeTruthy()
    // 失败仓库基准未前移
    expect(updated.repos.find(r => r.id === repoAId)!.lastPublishCommit).toBeNull()
  })

  it('场景2 tag 冲突：预打同名 build tag 触发 TAG_CONFLICT → repo-error 隔离', async () => {
    const repoAPath = makeRepo()
    commit(repoAPath, 'feat(a): A功能', { 'src/a.ts': 'aaa' })
    const repoBPath = makeRepo()
    commit(repoBPath, 'feat(b): B功能', { 'src/b.ts': 'bbb' })

    const repoAId = `r_fail_tag_a_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`
    const repoBId = `r_fail_tag_b_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`
    const projectId = `p_fail_tag_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`
    const project: ProjectDef = {
      id: projectId,
      name: 'fail-tag',
      version: '1.0.0',
      bump: 'auto',
      repoVersionScheme: 'hybrid',
      repoVersionFormat: 'X.Y.Z',
      externalExclude: ['chore', 'docs'],
      repos: [
        { id: repoAId, name: 'repo-A', path: repoAPath, writeVersionFile: true, outputDir: 'public', lastPublishCommit: null },
        { id: repoBId, name: 'repo-B', path: repoBPath, writeVersionFile: true, outputDir: 'public', lastPublishCommit: null },
      ],
      createdAt: new Date().toISOString(),
    }
    await setProjects([project])

    // 预打同名 build tag（与下次 minor 生成的 1.1.0 相同），并移动 HEAD 使 tag 指向不同 commit 触发 TAG_CONFLICT
    await git.createTag(repoAPath, 'build/1.1.0', { message: 'pre conflict' })
    commit(repoAPath, 'feat(a2): 触发冲突的第二提交', { 'src/a2.ts': 'a2' })

    const events: PublishEvent[] = []
    const result = await executePublish({ projectId, bump: 'minor', offline: true }, { onEvent: e => events.push(e) })

    expect(result.failedRepos).toContain(repoAId)
    expect(result.failedRepos).not.toContain(repoBId)
    expect(result.releaseId).toBeTruthy()

    const cfg = await loadAppConfig()
    const store = new DataStore({ dataDir: cfg.dataDir })
    const recA = await store.listRecords(repoAId)
    const recB = await store.listRecords(repoBId)
    expect(recA).toHaveLength(0)
    expect(recB).toHaveLength(1)

    const journal = findJournalForProject(projectId)
    expect(journal).not.toBeNull()
    expect(journal!.status).toBe('done')
    // 失败仓库应在 tag 阶段 failed（且 detail 含 TAG_CONFLICT 可定位）
    const tagStepA = journal!.steps.find(s => s.repoId === repoAId && s.phase === 'tag-build')
    // 可能在 tag-milestone 或 tag-build 失败，任一 failed 即满足
    const failedTagStep = journal!.steps.find(s => s.repoId === repoAId && s.phase.startsWith('tag-') && s.state === 'failed')
    expect(failedTagStep).toBeDefined()
    expect(failedTagStep!.detail).toMatch(/TAG_CONFLICT|已存在且指向不同/i)
    void tagStepA

    const repoErrorA = events.find(e => e.type === 'repo-error' && e.repoId === repoAId)
    expect(repoErrorA).toBeDefined()
    expect(repoErrorA!.message).toContain('repo-A')
    expect(repoErrorA!.message).toMatch(/TAG_CONFLICT|标签.*已存在/i)

    const repoDoneB = events.find(e => e.type === 'repo-done' && e.repoId === repoBId)
    expect(repoDoneB).toBeDefined()

    const tagsB = await git.listTags(repoBPath)
    expect(tagsB).toContain('build/1.1.0')
    expect(tagsB).toContain('1.1.0')
    // 失败仓库的 build tag 仍为预打的旧指向，未被覆盖为新版本
    const tagsA = await git.listTags(repoAPath)
    expect(tagsA).toContain('build/1.1.0')
  })

  it('场景3 备份 onFailure=fail：产物备份失败时该仓中止，其余继续', async () => {
    const repoAPath = makeRepo()
    commit(repoAPath, 'feat(a): A', { 'src/a.ts': 'aaa' })
    const repoBPath = makeRepo()
    commit(repoBPath, 'feat(b): B', { 'src/b.ts': 'bbb' })

    const repoAId = `r_fail_backup_a_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`
    const repoBId = `r_fail_backup_b_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`
    const projectId = `p_fail_backup_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`
    const project: ProjectDef = {
      id: projectId,
      name: 'fail-backup',
      version: 'v1.0.0',
      bump: 'auto',
      repoVersionScheme: 'hybrid',
      externalExclude: ['chore', 'docs'],
      repos: [
        { id: repoAId, name: 'repo-A', path: repoAPath, writeVersionFile: true, outputDir: 'public', lastPublishCommit: null, artifactDir: 'dist' },
        { id: repoBId, name: 'repo-B', path: repoBPath, writeVersionFile: true, outputDir: 'public', lastPublishCommit: null, artifactDir: 'dist' },
      ],
      createdAt: new Date().toISOString(),
    }
    await setProjects([project])
    const cfg0 = await loadAppConfig()
    cfg0.backup = { enabled: true, source: 'both', onFailure: 'fail' }
    await saveAppConfig(cfg0)

    // 构造可备份的产物目录（A 失败分支仍会走到 artifact 备份，B 正常）
    fs.mkdirSync(path.join(repoAPath, 'dist'), { recursive: true })
    fs.writeFileSync(path.join(repoAPath, 'dist', 'app.js'), 'console.log("a")')
    fs.mkdirSync(path.join(repoBPath, 'dist'), { recursive: true })
    fs.writeFileSync(path.join(repoBPath, 'dist', 'app.js'), 'console.log("b")')

    const orig = backup.backupRepo
    const spy = vi.spyOn(backup, 'backupRepo').mockImplementation(async (opts) => {
      if (opts.repoId === repoAId) throw new Error('mocked artifact backup failure')
      return orig(opts)
    })

    const events: PublishEvent[] = []
    const result = await executePublish(
      { projectId, bump: 'auto', offline: true, backupSource: true, backupArtifacts: true },
      { onEvent: e => events.push(e) },
    )

    spy.mockRestore()
    // 恢复 backup 配置，避免污染后续用例
    const cfgRestore = await loadAppConfig()
    cfgRestore.backup = { enabled: true, source: 'both', onFailure: 'warn' }
    await saveAppConfig(cfgRestore)

    expect(result.failedRepos).toContain(repoAId)
    expect(result.failedRepos).not.toContain(repoBId)
    expect(result.releaseId).toBeTruthy()

    const cfg = await loadAppConfig()
    const store = new DataStore({ dataDir: cfg.dataDir })
    const recA = await store.listRecords(repoAId)
    const recB = await store.listRecords(repoBId)
    expect(recA).toHaveLength(0)
    expect(recB).toHaveLength(1)

    const journal = findJournalForProject(projectId)
    expect(journal).not.toBeNull()
    expect(journal!.status).toBe('done')
    const backupStepA = journal!.steps.find(s => s.repoId === repoAId && s.phase === 'backup')
    // onFailure=fail 时 backup 抛错会进入外层 catch，failCurrent 标记 running 步骤 failed，backup 步骤可能保持 failed 或 running→failed
    const failedA = journal!.steps.filter(s => s.repoId === repoAId && s.state === 'failed')
    expect(failedA.length).toBeGreaterThan(0)
    expect(failedA.some(s => /备份失败|mocked artifact/i.test(s.detail))).toBe(true)
    void backupStepA

    const repoErrorA = events.find(e => e.type === 'repo-error' && e.repoId === repoAId)
    expect(repoErrorA).toBeDefined()
    expect(repoErrorA!.message).toMatch(/备份失败|mocked artifact/i)
    const repoDoneB = events.find(e => e.type === 'repo-done' && e.repoId === repoBId)
    expect(repoDoneB).toBeDefined()
  })

  it('场景4 数据仓提交失败：mock store.commitRecords 抛错，发布仍 done 仅警告', async () => {
    const repoPath = makeRepo()
    commit(repoPath, 'feat(c): C', { 'src/c.ts': 'ccc' })

    const repoId = `r_fail_datacomm_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`
    const projectId = `p_fail_datacomm_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`
    const project: ProjectDef = {
      id: projectId,
      name: 'fail-datacomm',
      version: 'v1.0.0',
      bump: 'auto',
      repoVersionScheme: 'hybrid',
      externalExclude: ['chore', 'docs'],
      repos: [
        { id: repoId, name: 'repo-C', path: repoPath, writeVersionFile: true, outputDir: 'public', lastPublishCommit: null },
      ],
      createdAt: new Date().toISOString(),
    }
    await setProjects([project])

    const spy = vi.spyOn(DataStore.prototype, 'commitRecords').mockRejectedValue(new Error('mocked data commit failure'))

    const events: PublishEvent[] = []
    const result = await executePublish({ projectId, bump: 'auto', offline: true }, { onEvent: e => events.push(e) })

    spy.mockRestore()

    expect(result.failedRepos).toEqual([])
    expect(result.releaseId).toBeTruthy()

    const journal = findJournalForProject(projectId)
    expect(journal).not.toBeNull()
    expect(journal!.status).toBe('done')
    // 数据提交失败仅日志警告，不将 data-commit 标记为 failed（引擎仍标记 done）
    const dataStep = journal!.steps.find(s => s.repoId === null && s.phase === 'data-commit')
    expect(dataStep).toBeDefined()
    expect(dataStep!.state).toBe('done')

    const logWithWarning = events.find(e => e.type === 'log' && /数据仓库提交失败/.test(e.message))
    expect(logWithWarning).toBeDefined()
    expect(logWithWarning!.message).toContain('mocked data commit failure')

    // 仓库记录与项目记录仍已落盘（不受数据仓提交影响）
    const cfg = await loadAppConfig()
    const store = new DataStore({ dataDir: cfg.dataDir })
    const rec = await store.listRecords(repoId)
    expect(rec).toHaveLength(1)
    const projRec = await store.listRecords(projectId)
    expect(projRec).toHaveLength(1)
    expect(projRec[0].version).toMatch(/^v1\./)

    const doneEvt = events.find(e => e.type === 'done')
    expect(doneEvt).toBeDefined()
  })

  it('场景5 push 降级 warning：offline=false 但无 remote，pushed=false 仅警告，其余不受影响', async () => {
    const repoAPath = makeRepo()
    commit(repoAPath, 'feat(d): D', { 'src/d.ts': 'ddd' })
    const repoBPath = makeRepo()
    commit(repoBPath, 'feat(e): E', { 'src/e.ts': 'eee' })

    const repoAId = `r_fail_push_a_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`
    const repoBId = `r_fail_push_b_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`
    const projectId = `p_fail_push_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`
    const project: ProjectDef = {
      id: projectId,
      name: 'fail-push',
      version: 'v1.0.0',
      bump: 'auto',
      repoVersionScheme: 'hybrid',
      externalExclude: ['chore', 'docs'],
      repos: [
        { id: repoAId, name: 'repo-A', path: repoAPath, writeVersionFile: true, outputDir: 'public', lastPublishCommit: null },
        { id: repoBId, name: 'repo-B', path: repoBPath, writeVersionFile: true, outputDir: 'public', lastPublishCommit: null },
      ],
      createdAt: new Date().toISOString(),
    }
    await setProjects([project])

    // 确保无 remote（makeRepo 默认无 remote），offline=false 触发推送降级路径
    expect(await git.hasRemote(repoAPath)).toBe(false)
    expect(await git.hasRemote(repoBPath)).toBe(false)

    const events: PublishEvent[] = []
    const result = await executePublish({ projectId, bump: 'auto', offline: false }, { onEvent: e => events.push(e) })

    expect(result.failedRepos).toEqual([])
    expect(result.releaseId).toBeTruthy()

    const journal = findJournalForProject(projectId)
    expect(journal).not.toBeNull()
    expect(journal!.status).toBe('done')
    // push 降级：push 步骤标记为 failed 但整体仍 done
    const pushSteps = journal!.steps.filter(s => s.phase === 'push' && s.repoId !== null)
    expect(pushSteps.length).toBe(2)
    for (const ps of pushSteps) {
      expect(ps.state).toBe('failed')
      expect(ps.detail).toMatch(/推送失败|未配置|降级纯本地/i)
    }

    const cfg = await loadAppConfig()
    const store = new DataStore({ dataDir: cfg.dataDir })
    const recA = await store.listRecords(repoAId)
    const recB = await store.listRecords(repoBId)
    expect(recA).toHaveLength(1)
    expect(recB).toHaveLength(1)
    expect(recA[0].pushed).toBe(false)
    expect(recB[0].pushed).toBe(false)

    const pushLogs = events.filter(e => e.type === 'log' && /推送失败.*降级纯本地/.test(e.message))
    expect(pushLogs.length).toBeGreaterThanOrEqual(2)
    // 可定位：日志含仓库维度 repoId
    expect(pushLogs.every(l => typeof l.repoId === 'string' && l.repoId.length > 0)).toBe(true)

    const doneEvt = events.find(e => e.type === 'done')
    expect(doneEvt).toBeDefined()
    const pushedFlag = (await store.listRecords(projectId))[0].pushed
    expect(pushedFlag).toBe(false)
  })
})
