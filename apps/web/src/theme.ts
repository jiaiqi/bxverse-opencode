// apps/web/src/theme.ts
// Naive UI themeOverrides：亮/暗两套实色值（naive 内部需解析色值计算衍生色，不能用 CSS var）
// 精密仪器语言：翠绿主色 + 6/10/14 圆角；wenxi 仅叠加玻璃质感（tokens.css html.theme-wenxi）

import type { GlobalThemeOverrides } from 'naive-ui'

const base = (colors: {
  primary: string
  primaryHover: string
  primaryPressed: string
  text1: string
  text2: string
  text3: string
  bg: string
  surface: string
  surfaceHover: string
  surfaceAlt: string
  border: string
  borderStrong: string
  info: string
  success: string
  warning: string
  error: string
}): GlobalThemeOverrides => ({
  common: {
    primaryColor: colors.primary,
    primaryColorHover: colors.primaryHover,
    primaryColorPressed: colors.primaryPressed,
    primaryColorSuppl: colors.primaryHover,
    infoColor: colors.info,
    successColor: colors.success,
    warningColor: colors.warning,
    errorColor: colors.error,
    borderRadius: '10px',
    borderRadiusSmall: '6px',
    fontFamily: 'var(--bx-font-sans)',
    fontSize: '14px',
    textColorBase: colors.text1,
    textColor1: colors.text1,
    textColor2: colors.text2,
    textColor3: colors.text3,
    bodyColor: colors.bg,
    cardColor: colors.surface,
    modalColor: colors.surface,
    popoverColor: colors.surface,
    tableColor: colors.surface,
    tableHeaderColor: colors.surfaceHover,
    hoverColor: colors.surfaceHover,
    borderColor: colors.border,
    dividerColor: colors.border,
    inputColor: colors.surface,
    actionColor: colors.surfaceAlt,
    fontWeightStrong: '600',
  },
  Button: {
    borderRadiusMedium: '10px',
    heightMedium: '34px',
    fontSizeMedium: '13px',
    fontWeight: '500',
    // 默认/次级态 = 描边按钮（原型 .btn：surface 底 + 1px 边框）
    color: colors.surface,
    textColor: colors.text2,
    border: colors.border,
    colorHover: colors.surfaceHover,
    textColorHover: colors.text1,
    borderHover: colors.borderStrong,
    colorPressed: colors.surfaceHover,
    textColorPressed: colors.text1,
    borderPressed: colors.borderStrong,
    colorSecondary: colors.surface,
    textColorSecondary: colors.text2,
    borderSecondary: colors.border,
    colorSecondaryHover: colors.surfaceHover,
    textColorSecondaryHover: colors.text1,
    borderSecondaryHover: colors.borderStrong,
    colorSecondaryPressed: colors.surfaceHover,
    textColorSecondaryPressed: colors.text1,
    borderSecondaryPressed: colors.borderStrong,
    // primary = 翠绿实心 + 深色字（原型 btn-primary）
    textColorPrimary: '#04140B',
    textColorPrimaryHover: '#04140B',
    textColorPrimaryPressed: '#04140B',
  },
  Card: { borderRadius: '14px', paddingMedium: '20px' },
  Dialog: { borderRadius: '14px' },
  Menu: { borderRadius: '10px', itemHeight: '40px' },
  Tag: { borderRadius: '999px' },
  Collapse: { titleFontSize: '14px' },
  Tabs: { tabFontSizeMedium: '14px' },
})

export const lightThemeOverrides = base({
  primary: '#00A85E',
  primaryHover: '#26C983',
  primaryPressed: '#009353',
  text1: '#11161D',
  text2: '#4B5563',
  text3: '#8B96A3',
  bg: '#F4F6F8',
  surface: '#FFFFFF',
  surfaceHover: '#F2F4F7',
  surfaceAlt: '#F0F2F5',
  border: '#E2E6EC',
  borderStrong: '#C9D0DA',
  info: '#2563EB',
  success: '#00A85E',
  warning: '#D97706',
  error: '#DC2626',
})

export const darkThemeOverrides = base({
  primary: '#00C96E',
  primaryHover: '#1FD982',
  primaryPressed: '#00B160',
  text1: '#E9EDF2',
  text2: '#9AA4B2',
  text3: '#5E6A78',
  bg: '#0B0D10',
  surface: '#12151B',
  surfaceHover: '#1A1F28',
  surfaceAlt: '#0A0C0F',
  border: '#20262F',
  borderStrong: '#2C3542',
  info: '#4D9FFF',
  success: '#00C96E',
  warning: '#FFB454',
  error: '#FF6B6B',
})

/**
 * R20 WenXi 深色玻璃拟态（themeStyle=wenxi，仅深色）：
 * 精密仪器统一语言（同 dark 套件）；玻璃感（blur/渐变/氛围光）
 * 由 tokens.css 的 html.theme-wenxi 规则叠加，形状在 tokens 内调整。
 */
export const wenxiThemeOverrides: GlobalThemeOverrides = darkThemeOverrides
