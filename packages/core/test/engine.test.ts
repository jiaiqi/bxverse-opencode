// 端到端冒烟：临时 BX_HOME + fixture 仓库，完整发布链路（plan → execute → 记录/标签/journal）
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { DataStore, loadAppConfig, saveAppConfig } from '../src/store'
import { collectChanges, executePublish, planPublish } from '../src/engine'
import type { ProjectDef, PublishEvent } from '@bxverse/shared'
import { commit, makeRepo } from './helpers/repo'

async function setupProject(): Promise<{ project: ProjectDef; repoPath: string; repoId: string }> {
  const repoPath = makeRepo()
  commit(repoPath, 'feat(a): 功能A', { 'src/a.ts': 'aaa' })
  commit(repoPath, 'fix: 修复B', { 'src/b.ts': 'bbb' })
  const repoId = 'r_test_1'
  const projectId = 'p_test_1'
  const project: ProjectDef = {
    id: projectId,
    name: '主产品线',
    version: 'v1.0.0',
    bump: 'auto',
    repoVersionScheme: 'hybrid',
    externalExclude: ['chore', 'docs', 'test', 'style', 'ci', 'build'],
    repos: [
      {
        id: repoId,
        name: 'l-pc-front',
        path: repoPath,
        writeVersionFile: true,
        outputDir: 'public',
        lastPublishCommit: null,
      },
    ],
    createdAt: new Date().toISOString(),
  }
  await saveAppConfig({ ...(await loadAppConfig()), projects: [project] })
  return { project, repoPath, repoId }
}

describe('engine 发布全链路（fixture）', () => {
  it('collectChanges：首次发布全量收集 + changed', async () => {
    const { project, repoPath } = await setupProject()
    const st = await collectChanges(project.repos[0])
    expect(st.head).toHaveLength(40)
    expect(st.branch).toBe('master')
    expect(st.changed).toBe(true)
    expect(st.commits).toHaveLength(2)
    expect(st.commits[0].type).toBe('feat')
    expect(st.lastPublishCommit).toBeNull()
    void repoPath
  })

  it('planPublish：版本建议/混合版本/草稿', async () => {
    const { project } = await setupProject()
    const plan = await planPublish({ projectId: project.id, bump: 'auto' })
    expect(plan.suggestedBump).toBe('minor') // 有 feat
    expect(plan.bump).toBe('minor')
    expect(plan.projectVersion).toBe('v1.1.0')
    expect(plan.changed).toHaveLength(1)
    expect(plan.changed[0].version).toMatch(/^v1\.1\.0\.\d{8}$/)
    expect(plan.tags[0].tag).toBe(`build/${plan.changed[0].version}`)
    expect(plan.externalDraft).toContain('## 新增')
    expect(plan.internalDraft).toContain('变更明细')
  })

  it('executePublish：标签/记录/版本文件/项目版本前移/journal done', async () => {
    const { project, repoPath } = await setupProject()
    const plan = await planPublish({ projectId: project.id, bump: 'minor' })
    const events: PublishEvent[] = []
    const result = await executePublish(
      { projectId: project.id, bump: 'minor' },
      { onEvent: e => events.push(e) },
    )

    expect(result.failedRepos).toEqual([])
    expect(result.releaseId).toBeTruthy()
    expect(events.some(e => e.type === 'repo-start')).toBe(true)
    expect(events.some(e => e.type === 'repo-done')).toBe(true)
    expect(events.at(-1)?.type).toBe('done')

    // 数据仓库：项目记录 + 仓库记录 + 里程碑 tag
    const cfg = await loadAppConfig()
    const store = new DataStore({ dataDir: cfg.dataDir })
    const projectRecords = await store.listRecords(project.id)
    expect(projectRecords).toHaveLength(1)
    expect(projectRecords[0].version).toBe('v1.1.0')
    expect(projectRecords[0].repos).toHaveLength(1)
    expect(projectRecords[0].pushed).toBe(false) // 无远程，纯本地

    const repoRecords = await store.listRecords('r_test_1')
    expect(repoRecords).toHaveLength(1)
    expect(repoRecords[0].logs.internal.state).toBe('auto')
    expect(repoRecords[0].logs.external.autoDraft).toContain('## 新增')
    // 以实际落盘版本为准（plan 与 execute 各自计算 buildStamp，跨分钟会不同）
    const repoVersion = repoRecords[0].version

    // 业务仓库：标签 + version.json
    const { listTags } = await import('../src/git')
    const tags = await listTags(repoPath)
    expect(tags).toContain(`build/${repoVersion}`)
    expect(tags).toContain('v1.1.0')
    const vf = JSON.parse(fs.readFileSync(path.join(repoPath, 'public', 'version.json'), 'utf8'))
    expect(vf.version).toBe(repoVersion)
    expect(fs.existsSync(path.join(repoPath, 'public', 'version-history.json'))).toBe(true)

    // 项目版本前移 + 检测基准更新
    const updated = (await loadAppConfig()).projects[0]
    expect(updated.version).toBe('v1.1.0')
    expect(updated.repos[0].lastPublishCommit).toBe(plan.changed[0].to)

    // journal 状态
    const { JournalStore } = await import('../src/journal')
    const js = new JournalStore()
    const journals = fs.readdirSync(path.join(process.env.BX_HOME!, 'journal'))
    expect(journals.length).toBeGreaterThan(0)
    const j = js.load(journals.find(f => f.endsWith('.json'))!.replace('.json', ''))
    expect(j?.status).toBe('done')

    // 二次发布：无变动 → changed 为空，plan 仅 syncedOnly
    const st2 = await collectChanges(updated.repos[0])
    expect(st2.changed).toBe(false)
    const plan2 = await planPublish({ projectId: project.id, bump: 'patch' })
    expect(plan2.changed).toHaveLength(0)
    expect(plan2.syncedOnly).toHaveLength(1)
  })

  it('dirty 阻断发布（预检）', async () => {
    const { project, repoPath } = await setupProject()
    fs.appendFileSync(path.join(repoPath, 'src', 'a.ts'), '// dirty change')
    const events: PublishEvent[] = []
    const result = await executePublish(
      { projectId: project.id, bump: 'patch' },
      { onEvent: e => events.push(e) },
    )
    expect(result.failedRepos).toHaveLength(1)
    expect(events.some(e => e.type === 'repo-error' && e.message.includes('未提交'))).toBe(true)
    expect(events.some(e => e.type === 'error')).toBe(true)
    expect(result.releaseId).toBeNull()
  })
})
