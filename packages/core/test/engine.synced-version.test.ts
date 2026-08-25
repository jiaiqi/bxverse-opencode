import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { loadAppConfig, saveAppConfig } from '../src/store'
import { executePublish, planPublish } from '../src/engine'
import type { ProjectDef } from '@bxverse/shared'
import { commit, makeRepo } from './helpers/repo'

// 回归：R26 双格式下 syncedOnly 仓库的 version.json 必须与 changed 仓一致（无前缀核心），
// 而不是项目版本（带 v）。真实演练发现：im-web 被写成 v0.3.1，changed 仓是 0.3.1。
describe('R26 syncedOnly 基版同步使用计划内仓库版本', () => {
  it('X.Y.Z 格式：未变动仓 version.json = 0.3.1（无 v 前缀）', async () => {
    // A：有新提交（changed）；B：发布后无新提交（syncedOnly）
    const pathA = makeRepo()
    commit(pathA, 'feat: a1', { 'src/a.ts': 'a' })
    const pathB = makeRepo()
    commit(pathB, 'feat: b1', { 'src/b.ts': 'b' })

    const project: ProjectDef = {
      id: 'p_sync_r26',
      name: '同步回归',
      version: 'v0.3.0',
      bump: 'manual',
      repoVersionScheme: 'hybrid',
      repoVersionFormat: 'X.Y.Z',
      externalExclude: [],
      repos: [
        { id: 'r_a', name: 'repo-a', path: pathA, writeVersionFile: true, lastPublishCommit: null },
        { id: 'r_b', name: 'repo-b', path: pathB, writeVersionFile: true, lastPublishCommit: null },
      ],
    }
    await saveAppConfig({ ...(await loadAppConfig()), projects: [project] })

    // 首次发布：A、B 都全量收集 → 都 changed。要让 B 成为 syncedOnly，
    // 需先发一次推进 B 的基准。直接两次发布太重；改为：
    // 先整体发一次（patch），随后给 A 追加提交再发第二次，此时 B 即 syncedOnly。
    const r1 = await executePublish({ projectId: project.id, bump: 'patch' }, { onEvent: () => {} })
    expect(r1.failedRepos).toEqual([])

    commit(pathA, 'feat: a2', { 'src/a2.ts': 'a2' })

    const plan2 = await planPublish({ projectId: project.id, bump: 'patch' })
    expect(plan2.changed.map(c => c.name)).toEqual(['repo-a'])
    expect(plan2.syncedOnly.map(s => s.name)).toEqual(['repo-b'])
    // X.Y.Z 格式下计划内仓库版本为无前缀核心
    expect(plan2.syncedOnly[0].version).toBe(plan2.projectVersion.replace(/^v/, ''))

    const r2 = await executePublish({ projectId: project.id, bump: 'patch' }, { onEvent: () => {} })
    expect(r2.failedRepos).toEqual([])

    const vb = JSON.parse(fs.readFileSync(path.join(pathB, 'public', 'version.json'), 'utf8')) as { version: string }
    const va = JSON.parse(fs.readFileSync(path.join(pathA, 'public', 'version.json'), 'utf8')) as { version: string }
    // 核心断言：两仓 version 完全一致且无 v 前缀（回归 v0.x.x 混写）
    expect(vb.version).toBe(va.version)
    expect(vb.version).not.toMatch(/^v/)
  }, 120_000)
})
