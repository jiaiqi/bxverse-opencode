// apps/web/src/composables/useRuntimeStatus.ts
// 本地服务运行状态检测（借鉴 repoverse RuntimeStatus）

import { api } from '../api'

export type RuntimeStatus = 'checking' | 'connected' | 'unavailable'

export function useRuntimeStatus() {
  const status = ref<RuntimeStatus>('checking')
  const version = ref('')
  const errorMessage = ref('')

  async function check(): Promise<void> {
    status.value = 'checking'
    try {
      const r = await api.health()
      status.value = r.ok ? 'connected' : 'unavailable'
      version.value = r.version
      if (!r.ok) errorMessage.value = '服务异常'
    } catch (e) {
      status.value = 'unavailable'
      errorMessage.value = (e as Error).message
    }
  }

  onMounted(() => {
    void check()
    const timer = window.setInterval(() => void check(), 30_000)
    onScopeDispose(() => window.clearInterval(timer))
  })

  return { status, version, errorMessage, check }
}
