import { describe, expect, it } from 'vitest'
import { JournalStore } from '../src/journal'
import type { Journal } from '../src/journal'

function sampleJournal(taskId: string, projectId: string, status: Journal['status'] = 'running'): Journal {
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
    expect(interrupted.map(j => j.taskId)).toContain('t_int')
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
