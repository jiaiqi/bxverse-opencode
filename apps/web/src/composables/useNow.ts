// apps/web/src/composables/useNow.ts
// 当前时间（分钟级刷新，用于页头日期展示）

export function useNow(): Ref<Date> {
  const now = ref(new Date())
  const timer = setInterval(() => {
    now.value = new Date()
  }, 60_000)
  tryOnScopeDispose(() => clearInterval(timer))
  return now
}
