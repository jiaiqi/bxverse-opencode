// apps/web/src/composables/useLazyTree.ts
// 懒加载目录树公共逻辑：FileTree / DirPicker 共用（C8 收敛）

import type { TreeNode } from '@bxverse/shared'
import { api } from '../api'

export function useLazyTree(pid: () => string, rid: () => string) {
  const root = ref<TreeNode | null>(null)
  const childrenMap = ref<Map<string, TreeNode>>(new Map())
  const expanded = ref<Set<string>>(new Set())
  const loadingSet = ref<Set<string>>(new Set())
  const rootLoading = ref(false)

  async function loadRoot(): Promise<void> {
    rootLoading.value = true
    try {
      root.value = await api.tree(pid(), rid(), '')
    } catch (e) {
      // 调用方已有 useMessage 兜底，这里静默；若需提示可在调用处捕获
      throw e
    } finally {
      rootLoading.value = false
    }
  }

  async function loadChildren(dir: string): Promise<void> {
    if (childrenMap.value.has(dir)) return
    const next = new Set(loadingSet.value)
    next.add(dir)
    loadingSet.value = next
    try {
      childrenMap.value.set(dir, await api.tree(pid(), rid(), dir))
    } catch (e) {
      throw e
    } finally {
      const done = new Set(loadingSet.value)
      done.delete(dir)
      loadingSet.value = done
    }
  }

  async function toggleDir(dir: string): Promise<void> {
    if (expanded.value.has(dir)) {
      const next = new Set(expanded.value)
      next.delete(dir)
      expanded.value = next
      return
    }
    const next = new Set(expanded.value)
    next.add(dir)
    expanded.value = next
    await loadChildren(dir)
  }

  function reset(): void {
    root.value = null
    childrenMap.value = new Map()
    expanded.value = new Set()
    loadingSet.value = new Set()
  }

  return {
    root,
    childrenMap,
    expanded,
    loadingSet,
    rootLoading,
    loadRoot,
    loadChildren,
    toggleDir,
    reset,
  }
}
