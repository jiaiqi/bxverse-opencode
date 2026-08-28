// composables/useGridRovingTabindex.ts
// 二维网格键盘导航（仓库卡网格 / 任意 CSS grid 布局）
// 与 useRovingTabindex 区别：响应 colCount 自动按行优先计算下一焦点位置
// 行为：
// - ArrowLeft/Right：行内 ±1
// - ArrowUp/Down：跨行 ±colCount
// - Home/End：本行首 / 本行尾
// - Ctrl+Home/End：网格首 / 网格尾
// - Enter/Space：激活（RouterLink 天然响应，无需特判；onActivate 用于 RouterLink 以外场景）
//
// 用法：
//   const gridRef = ref<HTMLElement | null>(null)
//   const { activeIndex, tabindexFor, onKeydown } = useGridRovingTabindex({
//     gridRef,
//     itemSelector: '[data-grid-cell]',
//     itemCount: computed(() => cards.length),
//     colCount: computed(() => cols.value),
//   })
//   <!-- template -->
//   <div ref="gridRef" role="grid" @keydown="onKeydown">
//     <Card v-for="(c, i) in cards" :tabindex="tabindexFor(i)" :data-grid-cell="i" />

import { computed, ref, type Ref, type MaybeRefOrGetter, toValue } from 'vue'

export interface GridRovingTabindexOptions {
  gridRef: Ref<HTMLElement | null>
  itemSelector: string
  itemCount: MaybeRefOrGetter<number>
  colCount: MaybeRefOrGetter<number>
  onActivate?: (idx: number) => void
  loop?: boolean
}

export function useGridRovingTabindex(opts: GridRovingTabindexOptions) {
  const activeIndex = ref(0)
  const loop = opts.loop ?? false

  function focusItem(idx: number) {
    const root = opts.gridRef.value
    if (!root) return
    const items = root.querySelectorAll<HTMLElement>(opts.itemSelector)
    const target = items[idx]
    if (target) {
      target.focus()
      activeIndex.value = idx
    }
  }

  function clamp(n: number, lo: number, hi: number) {
    return Math.max(lo, Math.min(hi, n))
  }

  function tabindexFor(idx: number): number {
    return idx === activeIndex.value ? 0 : -1
  }

  function onKeydown(e: KeyboardEvent) {
    const len = toValue(opts.itemCount)
    const cols = Math.max(1, toValue(opts.colCount))
    if (len === 0) return
    const cur = activeIndex.value
    const curRow = Math.floor(cur / cols)
    const curCol = cur % cols
    const lastRow = Math.floor((len - 1) / cols)

    // Ctrl+Home/End 跳整网首尾
    if ((e.ctrlKey || e.metaKey) && e.key === 'Home') {
      e.preventDefault()
      focusItem(0)
      return
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'End') {
      e.preventDefault()
      focusItem(len - 1)
      return
    }

    // Home/End 跳本行首尾
    if (e.key === 'Home') {
      e.preventDefault()
      const rowStart = curRow * cols
      focusItem(rowStart)
      return
    }
    if (e.key === 'End') {
      e.preventDefault()
      const rowEnd = clamp(rowStart(curRow) + cols - 1, 0, len - 1)
      focusItem(rowEnd)
      return
    }

    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      if (curCol === 0) {
        if (loop) focusItem(clamp(curRow * cols + (cols - 1), 0, len - 1))
        else focusItem(cur)
      } else {
        focusItem(cur - 1)
      }
      return
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      if (curCol === cols - 1 || cur + 1 >= len) {
        if (loop) focusItem(curRow * cols)
        else focusItem(cur)
      } else {
        focusItem(cur + 1)
      }
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (curRow === 0) {
        if (loop) {
          // 跳到末行同列（可能位置不同——仍按同列目标）
          const target = lastRow * cols + curCol
          focusItem(clamp(target, 0, len - 1))
        } else focusItem(cur)
      } else {
        focusItem(cur - cols)
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (cur + cols >= len) {
        if (loop) {
          // 跳到首行同列
          const target = curCol
          focusItem(clamp(target, 0, len - 1))
        } else focusItem(cur)
      } else {
        focusItem(cur + cols)
      }
      return
    }

    if (e.key === 'Enter' || e.key === ' ') {
      if (opts.onActivate) {
        e.preventDefault()
        opts.onActivate(cur)
      }
      // 否则让浏览器原生处理：RouterLink 自动导航，无需拦截
    }
  }

  // 显式给当前项目代码用：computed 重算可读
  const _ = computed(() => [activeIndex.value, toValue(opts.itemCount)])
  void _

  return { activeIndex, tabindexFor, onKeydown, focusItem }
}

function rowStart(row: number): number {
  return row * 1
}
