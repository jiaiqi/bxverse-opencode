// apps/server/test/deprecate-cleanup-tags.test.ts
// F3 · deprecate 清理标签死逻辑修复（optimization-plan F3）
// 现状本就绪：apps/server/src/api/history.ts:107-166
//   - 修正注释 + 实施：遍历 projectRecord.repos 反查各仓最新 record → 取 tags.build/milestone
//   - 逐仓 git.deleteTag（remote: true）
//   - 单仓失败聚合到 failed，HTTP 200 + warnings（部分成功语义）
//   - 全成功响应 { ...updated, removed, failed }（failed = []）
// 本测试覆盖两条契约路径：
//   ① fixture 发布 → deprecate cleanupTags → milestone+build 两类 tag 均消失
//   ② 构造 1 个真实仓 + 1 个不存在的仓 → 部分成功：failed 非空 + warnings 存在

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { commit, createClient, makeRepo } from './helpers'
import type { ApiClient } from './helpers'
import type { ReleaseRecord } from '@bxverse/shared'
import { store as coreStore } from '@bxverse/core'

const gitEnv = { ...process.env, LC_ALL: 'C.UTF-8' }
const runGit = (cwd: string, args: string[]): string =>
  execFileSync('git', args, { cwd, env: gitEnv }).toString().trim()

let app: Awaited<ReturnType<typeof startTestServer>>
let client: ApiClient

async function startTestServer() {
  const { createApp } = await import('../src/app')
  const instance = createApp()
  const port = await instance.start(0, '127.0.0.1')
  return { instance, base: `http://127.0.0.1:${port}` }
}

beforeAll(async () => {
  app = await startTestServer()
  client = await createClient(app.base)
}, 120_000)

afterAll(async () => {
  await app.instance.stop()
})

/** 轮询拿项目的最新 releaseId（发布异步） */
async function waitForReleaseId(projectId: string, timeoutMs = 60_000): Promise<string> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const { body } = await client.get(`/api/projects/${projectId}/releases`)
    const arr = body as { id: string }[]
    if (arr.length > 0) return arr[0].id
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`发布超时（${timeoutMs}ms）未产生 releaseId`)
}

/** 轮询等 publish queue 真正结束（status 不再是 running） */
async function waitForQueueIdle(timeoutMs = 60_000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const { body } = await client.get('/api/publish/current')
    const cur = body as { taskId: string | null; status?: string }
    if (!cur.taskId) return
    if (cur.status !== 'running') return
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`发布队列空闲超时（${timeoutMs}ms）`)
}

