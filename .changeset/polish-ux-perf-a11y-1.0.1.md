---
type: patch
---

post-v1.0 维护期：UI/UX 视觉打磨 + 性能大幅改善 + a11y 端到端补齐

- 视觉：motion token 体系（dur-fast/base/slow/page + ease-in/out/spring）+ LoadingState/focus-ring/stagger entry/wizard slide transition/card hover spring
- 性能：highlight.js 按需注册 18 个语言（4 处替换 utils/highlight）+ vite manualChunks 拆 4 个 vendor + PWA precache 22% 缩身（2.2MB→66KB） + utils/highlight ts 类型标注修复
- a11y：原生 button 补 focus-ring 全站 + useRovingTabindex / useGridRovingTabindex 双 composable + ReleaseWizard 步骤条 role=tablist + RepoDetail 子 Tab + ProjectDetail 仓库网格 role=grid + skip-to-main-content (WCAG 2.4.1) + ErrorState 移除 !important
- 维护：闭合 c17be3b 遗留内联多语句死循环（prettier 与 vue parser 冲突根治）+ packages/core/src/store.ts 修复 unicorn 警告
