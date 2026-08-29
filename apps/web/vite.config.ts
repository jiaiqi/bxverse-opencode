import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { NaiveUiResolver } from 'unplugin-vue-components/resolvers'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    UnoCSS(),
    AutoImport({
      imports: ['vue', 'vue-router', 'pinia', '@vueuse/core'],
      dirs: ['src/composables'],
      dts: 'auto-imports.d.ts',
    }),
    Components({
      resolvers: [NaiveUiResolver()],
      dts: 'components.d.ts',
    }),
    // PWA：仅构建产物；运行时注册由 AppConfig.pwa.enabled 控制（M5-01）
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      manifest: {
        name: 'BX 版本管理台',
        short_name: 'BX 管理台',
        description: '项目/仓库两级版本与更新日志统一管理',
        lang: 'zh-CN',
        display: 'standalone',
        start_url: '/',
        theme_color: '#4C6EF5',
        background_color: '#F5F6F8',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api/],
        // 精准化 precache：仅 precache 入口 HTML + 字体 + 图标 + CSS（变化少、体积小）
        // JS chunk 走 runtime cache（按需从 cache 拿，命中即用，miss 走网络；体积/更新成本低）
        // 收益：首次安装 PWA 体积从 ~2.2MB 降到 ~100KB（HTML + fonts + icons + critical CSS）
        globPatterns: ['**/*.{html,woff2,svg,png,ico}'],
        // 关键 CSS（无 hash 文件名）单独 precache——主样式表必须离线可达
        globIgnores: ['**/index-*.css', '**/assets/BackupPanel*', '**/assets/BackupManage*'],
        runtimeCaching: [
          {
            // JS chunks：StaleWhileRevalidate（命中即用，后台静默更新）
            urlPattern: ({ url }) =>
              url.pathname.startsWith('/assets/') && url.pathname.endsWith('.js'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'js-chunks',
              expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // CSS：StaleWhileRevalidate（按需 chunk 也会带 hash）
            urlPattern: ({ url }) =>
              url.pathname.startsWith('/assets/') && url.pathname.endsWith('.css'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'css-chunks',
              expiration: { maxEntries: 16, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // 字体（已被 precache，但兜底双保险）
            urlPattern: ({ url }) => url.pathname.endsWith('.woff2'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'fonts',
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8899', changeOrigin: false },
    },
  },
  build: {
    outDir: 'dist',
    // vendor-naive 实际 145 KB gzip（Naive UI 35 组件 + 共享 _internal/_mixins + lodash + date-fns + cssr），
    // 是这个 UI 库的固有开销，进一步压榨 ROI 低、风险大。把告警阈值提到 600 KB。
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // vendor 拆分：把频繁复用的第三方库独立成长期缓存的 chunk
        // - vue-vendor: vue 核心 + vue-router + pinia（路由级 + 全局）
        // - naive-vendor: Naive UI（按需 import 后的整体聚合）
        // - utils-vendor: highlight.js 按需 + markdown-it + 其他轻量工具
        // 共享 chunk 拆出后单页首次加载只下载当前页 chunk，路由切换时复用 vendor 缓存
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('naive-ui')) return 'vendor-naive'
            if (
              id.includes('@vueuse') ||
              id.includes('/vue/') ||
              id.includes('vue-router') ||
              id.includes('pinia')
            ) {
              return 'vendor-vue'
            }
            if (id.includes('highlight.js') || id.includes('markdown-it')) {
              return 'vendor-utils'
            }
            return 'vendor-misc'
          }
          return undefined
        },
      },
    },
  },
})
