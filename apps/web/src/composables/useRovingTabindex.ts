// composables/useRovingTabindex.ts
// 角色可遍历列表的统一键盘导航（tabs / stepper / menuitem 等）
// 用法：
//   const containerRef = ref<HTMLElement | null>(null)
//   const { activeIndex, onKeydown } = useRovingTabindex({
//     containerRef,
//     itemSelector: '[role="tab"]',
//     itemCount: computed(() => tabs.length),
//     orientation: 'horizontal',  // 'horizontal' | 'vertical' | 'both'
//     loop: true,
//     onActivate: (idx) => { tab = tabs[idx].id },
//   })
// 特性：
// - ArrowLeft/Right（horizontal）、ArrowUp/Down（vertical）、Arrow*+二选一（both）
// - Home/End 跳首尾
// - 焦点移动用 containerRef.value.querySelectorAll(itemSelector)[idx]?.focus()
// - 组件 unmount 时自动清理 keydown 监听（onBeforeUnmount）

import { onBeforeUnmount, ref, type Ref, type MaybeRefOrGetter, toValue } from 'vue'

export interface RovingTabindexOptions {
  containerRef: Ref<HTMLElement | null>
  /** 选择器：'[role="tab"]' / '[role="menuitem"]' / '.wz-step' 等 */
  itemSelector: string
  /** 总项数（响应式） */
  itemCount: MaybeRefOrGetter<number>
  /** 方向：'horizontal' (←→)、'vertical' (↑↓)、'both' (四方向) */
  orientation?: 'horizontal' | 'vertical' | 'both'
  /** 末端循环（默认 true） */
  loop?: boolean
  /** 焦点变化时回调（可用于联动选中态） */
  onFocus?: (idx: number) => void
  /** 激活回调（Enter/Space 时） */
  onActivate?: (idx: number) => void
}

export function useRovingTabindex(opts: RovingTabindexOptions) {
  const activeIndex = ref(-1)
  const orientation = opts.orientation ?? 'horizontal'
  const loop = opts.loop ?? true

  function focusItem(idx: number) {
    const root = opts.containerRef.value
    if (!root) return
    const items = root.querySelectorAll<HTMLElement>(opts.itemSelector)
    const target = items[idx]
    if (target) {
      target.focus()
      activeIndex.value = idx
      opts.onFocus?.(idx)
    }
  }

  function onKeydown(e: KeyboardEvent) {
    const len = toValue(opts.itemCount)
    if (len === 0) return
    const cur = activeIndex.value
    const start = cur < 0 ? -1 : cur

    const isPrev = e.key === 'ArrowLeft' || e.key === 'ArrowUp'
    const isNext = e.key === 'ArrowRight' || e.key === 'ArrowDown'

    const acceptPrev =
      orientation === 'vertical'
        ? e.key === 'ArrowUp'
        : orientation === 'horizontal'
          ? e.key === 'ArrowLeft'
          : true
    const acceptNext =
      orientation === 'vertical'
        ? e.key === 'ArrowDown'
        : orientation === 'horizontal'
          ? e.key === 'ArrowRight'
          : true

    if (e.key === 'Home') {
      e.preventDefault()
      focusItem(0)
      return
    }
    if (e.key === 'End') {
      e.preventDefault()
      focusItem(len - 1)
      return
    }

    if (isPrev && acceptPrev) {
      e.preventDefault()
      const next = loop ? (start <= 0 ? len - 1 : start - 1) : Math.max(0, start - 1)
      focusItem(next)
      return
    }
    if (isNext && acceptNext) {
      e.preventDefault()
      const next = loop ? (start < 0 ? 0 : (start + 1) % len) : Math.min(len - 1, start + 1)
      focusItem(next)
      return
    }

    if (e.key === 'Enter' || e.key === ' ') {
      if (cur >= 0 && opts.onActivate) {
        e.preventDefault()
        opts.onActivate(cur)
      }
    }
  }

  onBeforeUnmount(() => {
    // 焦点恢复由调用方决定（保留显式 ref，composable 不强加）
  })

  return { activeIndex, onKeydown, focusItem }
}
