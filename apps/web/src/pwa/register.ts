// apps/web/src/pwa/register.ts
// PWA 运行时注册（M5-01，frontend.md §10）：插件构建期 injectRegister: false，
// 注册/注销完全由 AppConfig.pwa.enabled 运行时控制，避免「关闭 PWA」形同虚设。

const MANIFEST_HREF = '/manifest.webmanifest'

/** 动态注入 <link rel="manifest">（vite-plugin-pwa 默认不自注入） */
function injectManifestLink(): void {
  if (!document.querySelector('link[rel="manifest"]')) {
    const link = document.createElement('link')
    link.rel = 'manifest'
    link.href = MANIFEST_HREF
    document.head.appendChild(link)
  }
}

function removeManifestLink(): void {
  document.querySelectorAll('link[rel="manifest"]').forEach((el) => el.remove())
}

/** 注册 Service Worker（仅生产构建生效；dev 下 virtual 模块为 no-op stub） */
export async function enablePWA(): Promise<void> {
  if (!import.meta.env.PROD) return
  try {
    const { registerSW } = await import('virtual:pwa-register')
    registerSW({ immediate: true })
    injectManifestLink()
  } catch (e) {
    // 非 PWA 构建（无 SW 产物）时静默降级，不影响主流程
    console.warn('[pwa] 注册失败:', e)
  }
}

/** 注销 Service Worker、清空缓存并移除 manifest link（开关关闭即时生效） */
export async function disablePWA(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      for (const reg of registrations) {
        await reg.unregister()
      }
    }
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
    removeManifestLink()
  } catch (e) {
    console.warn('[pwa] 注销失败:', e)
  }
}
