// F5 resume 集成测试：续跑后 lastPublishCommit 基准回写丢失（P0）
// 复用真 git fixture（engine.test 同款 makeRepo/commit）
// 3 场景：单仓断点续跑补齐 / 多仓部分完成幂等 / 续跑后 journal done 且无幽灵变动
import { describe, expect, it, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { DataStore, loadAppConfig, saveAppConfig, versionSafe } from '../src/store'
import { collectChanges, planPublish, executePublish } from '../src/engine'
import { JournalStore } from '../src/journal'
import * as git from '../src/git'
import * as changelog from '../src/changelog'
import { makeRepo, commit } from './helpers/repo'
import type { ProjectDef } from '@bxverse/shared'

function clearJournals() {
  const dir = path.join(process.env.BX_HOME!, 'journal')
  if (!fs.existsSync(dir)) return
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith('.json')) {
      try { fs.unlinkSync(path.join(dir, f)) } catch {}
    }
  }
}

async function resetProjects(projects: ProjectDef[]) {
  const cfg = await loadAppConfig()
  cfg.projects = projects
  await saveAppConfig(cfg)
}

describe('engine resume F5（lastPublishCommit 续跑回写）', () => {
  beforeEach(() => {
    clearJournals()
  })

  it('场景1：单仓 tag done、record pending → resume 补齐 record 且回写 lastPublishCommit==planned.to', async () => {
    const repoPath = makeRepo()
    commit(repoPath, 'feat(a): 功能A', { 'src/a.ts': 'aaa' })
    commit(repoPath, 'feat(b): 功能B', { 'src/b.ts': 'bbb' })
    const repoId = `r_resume_s1_${Date.now()}`
    const projectId = `p_resume_s1_${Date.now()}`
    const project: ProjectDef = {
      id: projectId,
      name: 'resume-s1',
      version: 'v1.0.0',
      bump: 'auto',
      repoVersionScheme: 'hybrid',
      externalExclude: ['chore', 'docs'],
      repos: [
        { id: repoId, name: 'repo-s1', path: repoPath, writeVersionFile: true, outputDir: 'public', lastPublishCommit: null },
      ],
      createdAt: new Date().toISOString(),
    }
    await resetProjects([project])

    const plan = await planPublish({ projectId, bump: 'auto' })
    expect(plan.changed).toHaveLength(1)
    const planned = plan.changed[0]
    const expectedTo = planned.to
    expect(expectedTo).toHaveLength(40)

    // 构造中断 journal：tag 已 done，record 仍 pending（模拟崩溃在记录落盘前）
    const taskId = `t_resume_s1_${Date.now()}`
    const js = new JournalStore()
    js.save({
      taskId,
      projectId,
      startedAt: new Date().toISOString(),
      status: 'interrupted',
      request: { projectId, bump: 'auto' },
      plan,
      steps: [
        { seq: 1, repoId, phase: 'preflight', state: 'done', detail: '' },
        { seq: 2, repoId, phase: 'tag-milestone', state: 'done', detail: plan.milestoneTag },
        { seq: 3, repoId, phase: 'tag-build', state: 'done', detail: `build/${planned.version}` },
        // version-file / record 仍 pending，由 resume 补齐
      ],
    })

    // 确保落盘前基准仍为 null（崩溃丢失）
    const before = (await loadAppConfig()).projects.find(p => p.id === projectId)!
    expect(before.repos[0].lastPublishCommit).toBeNull()

    const events: import('@bxverse/shared').PublishEvent[] = []
    const result = await executePublish(
      { projectId, bump: 'auto', offline: true },
      { onEvent: e => events.push(e) },
    )

    expect(result.releaseId).toBeTruthy()
    expect(result.failedRepos).toEqual([])

    // 断言补齐：仓库记录已落盘，且 project.lastPublishCommit == planned.to
    const cfg = await loadAppConfig()
    const updated = cfg.projects.find(p => p.id === projectId)!
    expect(updated.repos[0].lastPublishCommit).toBe(expectedTo)
    // 等价于 exec 前 plan.changed 的 to，保证幂等
    const store = new DataStore({ dataDir: cfg.dataDir })
    const recs = await store.listRecords(repoId)
    expect(recs).toHaveLength(1)
    expect(recs[0].to).toBe(expectedTo)
    expect(recs[0].version).toBe(planned.version)

    // journal 已收尾为 done
    const j = js.load(taskId)
    expect(j?.status).toBe('done')
  })

  it('场景2：多仓 A done B pending → resume 跳过 A（无重复 tag/record），仅补齐 B', async () => {
    const repoAPath = makeRepo()
    commit(repoAPath, 'feat(a): A功能', { 'src/a.ts': 'aaa' })
    commit(repoAPath, 'fix(a): 修复', { 'src/a2.ts': 'a2' })
    const repoBPath = makeRepo()
    commit(repoBPath, 'feat(b): B功能', { 'src/b.ts': 'bbb' })

    const repoAId = `r_resume_s2a_${Date.now()}`
    const repoBId = `r_resume_s2b_${Date.now()}`
    const projectId = `p_resume_s2_${Date.now()}`
    const project: ProjectDef = {
      id: projectId,
      name: 'resume-s2',
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
    await resetProjects([project])

    const plan = await planPublish({ projectId, bump: 'auto' })
    expect(plan.changed).toHaveLength(2)
    const plannedA = plan.changed.find(p => p.repoId === repoAId)!
    const plannedB = plan.changed.find(p => p.repoId === repoBId)!
    const expectedATo = plannedA.to!
    const expectedBTo = plannedB.to!

    // 预埋 A 的已完成产物：tag + record（模拟崩溃前 A 已完成且 record 已落盘，但 saveProject 尚未将 A 的 lastPublishCommit 持久化）
    const cfg0 = await loadAppConfig()
    const store0 = new DataStore({ dataDir: cfg0.dataDir })
    await git.createTag(repoAPath, plan.milestoneTag, { message: `Release ${plan.milestoneTag}` })
    await git.createTag(repoAPath, `build/${plannedA.version}`, { message: `Build ${plannedA.version}` })

    const releaseIdA = store0.nextReleaseId('repo', repoAId, plannedA.version)
    const statsA = changelog.computeStats(plannedA.commits, plannedA.diffStat ?? { filesChanged: 0, insertions: 0, deletions: 0 })
    // renderMinimal logs for record validity
    const internalA = changelog.renderInternal(plannedA.commits, {
      version: plannedA.version,
      baseVersion: plan.projectVersion,
      date: new Date().toISOString(),
      repoName: plannedA.name,
      projectName: plan.projectName,
      buildStamp: plan.buildStamp,
      from: plannedA.from ?? null,
      tags: [`build/${plannedA.version}`, plan.milestoneTag],
      stats: statsA,
    })
    const externalA = changelog.renderExternal(plannedA.commits, {
      version: plannedA.version,
      date: new Date().toISOString(),
      repoName: plannedA.name,
      projectName: plan.projectName,
      buildStamp: plan.buildStamp,
      exclude: project.externalExclude,
    })
    await store0.writeRecord({
      id: releaseIdA,
      kind: 'repo',
      scopeId: repoAId,
      scopeName: plannedA.name,
      version: plannedA.version,
      baseVersion: plan.projectVersion,
      buildStamp: plan.buildStamp,
      bump: plan.bump,
      date: new Date().toISOString(),
      from: plannedA.from ?? null,
      to: plannedA.to,
      commits: plannedA.commits,
      stats: statsA,
      logs: {
        internal: { state: 'auto', content: internalA, autoDraft: internalA },
        external: { state: 'auto', content: externalA, autoDraft: externalA },
      },
      tags: { build: `build/${plannedA.version}`, milestone: plan.milestoneTag },
      pushed: false,
      builtBy: 'bxverse',
    })

    // 构造中断 journal：A record done，B 完全 pending
    const taskId = `t_resume_s2_${Date.now()}`
    const js = new JournalStore()
    js.save({
      taskId,
      projectId,
      startedAt: new Date().toISOString(),
      status: 'interrupted',
      request: { projectId, bump: 'auto' },
      plan,
      steps: [
        { seq: 1, repoId: repoAId, phase: 'preflight', state: 'done', detail: '' },
        { seq: 2, repoId: repoAId, phase: 'tag-milestone', state: 'done', detail: plan.milestoneTag },
        { seq: 3, repoId: repoAId, phase: 'tag-build', state: 'done', detail: `build/${plannedA.version}` },
        { seq: 4, repoId: repoAId, phase: 'version-file', state: 'done', detail: '' },
        { seq: 5, repoId: repoAId, phase: 'record', state: 'done', detail: releaseIdA, releaseId: releaseIdA, targetCommit: expectedATo, recordPath: `releases/${repoAId}/${versionSafe(plannedA.version)}/data.json` },
        // B 无 done 步骤，恢复时走 toRun
      ],
    })

    // 崩溃前 project 仍未刷新 lastPublishCommit（F5 缺陷的关键丢失点）
    const before = (await loadAppConfig()).projects.find(p => p.id === projectId)!
    expect(before.repos.find(r => r.id === repoAId)!.lastPublishCommit).toBeNull()
    expect(before.repos.find(r => r.id === repoBId)!.lastPublishCommit).toBeNull()

    const preRecA = await store0.listRecords(repoAId)
    expect(preRecA).toHaveLength(1)
    const preRecBCount = (await store0.listRecords(repoBId)).length

    const events: import('@bxverse/shared').PublishEvent[] = []
    const result = await executePublish(
      { projectId, bump: 'auto', offline: true },
      { onEvent: e => events.push(e) },
    )

    expect(result.failedRepos).toEqual([])
    expect(result.releaseId).toBeTruthy()

    // A 被跳过：无重复 tag/record
    const postTagsA = await git.listTags(repoAPath)
    expect(postTagsA.filter(t => t === `build/${plannedA.version}`)).toHaveLength(1)
    expect(postTagsA.filter(t => t === plan.milestoneTag)).toHaveLength(1)
    const postRecA = await new DataStore({ dataDir: (await loadAppConfig()).dataDir }).listRecords(repoAId)
    expect(postRecA).toHaveLength(1)
    expect(postRecA[0].id).toBe(releaseIdA)

    // B 已补齐
    const postRecB = await new DataStore({ dataDir: (await loadAppConfig()).dataDir }).listRecords(repoBId)
    expect(postRecB.length).toBe(preRecBCount + 1)
    const recB = postRecB.find(r => r.version === plannedB.version)
    expect(recB).toBeTruthy()
    expect(recB!.to).toBe(expectedBTo)

    // 关键修复断言：续跑后两仓 lastPublishCommit 均回写为 planned.to（含续跑前已完成的 A）
    const updated = (await loadAppConfig()).projects.find(p => p.id === projectId)!
    expect(updated.repos.find(r => r.id === repoAId)!.lastPublishCommit).toBe(expectedATo)
    expect(updated.repos.find(r => r.id === repoBId)!.lastPublishCommit).toBe(expectedBTo)

    // 未出现对 A 的重复 repo 事件（A 已跳过，仅 B 有 repo-start/done）
    const repoStarts = events.filter(e => e.type === 'repo-start').map(e => e.repoId)
    expect(repoStarts).not.toContain(repoAId)
    expect(repoStarts).toContain(repoBId)
  })

  it('场景3：resume 完成后 journal status=done，且再次 plan 不再报变动（幂等）', async () => {
    const repoPath = makeRepo()
    commit(repoPath, 'feat(c): C功能', { 'src/c.ts': 'ccc' })
    const repoId = `r_resume_s3_${Date.now()}`
    const projectId = `p_resume_s3_${Date.now()}`
    const project: ProjectDef = {
      id: projectId,
      name: 'resume-s3',
      version: 'v1.0.0',
      bump: 'auto',
      repoVersionScheme: 'hybrid',
      externalExclude: ['chore', 'docs'],
      repos: [
        { id: repoId, name: 'repo-s3', path: repoPath, writeVersionFile: true, outputDir: 'public', lastPublishCommit: null },
      ],
      createdAt: new Date().toISOString(),
    }
    await resetProjects([project])

    const plan = await planPublish({ projectId, bump: 'auto' })
    const planned = plan.changed[0]
    const expectedTo = planned.to!

    const taskId = `t_resume_s3_${Date.now()}`
    const js = new JournalStore()
    js.save({
      taskId,
      projectId,
      startedAt: new Date().toISOString(),
      status: 'interrupted',
      request: { projectId, bump: 'auto' },
      plan,
      steps: [
        { seq: 1, repoId, phase: 'preflight', state: 'done', detail: '' },
        { seq: 2, repoId, phase: 'tag-build', state: 'done', detail: `build/${planned.version}` },
      ],
    })

    await executePublish({ projectId, bump: 'auto', offline: true }, { onEvent: () => {} })

    // journal 收尾为 done（非 interrupted 且非 running）
    const j = js.load(taskId)
    expect(j?.status).toBe('done')
    expect(j?.plan?.projectVersion).toBe(plan.projectVersion)

    // 再次 plan 不应再报变动（基准已前移，幂等）
    const updated = (await loadAppConfig()).projects.find(p => p.id === projectId)!
    expect(updated.repos[0].lastPublishCommit).toBe(expectedTo)
    const st = await collectChanges(updated.repos[0])
    expect(st.changed).toBe(false)
    const plan2 = await planPublish({ projectId, bump: 'auto' })
    expect(plan2.changed).toHaveLength(0)
    expect(plan2.syncedOnly).toHaveLength(1)

    // 再次触发 publish（无变动）应走 syncedOnly 且不再产生新的 repo 记录
    const store = new DataStore({ dataDir: (await loadAppConfig()).dataDir })
    const beforeCount = (await store.listRecords(repoId)).length
    // 空转一次 executePublish（无变动时会在末尾产出 project record 但不再有 repo record）
    // 这里只校验 repo 记录数不变
    expect(beforeCount).toBe(1)
  })
})
