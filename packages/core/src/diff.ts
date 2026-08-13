// packages/core/src/diff.ts
// autoDraft 与 content 的行级 LCS diff（私有模块，供 API 层 / 前端 DiffView 消费）

export interface DiffLine {
  type: 'same' | 'add' | 'del'
  line: string
}

/** 行级最长公共子序列 diff：a = autoDraft（旧），b = content（新） */
export function diffLines(a: string, b: string): DiffLine[] {
  const A = a.split('\n')
  const B = b.split('\n')
  const m = A.length
  const n = B.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))
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
