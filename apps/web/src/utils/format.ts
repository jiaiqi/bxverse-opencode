// apps/web/src/utils/format.ts
// 日期/数字格式化统一走 Intl（规范要求，禁硬编码格式）

const dateFmt = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
const dateTimeFmt = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/** ISO 字符串 → 2026-08-13（本地时区） */
export function formatDate(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : dateFmt.format(d)
}

/** ISO 字符串 → 2026-08-13 15:30 */
export function formatDateTime(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : dateTimeFmt.format(d)
}

/** 文件大小可读化（Intl.NumberFormat） */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  const nf = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 })
  let v = bytes
  let i = -1
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${nf.format(v)} ${units[i]}`
}
