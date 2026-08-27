// apps/web/src/stores/ui.ts
// UI 状态：命令面板 / 新手引导（M5-08）显隐

import { defineStore } from 'pinia'

/** 新手引导完成标记（localStorage）：已完成后首次启动不再自动弹出 */
export const ONBOARDING_DONE_KEY = 'bxverse.onboarding.done'

export const useUiStore = defineStore('ui', {
  state: () => ({
    paletteOpen: false,
    onboardingOpen: false,
  }),
  actions: {
    togglePalette(v?: boolean): void {
      this.paletteOpen = v ?? !this.paletteOpen
    },
    toggleOnboarding(v?: boolean): void {
      this.onboardingOpen = v ?? !this.onboardingOpen
    },
  },
})