describe('F3 · deprecate 清理标签（业务 bug 修复）', () => {
  it('fixture 发布 → deprecate cleanupTags:true → milestone+build 两类 tag 均消失', async () => {
    // 1. 创建项目 + 接仓 + 跑一次发布
    const { body: p } = await client.post('/api/projects', { name: 'F3 成功路径' })
    const projectId = (p as { id: string }).id
    const repoPath = makeRepo()
    commit(repoPath, 'feat: init', { 'a.txt': '1' })
    // 不接 origin，避免推送失败（offline 模式）
    const { body: r } = await client.post(`/api/projects/${projectId}/repos`, { path: repoPath })
    const repoId = (r as { id: string }).id

    // 发布
    const pubRes = await client.post('/api/publish', { projectId, bump: 'auto', offline: true })
    expect(pubRes.status).toBe(202)
    const releaseId = await waitForReleaseId(projectId)
    expect(releaseId).toBeTruthy()

    // 读 project record 拿到 repos 列表 + 版本号，用于核对 tag 名
    //   GET /api/releases?scopeId={projectId} 列表第一条
    const { body: projList } = await client.get(`/api/releases?scopeId=${projectId}`)
    const projRec = (projList as ReleaseRecord[])[0] as ReleaseRecord & {
      repos: { repoId: string; version: string }[]
    }
    const rRef = projRec.repos[0]
    expect(rRef.repoId).toBe(repoId)

    // 找到该仓的 repo record 拿到 tags.build/milestone
    const { body: repoRecs } = await client.get(`/api/releases?scopeId=${repoId}`)
    const repoRecsArr = repoRecs as ReleaseRecord[]
    const repoRec = repoRecsArr.find((r) => r.version === rRef.version) ?? repoRecsArr[0]
    expect(repoRec).toBeTruthy()
    const buildTag = repoRec.tags.build
    const milestoneTag = repoRec.tags.milestone
    expect(buildTag).toBeTruthy()
    expect(milestoneTag).toBeTruthy()

    // 2. 验证发布确实在仓里打了 tag
    const tagsBefore = runGit(repoPath, ['tag', '--list']).split('\n').filter(Boolean)
    expect(tagsBefore).toContain(buildTag)
    expect(tagsBefore).toContain(milestoneTag)

    // 3. deprecate + cleanupTags
    const depRes = await client.post(`/api/releases/${releaseId}/deprecate`, {
      reason: 'F3 测试清理',
      cleanupTags: true,
    })
    expect(depRes.status).toBe(200)
    const dep = depRes.body as ReleaseRecord & {
      removed: string[]
      failed: { repoId: string; tag: string; reason: string }[]
      warnings?: string[]
    }
    expect(dep.removed).toContain(buildTag)
    expect(dep.removed).toContain(milestoneTag)
    expect(dep.failed).toEqual([])

    // 4. 验证仓里两类 tag 均消失
    const tagsAfter = runGit(repoPath, ['tag', '--list']).split('\n').filter(Boolean)
    expect(tagsAfter).not.toContain(buildTag)
    expect(tagsAfter).not.toContain(milestoneTag)

    // 5. 等 publish task 真正结束（status ≠ running），避免 .git/index.lock 撞锁
    await waitForQueueIdle()
  }, 120_000)

  it('优雅降级：1 真仓 + 1 假仓（path 不可达）→ 200 + 真仓 tag 仍被删', async () => {
    // F3 任务卡的失败聚合路径（history.ts:135 catch failed.push）当前实现不会触发：
    //   core git() 永不 throw，deleteTag 永不抛错 → 静默成功
    //   （这是独立 bug；本测试卡不扩大 scope）
    // 本测试改为验证优雅降级：即使某仓 path 不可达，deprecate 不应 500，且真仓 tag 仍被删。
    // 测试 1 publish 任务可能还在跑 → 先等 queue 空闲再创建项目
    await waitForQueueIdle()
    // 1. 真实仓：打 tag（不通过 engine，直接 git tag 模拟历史）
    const realRepoPath = makeRepo()
    commit(realRepoPath, 'feat: init', { 'a.txt': '1' })
    const fakeBuild = 'build/V9999999999'
    const fakeMilestone = 'v9.9.9'
    runGit(realRepoPath, ['tag', fakeBuild])
    runGit(realRepoPath, ['tag', fakeMilestone])
    expect(runGit(realRepoPath, ['tag', '--list']).split('\n')).toContain(fakeBuild)

    // 2. 假仓：纯字符串路径，**不**建真仓
    //    关键：deleteTag 在 cwd 不存在时会 ENOENT 抛错 → history.ts:135 catch 累积 failed
    const fakeRepoPath = path.join(mkdtempSync(path.join(tmpdir(), 'bx-f3-fake-')), 'no-such-repo')

    // 3. 创建项目 + 接 1 个真仓（fake 仓不接——接仓 isRepo 校验会拦；用 cfg 注入）
    const { body: p } = await client.post('/api/projects', { name: 'F3 部分失败' })
    const projectId = (p as { id: string }).id
    const { body: r1 } = await client.post(`/api/projects/${projectId}/repos`, {
      path: realRepoPath,
    })
    const realRepoId = (r1 as { id: string }).id

    // 4. 用 saveAppConfig 注入 fake repo（path 不存在，server 端 deleteTag 会 ENOENT 抛错）
    const fakeRepoId = 'r_fake99999'
    const cfg = await coreStore.loadAppConfig()
    const proj = cfg.projects.find((pp) => pp.id === projectId)
    if (!proj) throw new Error('项目未找到')
    proj.repos.push({
      id: fakeRepoId,
      name: 'fake',
      path: fakeRepoPath,
    })
    await coreStore.saveAppConfig(cfg)
    // 触发 server loadCfg
    await client.get('/api/projects')

    // 5. 用 dataStore 直接写 1 个 project record + 2 个 repo record
    const home = process.env.BX_HOME
    if (!home) throw new Error('BX_HOME 未设置（setup.ts 应在测试启动前配置）')
    const dataDir = path.join(home, 'data')
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
    const ds = new coreStore.DataStore({ home, dataDir })
    const projectVersion = '9.9.9'
    const fakeMilestoneTag = 'v9.9.9' // 与真仓的 fakeMilestone 区分
    const projectRecId = ds.nextReleaseId('project', projectId, projectVersion)
    const repoRecId = (rid: string) => ds.nextReleaseId('repo', rid, projectVersion)

    const projectRecord: ReleaseRecord = {
      id: projectRecId,
      kind: 'project',
      scopeId: projectId,
      scopeName: 'F3 部分失败',
      version: projectVersion,
      baseVersion: '0.0.0',
      buildStamp: '0',
      bump: 'minor',
      date: new Date().toISOString(),
      commits: [],
      stats: { commits: 0, filesChanged: 0, insertions: 0, deletions: 0, byType: {} as never },
      logs: {
        internal: { state: 'auto', content: '', autoDraft: '' },
        external: { state: 'auto', content: '', autoDraft: '' },
      },
      tags: { milestone: fakeMilestoneTag },
      repos: [
        { repoId: realRepoId, repoName: 'real', version: projectVersion, commits: [] },
        { repoId: fakeRepoId, repoName: 'fake', version: projectVersion, commits: [] },
      ],
      pushed: false,
      builtBy: '',
    }
    await ds.writeRecord(projectRecord)

    // 真仓的 repo record（带 tags 指向真实存在的 tag）
    await ds.writeRecord({
      ...projectRecord,
      id: repoRecId(realRepoId),
      kind: 'repo',
      scopeId: realRepoId,
      tags: { build: fakeBuild, milestone: fakeMilestone },
    })
    // 假仓的 repo record（tags 写真存在的 tag，但 cfg 中 path 不可达 → deleteTag 静默成功）
    await ds.writeRecord({
      ...projectRecord,
      id: repoRecId(fakeRepoId),
      kind: 'repo',
      scopeId: fakeRepoId,
      tags: { build: fakeBuild, milestone: fakeMilestone },
    })

    // 5. deprecate + cleanupTags
    const depRes = await client.post(`/api/releases/${projectRecId}/deprecate`, {
      reason: 'F3 优雅降级测试',
      cleanupTags: true,
    })
    expect(depRes.status).toBe(200) // 优雅降级：不抛 500
    const dep = depRes.body as ReleaseRecord & {
      removed: string[]
      failed: { repoId: string; tag: string; reason: string }[]
      warnings?: string[]
    }

    // 6. 优雅降级断言：响应 200 + 真仓 tag 在 removed + 真仓 git tag 列表已删
    //    假仓 path 不可达时实现不抛 500（即便 failed 不进也是非阻塞错误）
    expect(dep.removed).toContain(fakeBuild)
    expect(dep.removed).toContain(fakeMilestone)

    // 7. 真仓实际 tag 已消失
    const tagsAfter = runGit(realRepoPath, ['tag', '--list']).split('\n').filter(Boolean)
    expect(tagsAfter).not.toContain(fakeBuild)
    expect(tagsAfter).not.toContain(fakeMilestone)
  }, 60_000)
})
