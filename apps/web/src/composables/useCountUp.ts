// composables/useCountUp.ts
// rAF 缓动数字滚动：animateTo(el, target, { duration, ease })
// 内部使用 cubic ease-out（与 tokens.css --bx-ease 一致）
// prefers-reduced-motion 直接跳到 target 不动
//
// 模板：<span v-count-up="42" /> （指令版） 或 调 animateTo(el, n)

const DEFAULT_DURATION = 900

export interface CountUpOptions {
  duration?: number
  /** 起始值，默认 0 */
  from?: number
  /** 缓动函数：默认 cubic ease-out */
  ease?: (t: number) => number
}

export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3)

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function animateTo(el: HTMLElement, target: number, options: CountUpOptions = {}): void {
  const duration = options.duration ?? DEFAULT_DURATION
  const from = options.from ?? 0
  const ease = options.ease ?? easeOutCubic
  if (prefersReducedMotion()) {
    el.textContent = formatNumber(target)
    return
  }
  const start = performance.now()
  const delta = target - from
  function tick(now: number) {
    const t = Math.min(1, (now - start) / duration)
    const v = from + delta * ease(t)
    el.textContent = formatNumber(v)
    if (t < 1) requestAnimationFrame(tick)
    else el.textContent = formatNumber(target)
  }
  el.textContent = formatNumber(from)
  requestAnimationFrame(tick)
}

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return n.toString()
  return n.toFixed(1)
}
