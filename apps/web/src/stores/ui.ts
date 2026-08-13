// apps/web/src/stores/ui.ts
// UI 状态：命令面板显隐

import { defineStore } from 'pinia'

export const useUiStore = defineStore('ui', {
  state: () => ({
    paletteOpen: false,
  }),
  actions: {
    togglePalette(v?: boolean): void {
      this.paletteOpen = v ?? !this.paletteOpen
    },
  },
})
