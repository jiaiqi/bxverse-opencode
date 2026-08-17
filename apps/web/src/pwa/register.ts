// apps/web/src/pwa/register.ts
// PWA 运行时开关（M5-01）：按 AppConfig.pwa.enabled 动态注册 / 注销 Service Worker。
// 手工注册 vite-plugin-pwa 产出的 sw.js（registerType: autoUpdate，SW 自带自动更新逻辑），
// 不引入 workbox-window 依赖，也不依赖插件自动注册——dev 不注册且开关可运行时控制（AGENTS.md §5.6）。

/** vite-plugin-pwa 默认产物文件名（构建后位于站点根） */
const SW_FILE = 'sw.js'

/** 应用 PWA 开关：enabled → 注册 SW；disabled → 注销全部 SW 并清理缓存 */
export async function applyPwa(enabled: boolean): Promise<void> {
  if (!('serviceWorker' in navigator)) return

  if (enabled) {
    try {
      // dev 形态默认不生成 sw.js，注册失败静默跳过（不影响主功能）
      await navigator.serviceWorker.register(SW_FILE)
    } catch {
      // 忽略：生产构建外或受限环境下不可用
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
