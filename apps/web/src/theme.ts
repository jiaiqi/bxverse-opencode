// apps/web/src/theme.ts
// Naive UI themeOverrides：亮/暗两套实色值（naive 内部需解析色值计算衍生色，不能用 CSS var）

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
}): GlobalThemeOverrides => ({
  common: {
    primaryColor: colors.primary,
    primaryColorHover: colors.primaryHover,
    primaryColorPressed: colors.primaryPressed,
    primaryColorSuppl: colors.primaryHover,
    infoColor: '#1971C2',
    successColor: '#2F9E44',
    warningColor: '#F08C00',
    errorColor: '#E03131',
    borderRadius: '8px',
    borderRadiusSmall: '4px',
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
  Button: { borderRadiusMedium: '8px', heightMedium: '36px', fontWeight: '500' },
  Card: { borderRadius: '8px', paddingMedium: '20px' },
  Dialog: { borderRadius: '12px' },
  Menu: { borderRadius: '8px', itemHeight: '40px' },
  Tag: { borderRadius: '6px' },
  Collapse: { titleFontSize: '14px' },
  Tabs: { tabFontSizeMedium: '14px' },
})

export const lightThemeOverrides = base({
  primary: '#4C6EF5',
  primaryHover: '#748FFC',
  primaryPressed: '#3B5BDB',
  text1: '#1F2328',
  text2: '#57606A',
  text3: '#8B949E',
  bg: '#F5F6F8',
  surface: '#FFFFFF',
  surfaceHover: '#F9FAFB',
  surfaceAlt: '#FAFBFC',
  border: '#E5E7EB',
})

export const darkThemeOverrides = base({
  primary: '#5C7CFA',
  primaryHover: '#748FFC',
  primaryPressed: '#4C6EF5',
  text1: '#E9EBEE',
  text2: '#A6ADB8',
  text3: '#717985',
  bg: '#121316',
  surface: '#1A1C21',
  surfaceHover: '#23262D',
  surfaceAlt: '#15171B',
  border: '#2A2E37',
})
