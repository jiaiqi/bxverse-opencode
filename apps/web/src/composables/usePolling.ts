// apps/web/src/composables/usePolling.ts
// 页面可见性感知轮询（页面隐藏时暂停，回到前台立即刷新一次）
// 支持 intervalMs 为 MaybeRefOrGetter，变更时自动重启 timer；visibilitychange 启停而非仅跳过 tick

export function usePolling(
  fn: () => void | Promise<void>,
  intervalMs: MaybeRefOrGetter<number>,
): { refresh: () => void } {
  let timer: number | undefined
  let disposed = false

  const tick = (): void => {
    if (disposed || document.hidden) return
    void Promise.resolve(fn()).catch(() => {
      // 轮询失败静默，下轮重试
    })
  }

  const stop = (): void => {
    if (timer !== undefined) {
      window.clearInterval(timer)
      timer = undefined
    }
  }

  const start = (): void => {
    if (disposed) return
    stop()
    timer = window.setInterval(tick, toValue(intervalMs))
  }

  const onVisibility = (): void => {
    if (document.hidden) {
      stop()
    } else {
      tick()
      start()
    }
  }

  onMounted(() => {
    tick()
    start()
    document.addEventListener('visibilitychange', onVisibility)
  })

  // intervalMs 响应式：变更时重启 timer（仅可见时）
  watch(
    () => toValue(intervalMs),
    () => {
      if (disposed || document.hidden) return
      start()
    },
  )

  onScopeDispose(() => {
    disposed = true
    stop()
    document.removeEventListener('visibilitychange', onVisibility)
  })

  return { refresh: tick }
}
