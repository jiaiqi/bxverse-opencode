import { describe, expect, it } from 'vitest'
import { diffLines } from '../src/diff'

describe('diffLines LCS', () => {
  it('识别增/删/不变', () => {
    const a = 'line1\nline2\nline3\n'
    const b = 'line1\nline2X\nline3\nline4\n'
    const d = diffLines(a, b)
    // 相同行：line1、line3、末尾空行
    expect(d.filter(x => x.type === 'same')).toHaveLength(3)
    expect(d.find(x => x.type === 'del')?.line).toBe('line2')
    expect(d.find(x => x.type === 'add')?.line).toBe('line2X')
  })

  it('完全相同 → 全 same', () => {
    const d = diffLines('a\nb\n', 'a\nb\n')
    expect(d.every(x => x.type === 'same')).toBe(true)
  })

  it('完全不同 → 全 del + add', () => {
    const d = diffLines('a\n', 'b\n')
    expect(d[0].type).toBe('del')
    expect(d[1].type).toBe('add')
  })
})
