// apps/web/src/stores/app.ts
// 应用配置：主题 / PWA 开关 / 全局 boot

import { defineStore } from 'pinia'
import type { AppConfig } from '@bxverse/shared'
import { api } from '../api'
import { bootstrap, setToken } from '../api/http'

export type ThemeMode = 'light' | 'dark' | 'system'

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
        this.booted = true
      } catch (e) {
        this.bootError = (e as Error).message
        throw e
      }
    },
    applyTheme(): void {
      const mode = this.themeMode
      this.isDark = mode === 'dark' || (mode === 'system' && prefersDark().matches)
      document.documentElement.classList.toggle('dark', this.isDark)
    },
    async setTheme(mode: ThemeMode): Promise<void> {
      if (!this.config) return
      this.config.theme = mode
      await api.saveConfig({ theme: mode })
      this.applyTheme()
    },
    async togglePwa(enabled: boolean): Promise<void> {
      if (!this.config) return
      this.config.pwa.enabled = enabled
      await api.saveConfig({ pwa: { enabled } })
    },
  },
})
