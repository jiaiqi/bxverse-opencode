// packages/core/src/journal.ts
// 发布 journal：落盘（原子写）/ 扫描 / 续跑语义（引擎内部使用，私有模块）

import fs from 'node:fs'
import path from 'node:path'
import type { PublishEvent, PublishPlan, PublishRequest, RepoBackupRef } from '@bxverse/shared'
import { atomicWrite, resolveHome } from './home'

export const MAX_JOURNAL_EVENTS = 5000

export type JournalPhase =
  | 'preflight'
  | 'version-sync'
  | 'install'
  | 'pre-build'
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

  get journalDir(): string {
    return this.dir
  }

  private file(taskId: string): string {
    return path.join(this.dir, `${taskId}.json`)
  }

  eventsFile(taskId: string): string {
    return path.join(this.dir, `${taskId}.events.jsonl`)
  }

  appendEvent(taskId: string, event: PublishEvent): void {
    try {
      fs.mkdirSync(this.dir, { recursive: true })
      fs.appendFileSync(this.eventsFile(taskId), `${JSON.stringify(event)}\n`, 'utf8')
    } catch {
      // ignore persistence failure (in-process flush best effort)
    }
  }

  loadEvents(taskId: string): { events: PublishEvent[]; truncated: boolean } {
    const file = this.eventsFile(taskId)
    if (!fs.existsSync(file)) return { events: [], truncated: false }
    let content: string
    try {
      content = fs.readFileSync(file, 'utf8')
    } catch {
      return { events: [], truncated: false }
    }
    const lines = content.split('\n').filter(l => l.trim().length > 0)
    let truncated = false
    if (lines.length > MAX_JOURNAL_EVENTS) truncated = true
    const slice = lines.length > MAX_JOURNAL_EVENTS ? lines.slice(-MAX_JOURNAL_EVENTS) : lines
    const events: PublishEvent[] = []
    for (const line of slice) {
      try {
        events.push(JSON.parse(line) as PublishEvent)
      } catch {
        truncated = true
      }
    }
    // seq continuity check
    for (let i = 1; i < events.length; i++) {
      const prev = events[i - 1].seq
      const cur = events[i].seq
      if (typeof prev === 'number' && typeof cur === 'number' && cur !== prev + 1) {
        truncated = true
        break
      }
    }
    if (!truncated && events.length > 0 && typeof events[0].seq === 'number' && events[0].seq !== 1) {
      truncated = true
    }
    return { events, truncated }
  }

  /** 列出所有 journal（供 queue 恢复事件流） */
  listAll(): Journal[] {
    const out: Journal[] = []
    let files: string[] = []
    try {
      files = fs.readdirSync(this.dir)
    } catch {
      return out
    }
    for (const f of files) {
      if (!f.endsWith('.json')) continue
      const j = this.load(f.replace(/\.json$/, ''))
      if (j) out.push(j)
    }
    return out
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
      const taskId = f.replace(/\.json$/, '')
      try {
        fs.unlinkSync(this.eventsFile(taskId))
      } catch {
        // ignore missing events file
      }
    }
  }
}
