// packages/core/src/preflight.ts
// 发布预检（硬阻断项清单；引擎内部使用，私有模块）

import fs from 'node:fs'
import type { PlannedRepo, ProjectDef, RepoDef } from '@bxverse/shared'
import { currentBranch, dirtyCount, git, head, isRepo, tagExists, tagTarget } from './git'
import * as version from './version'

export interface PreflightResult {
  ok: boolean
  blocked: string[]
}

/**
 * 预检阻塞项（不满足 → 阻断该仓库发布）：
 * - 路径存在且是 git 仓库
 * - 非空仓库（有提交）
 * - HEAD 非 detached
 * - 工作树无已跟踪文件改动（dirtyCount === 0）
 * - milestone tag 不撞车（同版本标签已存在且指向不同 commit）
 */
export async function runPreflight(repo: RepoDef, plan: PlannedRepo, _project: ProjectDef): Promise<PreflightResult> {
  const blocked: string[] = []
  if (!fs.existsSync(repo.path) || !(await isRepo(repo.path))) {
    return { ok: false, blocked: ['路径不存在或不是 git 仓库'] }
  }
  let repoHead = ''
  try {
    repoHead = await head(repo.path)
  } catch {
    blocked.push('空仓库（无提交），请先提交后再发布')
  }
  if (repoHead) {
    try {
      const branch = await currentBranch(repo.path)
      if (branch === '(detached)') blocked.push('HEAD 处于 detached 状态，请切换到具体分支')
    } catch {
      // 已在 head() 处处理空仓库
    }
    const dirty = await dirtyCount(repo.path)
    if (dirty > 0) blocked.push(`工作树有 ${dirty} 个未提交改动（仅统计已跟踪文件），请先提交或 stash`)
    if (plan.changed) {
      // 扩展 R30：里程碑标签含 prerelease 前缀（vX.Y.Z-beta.N）
      const parsed = version.parseSemver(plan.version)
      if (parsed) {
        const milestone = `v${parsed.major}.${parsed.minor}.${parsed.patch}` + (parsed.prerelease ? `-${parsed.prerelease}` : '')
        if (await tagExists(repo.path, milestone)) {
          const target = await tagTarget(repo.path, milestone)
          if (target && target !== repoHead) {
            blocked.push(`里程碑标签 ${milestone} 已存在且指向不同 commit，请提升版本号`)
          }
        }
      }
    }
  }
  void (await git(['status', '--porcelain'], { cwd: repo.path })) // 预热缓存
  return { ok: blocked.length === 0, blocked }
}
