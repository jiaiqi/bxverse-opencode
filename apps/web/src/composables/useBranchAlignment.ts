// apps/web/src/composables/useBranchAlignment.ts
// 分支巡检与批量对齐（R25）

import type { BranchAlignmentResult } from '@bxverse/shared'
import { api } from '../api'
import { usePublishStore } from '../stores/publish'
import { useMessage } from 'naive-ui'

export function useBranchAlignment(
  projectId: Ref<string>,
  deps: { detect: () => Promise<void>; changedRepoIds: ComputedRef<string[]> },
) {
  const store = usePublishStore()
  const message = useMessage()

  const branchAlignment = ref<BranchAlignmentResult | null>(null)

  async function checkBranchAlignment(): Promise<void> {
    if (!projectId.value) return
    try {
      branchAlignment.value = await api.branchAlignment(projectId.value, 'master')
    } catch {
      // 忽略
    }
  }

  async function doBatchCheckout(branch = 'master'): Promise<void> {
    try {
      await api.batchCheckout(projectId.value, branch)
      message.success(`已批量将所有工程切至「${branch}」分支`)
      await Promise.all([deps.detect(), checkBranchAlignment()])
      store.setSelected(deps.changedRepoIds.value)
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  async function doBatchPull(): Promise<void> {
    try {
      const res = await api.batchPull(projectId.value)
      message.success(res.ok ? '全矩阵工程批量快进拉取成功！' : '部分仓库拉取存在警告')
      await Promise.all([deps.detect(), checkBranchAlignment()])
      store.setSelected(deps.changedRepoIds.value)
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  return { branchAlignment, checkBranchAlignment, doBatchCheckout, doBatchPull }
}
