// apps/web/src/stores/app.ts
// 应用配置：主题 / PWA 开关 / 全局 boot

import { defineStore } from 'pinia'
import type { AppConfig } from '@bxverse/shared'
import { api } from '../api'
import { bootstrap, setToken } from '../api/http'
import { disablePWA, enablePWA } from '../pwa/register'

export type ThemeMode = 'light' | 'dark' | 'system'
// 扩展：R34 增 stone（玻璃光影，浅色优先）
export type ThemeStyle = 'indigo' | 'wenxi' | 'stone'

const prefersDark = () => window.matchMedia('(prefers-color-scheme: dark)')

export const useAppStore = defineStore('app', {
  state: () => ({
    booted: false,
    bootError: '' as string,
    config: null as AppConfig | null,
    isDark: false,
  }),
  getters: {
    themeMode: (s): ThemeMode => s.config?.theme ?? 'system',
    /** R20 主题风格：indigo=默认靛蓝套件 / wenxi=深色玻璃拟态套件（仅深色） */
    themeStyle: (s): ThemeStyle => s.config?.themeStyle ?? 'indigo',
    pwaEnabled: (s): boolean => s.config?.pwa.enabled ?? true,
    pollInterval: (s): number => s.config?.pollInterval ?? 30_000,
  },
  actions: {
    async boot(): Promise<void> {
      try {
        if (!(await bootstrap())) throw new Error('无法连接本地服务（请先运行 bx-manager start）')
        const payload = await api.config()
        this.config = payload.config as AppConfig
        setToken(payload.token)
        this.applyTheme()
        // M5-01：PWA 运行时开关——boot 时按配置注册（dev 下自动短路）
        if (this.pwaEnabled) void enablePWA()
        this.booted = true
      } catch (e) {
        this.bootError = (e as Error).message
        throw e
      }
    },
    applyTheme(): void {
      const mode = this.themeMode
      // wenxi 风格为纯深色设计，强制深色；indigo/stone 保持亮/暗/system 语义（stone 浅色优先）
      this.isDark =
        this.themeStyle === 'wenxi' ||
        mode === 'dark' ||
        (mode === 'system' && prefersDark().matches)
      const el = document.documentElement
      el.classList.toggle('dark', this.isDark)
      el.classList.toggle('theme-wenxi', this.themeStyle === 'wenxi')
      // 扩展：R34 stone 主题（玻璃光影材质由 tokens.css html.theme-stone 叠加）
      el.classList.toggle('theme-stone', this.themeStyle === 'stone')
    },
    async setTheme(mode: ThemeMode): Promise<void> {
      if (!this.config) return
      this.config.theme = mode
      await api.saveConfig({ theme: mode })
      this.applyTheme()
    },
    async setThemeStyle(style: ThemeStyle): Promise<void> {
      if (!this.config) return
      this.config.themeStyle = style
      await api.saveConfig({ themeStyle: style })
      this.applyTheme()
    },
    async togglePwa(enabled: boolean): Promise<void> {
      if (!this.config) return
      this.config.pwa.enabled = enabled
      await api.saveConfig({ pwa: { enabled } })
      // SW 注册/注销即时生效，无需刷新（frontend.md §10）
      if (enabled) await enablePWA()
      else await disablePWA()
    },
  },
})
