// packages/core/src/journal.ts
// 发布 journal：落盘（原子写）/ 扫描 / 续跑语义（引擎内部使用，私有模块）

import fs from 'node:fs'
import path from 'node:path'
import type { PublishPlan, PublishRequest, RepoBackupRef } from '@bxverse/shared'
import { atomicWrite, resolveHome } from './home'

export type JournalPhase =
  | 'preflight'
  | 'build'
  | 'tag-milestone'
  | 'tag-build'
  | 'backup'
  | 'version-file'
  | 'package-version'
  | 'push'
  | 'record'
  | 'project-record'
  | 'data-commit'

export interface JournalStep {
  seq: number
  /** null = 项目级步骤 */
  repoId: string | null
  phase: JournalPhase
  state: 'pending' | 'running' | 'done' | 'failed'
  detail: string
  /** 扩展：步骤产物，供崩溃恢复复用 */
  releaseId?: string
  targetCommit?: string
  inputHash?: string
  recordPath?: string
  backupRefs?: RepoBackupRef[]
  outputRefs?: string[]
  startedAt?: string
  finishedAt?: string
}

export interface Journal {
  taskId: string
  projectId: string
  startedAt: string
  status: 'running' | 'done' | 'failed' | 'interrupted'
  request: PublishRequest
  /** 锁存的发布计划（续跑复用，防版本漂移） */
  plan: PublishPlan | null
  steps: JournalStep[]
}

export class JournalStore {
  private dir: string

  constructor(home?: string) {
    this.dir = resolveHome(home).journalDir
    fs.mkdirSync(this.dir, { recursive: true })
  }

  private file(taskId: string): string {
    return path.join(this.dir, `${taskId}.json`)
  }

  load(taskId: string): Journal | null {
    try {
      return JSON.parse(fs.readFileSync(this.file(taskId), 'utf8')) as Journal
    } catch {
      return null
    }
  }

  save(j: Journal): void {
    atomicWrite(this.file(j.taskId), JSON.stringify(j, null, 2))
  }

  /** 启动恢复：running 状态的 journal 标记 interrupted 并返回（SSE 广播警告用） */
  scanInterrupted(): Journal[] {
    const out: Journal[] = []
    for (const f of fs.readdirSync(this.dir)) {
      if (!f.endsWith('.json')) continue
      const j = this.load(f.replace(/\.json$/, ''))
      if (j && j.status === 'running') {
        j.status = 'interrupted'
        this.save(j)
        out.push(j)
      }
    }
    return out
  }

  /** 查找同项目活跃（running/interrupted）任务（续跑触发） */
  findActive(projectId: string): Journal | null {
    for (const f of fs.readdirSync(this.dir)) {
      if (!f.endsWith('.json')) continue
      const j = this.load(f.replace(/\.json$/, ''))
      if (j && j.projectId === projectId && (j.status === 'running' || j.status === 'interrupted')) return j
    }
    return null
  }

  /** 清理旧 journal，保留最近 keep 份（done/failed 供审计） */
  cleanup(keep = 20): void {
    const files = fs
      .readdirSync(this.dir)
      .filter(f => f.endsWith('.json'))
      .map(f => ({ f, mtime: fs.statSync(path.join(this.dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)
    for (const { f } of files.slice(keep)) {
      try {
        fs.unlinkSync(path.join(this.dir, f))
      } catch {
        // ignore
      }
    }
  }
}
