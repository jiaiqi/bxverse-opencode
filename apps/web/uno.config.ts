import { defineConfig, presetIcons, presetUno } from 'unocss'

export default defineConfig({
  presets: [
    presetUno({ dark: 'class' }),
    presetIcons({
      scale: 1.2,
      warn: true,
      extraProperties: { display: 'inline-block', 'vertical-align': '-0.125em' },
    }),
  ],
  theme: {
    colors: {
      brand: {
        50: 'var(--bx-brand-50)',
        100: 'var(--bx-brand-100)',
        200: 'var(--bx-brand-200)',
        300: 'var(--bx-brand-300)',
        400: 'var(--bx-brand-400)',
        500: 'var(--bx-brand-500)',
        600: 'var(--bx-brand-600)',
        700: 'var(--bx-brand-700)',
        800: 'var(--bx-brand-800)',
        900: 'var(--bx-brand-900)',
        soft: 'var(--bx-brand-soft)',
        softHover: 'var(--bx-brand-soft-hover)',
      },
      bg: 'var(--bx-bg)',
      surface: 'var(--bx-surface)',
      surfaceHover: 'var(--bx-surface-hover)',
      surfaceAlt: 'var(--bx-surface-alt)',
      border: 'var(--bx-border)',
      borderStrong: 'var(--bx-border-strong)',
      text: { 1: 'var(--bx-text-1)', 2: 'var(--bx-text-2)', 3: 'var(--bx-text-3)' },
      success: 'var(--bx-success)',
      successSoft: 'var(--bx-success-soft)',
      warning: 'var(--bx-warning)',
      warningSoft: 'var(--bx-warning-soft)',
      error: 'var(--bx-error)',
      errorSoft: 'var(--bx-error-soft)',
      info: 'var(--bx-info)',
      infoSoft: 'var(--bx-info-soft)',
    },
    borderRadius: {
      sm: 'var(--bx-radius-sm)',
      md: 'var(--bx-radius-md)',
      lg: 'var(--bx-radius-lg)',
      xl: 'var(--bx-radius-xl)',
    },
    boxShadow: { sm: 'var(--bx-shadow-sm)', md: 'var(--bx-shadow-md)', lg: 'var(--bx-shadow-lg)' },
  },
  shortcuts: [
    ['page', 'mx-auto w-full max-w-6xl px-6 py-6 space-y-6'],
    ['page-header', 'flex items-center justify-between gap-4 flex-wrap'],
    ['section-title', 'text-lg font-semibold text-text-1 flex items-center gap-2'],
    // motion：全站统一曲线/时长（emil 风格强 ease-out）—— tokens.css 单一来源
    ['ease-bx', 'ease-[var(--bx-ease)]'],
    ['ease-bx-in', 'ease-[var(--bx-ease-in)]'],
    ['ease-bx-out', 'ease-[var(--bx-ease-out)]'],
    ['ease-spring', 'ease-[var(--bx-ease-spring)]'],
    ['duration-fast', 'duration-[var(--bx-dur-fast)]'],
    ['duration-base', 'duration-[var(--bx-dur-base)]'],
    ['duration-slow', 'duration-[var(--bx-dur-slow)]'],
    ['duration-page', 'duration-[var(--bx-dur-page)]'],
    // 状态色对（按钮/图标/链接在品牌色上的前景色）
    ['on-brand', 'text-[var(--bx-on-brand)]'],
    ['console-bg', 'bg-[var(--bx-console-bg)]'],
    ['console-text', 'text-[var(--bx-console-text)]'],
    ['card', 'bg-surface border border-border rounded-[var(--bx-radius-card)] shadow-sm'],
    ['card-pad', 'p-5'],
    [
      'card-hover',
      'transition-[box-shadow,border-color,transform] duration-base ease-bx hover:shadow-lg hover:border-border-strong hover:-translate-y-0.5 cursor-pointer',
    ],
    [
      'btn-primary',
      'inline-flex items-center gap-2 h-9 px-4 rounded-[var(--bx-radius-btn)] bg-brand-500 on-brand text-sm font-semibold transition-[background-color,transform] duration-fast ease-bx hover:bg-brand-400 active:scale-97 disabled:opacity-45 disabled:pointer-events-none',
    ],
    [
      'btn-ghost',
      'inline-flex items-center gap-2 h-9 px-4 rounded-[var(--bx-radius-btn)] text-text-2 text-sm font-medium transition-[background-color,color,transform] duration-fast ease-bx hover:bg-surface-hover hover:text-text-1 active:scale-97',
    ],
    [
      'btn-danger',
      'inline-flex items-center gap-2 h-9 px-4 rounded-[var(--bx-radius-btn)] text-error text-sm font-medium border border-border transition-[background-color,border-color,transform] duration-fast ease-bx hover:border-error hover:bg-error-soft active:scale-97',
    ],
    [
      'btn-tiny',
      'inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-xs transition-colors duration-fast ease-bx',
    ],
    [
      'chip',
      'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-surface-hover border border-border text-text-2',
    ],
    ['chip-brand', 'text-brand-600 bg-brand-soft border-brand-200'],
    ['chip-info', 'text-info bg-info-soft border-info/25'],
    ['chip-warn', 'text-warning bg-warning-soft border-warning/25'],
    ['chip-error', 'text-error bg-error-soft border-error/25'],
    ['code-text', 'font-mono text-13px'],
    [
      'link',
      'text-brand-500 hover:text-brand-400 hover:underline transition-colors duration-150 cursor-pointer',
    ],
    ['text-13px', 'text-[13px]'],
    ['stat-value', 'text-[26px] font-bold font-mono text-text-1 tracking-tight leading-6'],
    ['stat-label', 'text-xs text-text-3'],
    [
      'skeleton',
      "relative overflow-hidden rounded-md bg-surface-hover before:content-[''] before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-text-3/20 before:to-transparent before:animate-pulse",
    ],
    // 三态视觉家族（统一节奏 44px 图标容器 + 16 上下内边距 + 居中）
    ['empty-wrap', 'flex flex-col items-center justify-center gap-3 py-16 text-center'],
    // 加载占位（默认 padding=10，size=small，role/aria-live 由组件承担）
    ['loading-block', 'flex flex-col items-center justify-center gap-2 py-10 text-text-3'],
    ['loading-row', 'flex items-center gap-2 text-text-3'],
    [
      'sidebar-item',
      'flex items-center gap-2.5 px-3 h-9 rounded-[var(--bx-radius-md)] text-text-2 text-sm transition-colors duration-fast ease-bx hover:bg-surface-hover hover:text-text-1 cursor-pointer bg-transparent whitespace-nowrap overflow-hidden',
    ],
    [
      'sidebar-item-active',
      'sidebar-item bg-brand-soft text-brand-600 hover:text-brand-600 hover:bg-brand-soft-hover font-medium shadow-[inset_3px_0_0_0_var(--bx-nav-indicator)]',
    ],
    ['sidebar-icon', 'text-16px shrink-0 opacity-75'],
    ['log-line', 'font-mono text-13px leading-6 break-all'],
    [
      'console-wrap',
      'console-bg border border-border rounded-[var(--bx-radius-lg)] p-4 overflow-auto font-mono text-13px leading-6 console-text',
    ],
    [
      'focus-ring',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
    ],
    [
      'tree-row',
      'flex items-center gap-[6px] py-[5px] pr-[10px] text-[13px] text-text-2 cursor-pointer transition-colors duration-150 border-l-2 border-transparent hover:bg-surface-hover hover:text-text-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
    ],
    ['tree-row-active', 'bg-brand-soft !border-l-brand-500 text-brand-600'],
  ],
})
