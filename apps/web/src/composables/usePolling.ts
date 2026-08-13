// apps/web/src/composables/usePolling.ts
// 页面可见性感知轮询（页面隐藏时暂停，回到前台立即刷新一次）

export function usePolling(fn: () => void | Promise<void>, intervalMs: number): { refresh: () => void } {
  let timer: number | undefined
  let disposed = false

  const tick = (): void => {
    if (disposed || document.hidden) return
    void Promise.resolve(fn()).catch(() => {
      // 轮询失败静默，下轮重试
    })
  }

  onMounted(() => {
    tick()
    timer = window.setInterval(tick, intervalMs)
    document.addEventListener('visibilitychange', tick)
  })
  onScopeDispose(() => {
    disposed = true
    if (timer) window.clearInterval(timer)
    document.removeEventListener('visibilitychange', tick)
  })

  return { refresh: tick }
}
