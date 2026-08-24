// apps/web/src/composables/useTakeover.ts
// 进行中任务接管（刷新/重进后恢复控制台）

import { api } from '../api'

export function useTakeover() {
  const takeoverTask = ref('')
  const takeoverProjectId = ref('')

  async function checkRunningTask(): Promise<void> {
    try {
      const cur = await api.publishCurrent()
      takeoverTask.value = cur.taskId ?? ''
      takeoverProjectId.value = cur.projectId ?? ''
    } catch {
      takeoverTask.value = ''
      takeoverProjectId.value = ''
    }
  }

  return { takeoverTask, takeoverProjectId, checkRunningTask }
}
