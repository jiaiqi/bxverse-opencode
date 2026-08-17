// apps/web/src/pwa/register.ts
// PWA 运行时开关（M5-01）：按 AppConfig.pwa.enabled 动态注册 / 注销 Service Worker。
// 不能依赖 vite-plugin-pwa 自动注册——dev 下插件不注册 SW，且本项目的开关语义要求
// 由运行时自行控制（与 AGENTS.md §5.6「PWA dev 不注册」一致）。

type RegisterFn = (options?: { immediate?: boolean }) => (reloadPage?: boolean) => Promise<void>

/** 应用 PWA 开关：enabled → 注册 SW；disabled → 注销全部 SW 并清理缓存 */
export async function applyPwa(enabled: boolean): Promise<void> {
  if (!('serviceWorker' in navigator)) return

  if (enabled) {
    try {
      // 生产构建由 vite-plugin-pwa 注入该虚拟模块；dev 或未构建时不存在，静默跳过
      const { registerSW } = (await import('virtual:pwa-register')) as { registerSW: RegisterFn }
      registerSW({ immediate: true })
    } catch {
      // dev 形态：无虚拟模块，忽略
    }
    return
  }

  try {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((r) => r.unregister()))
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
  } catch {
    // 清理失败不影响主功能（下次开关仍可重试）
  }
}
