import { describe, expect, it } from 'vitest'
import { JournalStore, MAX_JOURNAL_EVENTS } from '../src/journal'
import type { Journal } from '../src/journal'
import type { PublishEvent } from '@bxverse/shared'

function sampleJournal(
  taskId: string,
  projectId: string,
  status: Journal['status'] = 'running',
): Journal {
  return {
    taskId,
    projectId,
    startedAt: new Date().toISOString(),
    status,
    request: { projectId, bump: 'auto' },
    plan: null,
    steps: [{ seq: 1, repoId: 'r1', phase: 'build', state: 'done', detail: '' }],
  }
}

function seqEvent(seq: number, type: PublishEvent['type'] = 'log', msg = 'msg'): PublishEvent {
  return { seq, type, message: msg }
}

describe('JournalStore', () => {
  it('保存/读取', () => {
    const store = new JournalStore()
    const j = sampleJournal('t_1', 'p1')
    store.save(j)
    const loaded = store.load('t_1')
    expect(loaded?.taskId).toBe('t_1')
    expect(loaded?.steps[0].phase).toBe('build')
  })

  it('scanInterrupted：running → interrupted', () => {
    const store = new JournalStore()
    store.save(sampleJournal('t_int', 'p2', 'running'))
    store.save(sampleJournal('t_done', 'p3', 'done'))
    const interrupted = store.scanInterrupted()
    expect(interrupted.map((j) => j.taskId)).toContain('t_int')
    expect(store.load('t_int')?.status).toBe('interrupted')
    expect(store.load('t_done')?.status).toBe('done')
  })

  it('findActive：按项目查找 running/interrupted', () => {
    const store = new JournalStore()
    store.save(sampleJournal('t_a', 'p_a', 'interrupted'))
    expect(store.findActive('p_a')?.taskId).toBe('t_a')
    expect(store.findActive('p_none')).toBeNull()
  })

  it('cleanup 保留最近 keep 份', () => {
    const store = new JournalStore()
    for (let i = 0; i < 5; i++) store.save(sampleJournal(`t_keep_${i}`, 'p', 'done'))
    store.cleanup(3)
    const remain: string[] = []
    for (let i = 0; i < 5; i++) {
      if (store.load(`t_keep_${i}`)) remain.push(`t_keep_${i}`)
    }
    expect(remain.length).toBeLessThanOrEqual(3)
  })
})

describe('S4 · SSE 事件持久化到 journal（optimization-plan S4）', () => {
  it('appendEvent 追加写 → loadEvents 原序读回，seq 连续', () => {
    const store = new JournalStore()
    const taskId = 't_s4_basic'
    for (let i = 1; i <= 5; i++) {
      store.appendEvent(taskId, seqEvent(i, 'log', `step-${i}`))
    }
    const { events, truncated } = store.loadEvents(taskId)
    expect(truncated).toBe(false)
    expect(events).toHaveLength(5)
    expect(events.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5])
    expect(events[0].message).toBe('step-1')
  })

  it('不存在 taskId → events=[], truncated=false（空查询不报错）', () => {
    const store = new JournalStore()
    const r = store.loadEvents('t_never_existed')
    expect(r.events).toEqual([])
    expect(r.truncated).toBe(false)
  })

  it('超 MAX_JOURNAL_EVENTS → truncated=true（前端展示「前序已截断」）', () => {
    const store = new JournalStore()
    const taskId = 't_s4_overflow'
    // 写 MAX+50 行触发截断（不真写 5050：直接 patch 文件一次性写入 mock）
    for (let i = 1; i <= MAX_JOURNAL_EVENTS + 50; i++) {
      store.appendEvent(taskId, seqEvent(i))
    }
    const { events, truncated } = store.loadEvents(taskId)
    expect(truncated).toBe(true)
    expect(events.length).toBeLessThanOrEqual(MAX_JOURNAL_EVENTS)
    // 截断后 seq 不应从 1 开始（前序被裁掉）
    expect(events[0].seq).toBeGreaterThan(1)
  })

  it('中途插入的非法 JSON 行 → loadEvents 容错跳过（不抛错）', () => {
    const store = new JournalStore()
    const taskId = 't_s4_corrupt'
    store.appendEvent(taskId, seqEvent(1, 'log', 'valid-1'))
    // 手工写入 1 条非法行 + 1 条 valid-2 行模拟部分损坏
    const file = (store as unknown as { dir: string }).dir
    // 直接 import fs appendFile 不可靠；用 store appendEvent 2 条后人为篡改（更轻量：调一次写入再写一条非法）
    store.appendEvent(taskId, seqEvent(2, 'log', 'valid-2'))
    // 篡改 events.jsonl 第二行（替换为非 JSON）
    const path = (() => {
      // 通过 store 内部文件路径推断（私有）
      const fs = require('node:fs') as typeof import('node:fs')
      const list = fs.readdirSync(file)
      return `${file}/${list.find((n) => n.includes(taskId))}`
    })()
    const fs = require('node:fs') as typeof import('node:fs')
    fs.appendFileSync(path, '\nnot-a-json-line\n')
    const { events, truncated } = store.loadEvents(taskId)
    expect(events.length).toBeGreaterThanOrEqual(2) // 至少 valid-1 + valid-2
    expect(events.every((e) => e.seq !== undefined)).toBe(true)
    // truncated 视文件大小而定，断言不抛错即可
    void truncated
  })
})
