// apps/web/src/utils/diff.ts
// 行级 LCS diff（autoDraft ↔ content 对比，DiffView 渲染用）

export interface DiffLine {
  type: 'same' | 'add' | 'del'
  line: string
}

/** 行级 LCS 为 O(n×m)，超限拒绝计算（调用方应展示提示） */
const MAX_DIFF_LINES = 1500

export function diffLines(a: string, b: string): DiffLine[] {
  const A = a.split('\n')
  const B = b.split('\n')
  if (A.length > MAX_DIFF_LINES || B.length > MAX_DIFF_LINES) return []
  const m = A.length
  const n = B.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array.from({ length: n + 1 }, () => 0))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (A[i] === B[j]) {
      out.push({ type: 'same', line: A[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: 'del', line: A[i] })
      i++
    } else {
      out.push({ type: 'add', line: B[j] })
      j++
    }
  }
  while (i < m) out.push({ type: 'del', line: A[i++] })
  while (j < n) out.push({ type: 'add', line: B[j++] })
  return out
}
