# bxverse 前端设计规范（@bxverse/web）

> 文档版本：v0.1（2026-08-13）
> 依据：`docs/requirements.md`（唯一需求依据）、`docs/architecture.md` §3.2 路由表、`packages/shared/src/types.ts`（定稿类型）、`packages/shared/src/constants.ts`（定稿常量）。
> 本文所有 API 路径、字段名与 `types.ts` / `constants.ts` 一字不差；所有组件、store、路由均待建，落地时以本文为准。

---

## 1. 设计系统

### 1.1 设计基调

- **关键词**：美观、优雅、精致、大方；克制、专业、可信。
- **配色**：中性灰阶为主，靛蓝品牌色 `#4C6EF5` 仅用于主操作、焦点、选中态与关键数据，全页品牌色占比控制在 10% 以内。
- **质感**：8px 圆角（卡片/按钮/输入框默认）、轻阴影（两层以内）、1px 边框分隔、留白充足。
- **动效**：150–250ms 过渡，克制使用；只服务于「反馈」与「层级」两个目的。
- **字体**：系统字体栈，零字体文件下载（本地工具原则）。

### 1.2 色板 token（唯一颜色来源）

全部颜色集中定义在 `apps/web/src/styles/tokens.css`，以 CSS 变量输出；`html.dark` 下切换为暗色值。**UnoCSS 主题与 Naive UI themeOverrides 均引用同一批 CSS 变量，禁止在组件内硬编码十六进制色值。**

```css
/* tokens.css */
:root {
  /* 品牌（亮/暗共用主阶，暗色下 500 提亮保证对比度） */
  --bx-brand-50:  #F0F3FF;  --bx-brand-100: #E0E6FF;
  --bx-brand-200: #C3CEFF;  --bx-brand-300: #9CAFFF;
  --bx-brand-400: #748FFC;  --bx-brand-500: #4C6EF5;
  --bx-brand-600: #3B5BDB;  --bx-brand-700: #2F49B8;
  --bx-brand-800: #273C94;  --bx-brand-900: #223171;
  /* 品牌软底（浅色底上的淡靛背景） */
  --bx-brand-soft: #EDF0FE; --bx-brand-soft-hover: #DEE4FD;

  /* 中性 */
  --bx-bg:            #F5F6F8;   /* 页面底 */
  --bx-surface:       #FFFFFF;   /* 卡片/弹层 */
  --bx-surface-hover: #F9FAFB;   /* 行/卡片悬停 */
  --bx-surface-alt:   #FAFBFC;   /* 嵌套块、代码区底 */
  --bx-border:        #E5E7EB;   /* 常规分隔 */
  --bx-border-strong: #D1D5DB;   /* 强调分隔/输入框聚焦前 */
  --bx-text-1:        #1F2328;   /* 主文本 */
  --bx-text-2:        #57606A;   /* 次级文本 */
  --bx-text-3:        #8B949E;   /* 占位/禁用/辅助 */

  /* 语义 */
  --bx-success: #2F9E44;  --bx-success-soft: #E6F4EA;
  --bx-warning: #F08C00;  --bx-warning-soft: #FFF3E0;
  --bx-error:   #E03131;  --bx-error-soft:   #FDEBEB;
  --bx-info:    #1971C2;  --bx-info-soft:    #E7F5FF;

  /* 圆角/阴影/动效（见 1.5 / 1.6） */
}

html.dark {
  --bx-brand-500: #5C7CFA;  --bx-brand-600: #748FFC;
  --bx-brand-700: #4C6EF5;  --bx-brand-soft: #232B4D; --bx-brand-soft-hover: #2C3760;

  --bx-bg:            #121316;
  --bx-surface:       #1A1C21;
  --bx-surface-hover: #23262D;
  --bx-surface-alt:   #15171B;
  --bx-border:        #2A2E37;
  --bx-border-strong: #3A3F4B;
  --bx-text-1:        #E9EBEE;
  --bx-text-2:        #A6ADB8;
  --bx-text-3:        #717985;

  --bx-success: #51CF66;  --bx-success-soft: #1F3A28;
  --bx-warning: #FFA94D;  --bx-warning-soft: #3D2E1B;
  --bx-error:   #FF6B6B;  --bx-error-soft:   #3D2121;
  --bx-info:    #4DABF7;  --bx-info-soft:    #1C3447;
}
```

### 1.3 字体栈

```css
--bx-font-sans: system-ui, -apple-system, "Segoe UI", Roboto,
  "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif;
--bx-font-mono: ui-monospace, "Cascadia Code", "SF Mono", "JetBrains Mono",
  Consolas, "Liberation Mono", "Courier New", monospace;
```

- 正文 14px/1.6；标题 16/18/22/28px（semibold 600）；代码与日志 13px 等宽。
- 数字（版本号、hash、统计）用 `--bx-font-mono` + `font-variant-numeric: tabular-nums`。

### 1.4 间距栅格

4px 基准栅格，只允许使用下表档位（UnoCSS 默认 spacing 即此体系，禁止自定义 5px/7px 等档位）：

| token | 值 | 用途 |
|---|---|---|
| 1 | 4px | 图标与文字间隙 |
| 2 | 8px | 紧凑元素间距、列表内边距 |
| 3 | 12px | 表单项间距 |
| 4 | 16px | 区块内边距、按钮图标距 |
| 5 | 20px | 卡片内边距（默认） |
| 6 | 24px | 页面内边距、区块间距 |
| 8 | 32px | 大区块间距 |
| 10 | 40px | 页面头与内容间距 |
| 12 | 48px | 向导步骤区留白 |
| 16 | 64px | 空状态上下留白 |

内容容器：`max-w-6xl`（1152px）水平居中；页面级左右留白 24px。

### 1.5 圆角 / 阴影

| token | 值 | 用途 |
|---|---|---|
| `rounded-sm` | 4px | 标签、代码行号块、小徽标 |
| `rounded-md` | 8px | **默认**：卡片、按钮、输入框、菜单 |
| `rounded-lg` | 12px | 对话框、抽屉、大面板 |
| `rounded-full` | 9999px | 圆点、头像、胶囊徽标 |

```css
/* 阴影：亮色用灰阶投影，暗色用黑色投影 */
--bx-shadow-sm: 0 1px 2px rgba(16,24,40,.05);
--bx-shadow-md: 0 2px 8px  rgba(16,24,40,.08);   /* 卡片默认、菜单弹出 */
--bx-shadow-lg: 0 8px 24px rgba(16,24,40,.12);   /* 对话框、命令面板 */
html.dark {
  --bx-shadow-sm: 0 1px 2px rgba(0,0,0,.4);
  --bx-shadow-md: 0 2px 8px  rgba(0,0,0,.5);
  --bx-shadow-lg: 0 8px 24px rgba(0,0,0,.6);
}
```

### 1.6 动效规范

```css
--bx-dur-fast: 150ms;   /* 悬停变色、图标旋转、焦点 */
--bx-dur-base: 200ms;   /* 折叠展开、弹层进出、切换 */
--bx-dur-slow: 250ms;   /* 页面路由过渡、抽屉 */
--bx-ease:      cubic-bezier(0.2, 0, 0, 1);        /* 标准 */
--bx-ease-in:   cubic-bezier(0.34, 1.56, 0.64, 1); /* 仅小元素缩放入场（对话框） */
@media (prefers-reduced-motion: reduce) {
  * { transition-duration: 0ms !important; animation-duration: 0ms !important; }
}
```

规则：卡片悬停仅 `shadow + border 变色`（fast）；列表删除用 200ms 高度收缩；**禁止**弹性过大的弹跳、禁止无限循环动效（loading 例外）。

### 1.7 Naive UI themeOverrides 映射表

`App.vue` 中 `NConfigProvider` 按 `appStore.isDark` 切换 `lightThemeOverrides` / `darkThemeOverrides`，值一律引用 `var(--bx-*)`：

```ts
// apps/web/src/theme.ts
export const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: 'var(--bx-brand-500)',
    primaryColorHover: 'var(--bx-brand-400)',
    primaryColorPressed: 'var(--bx-brand-600)',
    primaryColorSuppl: 'var(--bx-brand-400)',
    borderRadius: '8px',
    borderRadiusSmall: '4px',
    fontFamily: 'var(--bx-font-sans)',
    fontSize: '14px',
    textColor1: 'var(--bx-text-1)',
    textColor2: 'var(--bx-text-2)',
    textColor3: 'var(--bx-text-3)',
    bodyColor: 'var(--bx-bg)',
    cardColor: 'var(--bx-surface)',
    modalColor: 'var(--bx-surface)',
    popoverColor: 'var(--bx-surface)',
    tableHeaderColor: 'var(--bx-surface-hover)',
    hoverColor: 'var(--bx-surface-hover)',
    borderColor: 'var(--bx-border)',
    dividerColor: 'var(--bx-border)',
    inputColor: 'var(--bx-surface)',
    fontWeightStrong: '600',
  },
  Button:   { borderRadiusMedium: '8px', heightMedium: '36px', fontWeight: '500' },
  Card:     { borderRadius: '8px', paddingMedium: '20px' },
  Dialog:   { borderRadius: '12px' },
  Menu:     { borderRadius: '8px', itemHeight: '40px' },
  Tag:      { borderRadius: '6px' },
  Collapse: { titleFontSize: '14px' },
  Tabs:     { tabFontSizeMedium: '14px' },
}
// darkThemeOverrides 结构相同；差异色值已由 html.dark 下 CSS 变量翻转兜底。
```

### 1.8 UnoCSS 配置（uno.config.ts）

```ts
// apps/web/uno.config.ts
import { defineConfig, presetUno, presetIcons } from 'unocss'

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
        50: 'var(--bx-brand-50)', 100: 'var(--bx-brand-100)', 200: 'var(--bx-brand-200)',
        300: 'var(--bx-brand-300)', 400: 'var(--bx-brand-400)', 500: 'var(--bx-brand-500)',
        600: 'var(--bx-brand-600)', 700: 'var(--bx-brand-700)', 800: 'var(--bx-brand-800)',
        900: 'var(--bx-brand-900)', soft: 'var(--bx-brand-soft)', softHover: 'var(--bx-brand-soft-hover)',
      },
      bg: 'var(--bx-bg)', surface: 'var(--bx-surface)', surfaceHover: 'var(--bx-surface-hover)',
      surfaceAlt: 'var(--bx-surface-alt)', border: 'var(--bx-border)', borderStrong: 'var(--bx-border-strong)',
      text: { 1: 'var(--bx-text-1)', 2: 'var(--bx-text-2)', 3: 'var(--bx-text-3)' },
      success: 'var(--bx-success)', successSoft: 'var(--bx-success-soft)',
      warning: 'var(--bx-warning)', warningSoft: 'var(--bx-warning-soft)',
      error: 'var(--bx-error)', errorSoft: 'var(--bx-error-soft)',
      info: 'var(--bx-info)', infoSoft: 'var(--bx-info-soft)',
    },
    borderRadius: { sm: '4px', md: '8px', lg: '12px', xl: '16px' },
    boxShadow: { sm: 'var(--bx-shadow-sm)', md: 'var(--bx-shadow-md)', lg: 'var(--bx-shadow-lg)' },
  },
  shortcuts: [
    // 布局
    ['page', 'mx-auto w-full max-w-6xl px-6 py-6 space-y-6'],
    ['page-header', 'flex items-center justify-between gap-4 flex-wrap'],
    ['section-title', 'text-lg font-semibold text-text-1 flex items-center gap-2'],
    // 卡片
    ['card', 'bg-surface border border-border rounded-md shadow-sm'],
    ['card-pad', 'p-5'],
    ['card-hover', 'transition-all duration-150 ease-in-out hover:shadow-md hover:border-brand-300 cursor-pointer'],
    // 按钮
    ['btn-primary', 'inline-flex items-center gap-2 h-9 px-4 rounded-md bg-brand-500 text-white text-sm font-medium transition-colors duration-150 hover:bg-brand-400 active:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed'],
    ['btn-ghost', 'inline-flex items-center gap-2 h-9 px-4 rounded-md text-text-2 text-sm font-medium transition-colors duration-150 hover:bg-surface-hover hover:text-text-1'],
    ['btn-danger', 'inline-flex items-center gap-2 h-9 px-4 rounded-md text-error text-sm font-medium border border-border transition-colors duration-150 hover:border-error hover:bg-error-soft'],
    // 文本与徽标
    ['chip', 'inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs bg-surface-alt border border-border text-text-2'],
    ['code-text', 'font-mono text-13px'],
    ['link', 'text-brand-500 hover:text-brand-400 hover:underline transition-colors duration-150 cursor-pointer'],
    ['text-13px', 'font-size:13px'],
    // 状态
    ['stat-value', 'text-2xl font-semibold font-mono text-text-1'],
    ['stat-label', 'text-sm text-text-3'],
    ['skeleton', 'animate-pulse bg-surface-hover rounded-md'],
    ['empty-wrap', 'flex flex-col items-center justify-center gap-3 py-16 text-center'],
    // 侧栏
    ['sidebar-item', 'flex items-center gap-2.5 px-3 h-9 rounded-md text-text-2 text-sm transition-colors duration-150 hover:bg-surface-hover hover:text-text-1 cursor-pointer'],
    ['sidebar-item-active', 'sidebar-item bg-brand-soft text-brand-600 hover:text-brand-600 hover:bg-brand-soft-hover font-medium'],
    ['sidebar-icon', 'text-16px shrink-0'],
    // 日志/控制台
    ['log-line', 'font-mono text-13px leading-6 break-all'],
    ['console-wrap', 'bg-surface-alt border border-border rounded-md p-4 overflow-auto font-mono text-13px leading-6'],
    ['focus-ring', 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg'],
  ],
})
```

### 1.9 图标规范（carbon 图标集）

- 图标一律 `i-carbon-*` 类名（`@iconify-json/carbon` 全集）；**禁止** 图片图标、emoji 图标、内联 SVG 文件。
- 类名必须**完整静态拼写**（如 `i-carbon-cube`），禁止字符串拼接动态生成图标名（tree-shaking 会失效）。
- 提交类型图标映射（引用 `COMMIT_TYPE_LABELS` 与图标常量，二者并列维护在 `src/constants/icons.ts`）：

| CommitType | 图标 | | CommitType | 图标 |
|---|---|---|---|---|
| feat | `i-carbon-add` | | chore | `i-carbon-tool-box` |
| fix | `i-carbon-tools` | | docs | `i-carbon-document` |
| perf | `i-carbon-flash` | | test | `i-carbon-checkbox-checked` |
| refactor | `i-carbon-code` | | build | `i-carbon-package` |
| style | `i-carbon-color-palette` | | ci | `i-carbon-cycle` |
| revert | `i-carbon-undo` | | other | `i-carbon-dot-mark` |

> 若个别名称与 carbon 实际收录不符，就近替换并以 `@iconify-json/carbon` 实际可用的图标名为准。

常用图标：logo `i-carbon-cube`、项目 `i-carbon-catalog`、仓库 `i-carbon-git-branch`、版本 `i-carbon-version`、日志 `i-carbon-list`、文件树 `i-carbon-tree-view`、文件 `i-carbon-document`、发布 `i-carbon-rocket`、设置 `i-carbon-settings`、主题 `i-carbon-sun`/`i-carbon-moon`、搜索 `i-carbon-search`、同步 `i-carbon-renew`、离线 `i-carbon-cloud-off`、推送 `i-carbon-cloud-upload`、警告 `i-carbon-warning-alt`、错误 `i-carbon-error`、成功 `i-carbon-checkmark-filled`、复制 `i-carbon-copy`、终端 `i-carbon-terminal`。

---

## 2. 全局布局 AppLayout

### 2.1 结构

```
NConfigProvider(theme + themeOverrides)
└─ NMessageProvider / NDialogProvider / NNotificationProvider / NLoadingBarProvider
   └─ NLayout(has-sider)
      ├─ NLayoutSider  ← 侧栏（232px 固定）
      │   ├─ Logo 区（i-carbon-cube + APP_NAME）
      │   ├─ 主导航（总览 / 项目列表分组）
      │   └─ 底部（命令面板提示 / 设置 / 主题切换）
      └─ NLayout
         ├─ NLayoutContent ← router-view（各页面）
         └─ CommandPalette（App 级挂载，默认隐藏）
```

- 侧栏固定宽 232px，暗色侧栏样式：`bg-surface border-r border-border`；高度 100vh，内容区独立滚动。
- 项目列表过长时内部滚动；项目名截断 + title 提示。

### 2.2 侧栏内容

| 区块 | 内容 | 行为 |
|---|---|---|
| Logo | `i-carbon-cube`（brand 色）+ `APP_NAME` | 点击回 `/` |
| 主导航 | 「总览」项（icon `i-carbon-dashboard`） | 激活态 `sidebar-item-active`（路由匹配） |
| 项目分组 | 标题「项目」+ 全部 `projectsStore.items`，每项 icon `i-carbon-catalog` + 名称 + 变动红点 | 点击去 `/project/:id`；末尾「+」按钮打开 AddProjectDialog |
| 底部 | 「设置」（`i-carbon-settings`）、主题切换按钮、`Ctrl K` 提示 | 主题按钮循环切换 light→dark→system，icon 随 `resolvedTheme` 变化 |

### 2.3 Ctrl+K 命令面板（CommandPalette）

**触发**：全局监听 `keydown`，`Ctrl+K` / `Ctrl+P` 打开；`Esc` 关闭；打开时自动聚焦搜索框、自动选中第一项。

**命令注册表**（静态页 + 动态数据合并，`src/composables/useCommands.ts`）：

| 分组 | 命令 | 行为 |
|---|---|---|
| 页面 | 总览 / 设置 / 项目详情（每项目一条）/ 仓库详情（每仓库一条） | `router.push` |
| 项目 | 新建项目 / 接入仓库（当前项目） | 打开对应 Dialog |
| 发布 | 开始发布（`/project/:id/release`，仅 changedRepoCount>0 的项目） | 进入向导 |
| 系统 | 同步数据仓库（POST /api/system/sync）/ 切换主题 | 执行后 toast |

**交互**：输入实时模糊匹配（命令标题 + 关键词）；`↑` `↓` 移动、`Enter` 执行、分组标题不可选；面板 `w-160 max-h-120` 居中偏上（top 20%），`shadow-lg rounded-lg`；底部渲染快捷键提示（`Esc 关闭`、`↑↓ 选择`、`Enter 执行`）。

### 2.4 主题切换与全局 Provider

- 主题状态：`appStore.resolvedTheme`（'light'|'dark'），来源 `AppConfig.theme`（'system' 时监听 `matchMedia('(prefers-color-scheme: dark)')`）。
- 切换动作：更新 `resolvedTheme` → 同步 `document.documentElement.classList.toggle('dark')` → `NConfigProvider.theme` 切换 `lightThemeOverrides`/`darkThemeOverrides` → 持久化 `PUT /api/config`（节流 500ms）。
- 全局 loading bar 由路由守卫控制（见 §7）。

---

## 3. 页面规格

### 3.1 总览 `/`（Dashboard.vue）

**数据来源**：`GET /api/overview` → `OverviewData`（进入页面与项目增删后刷新；`reposStore` 轮询变动不在此页）。

**区块**：

| 区块 | 内容 |
|---|---|
| PageHeader | 标题「总览」+ 副标题（当前日期/数据仓库状态）；actions：同步数据（POST /api/system/sync）、新建项目 |
| 统计卡 x3 | `projectCount` 项目数（`i-carbon-catalog`）/ `repoCount` 仓库数（`i-carbon-cube`）/ `changedRepoCount` 待发布仓库（`i-carbon-git-commit`，>0 时数字 brand 色 + 微动效光点） |
| 项目网格 | `overview.projects` 渲染 ProjectCard（含 `lastRelease` 信息、变动徽标）；点击进 `/project/:id` |
| 变动仓库面板 | `overview.changedRepos` 分组列表：`projectName` 分组头 → 每行 `repoName` + `commits` 计数徽标 + head 短 hash；整行点击跳 `/repo/:projectId/:repoId`；组头右侧「发布」按钮跳 `/project/:projectId/release` |

**状态处理**：loading → 3 张 `skeleton` 卡片；`projectCount===0` → EmptyState（`i-carbon-cube`「还没有项目」+ 新建项目 CTA）；请求失败 → `NResult status="500"` + 重试按钮。

### 3.2 项目详情 `/project/:id`（ProjectDetail.vue）

**数据来源**：`GET /api/projects/:id`（ProjectDef）；仓库状态并行 `GET /api/projects/:id/repos/:repoId/status`（默认缓存，卡片上「重新检测」传 `fresh=true`）；发布历史 `GET /api/projects/:id/releases`（取前 5 条展示）。

**区块**：

| 区块 | 内容 |
|---|---|
| PageHeader | back 图标回 `/`；项目名 + 版本徽标 `v{ProjectDef.version}` + 方案徽标（hybrid→「混合版本」/ timestamp→「时间戳版本」）+ bump 徽标（auto→「自动 bump」/ manual→「手动 patch」）；actions：发布新版本（primary，`i-carbon-rocket`）、接入仓库、编辑项目、删除项目（btn-danger，`NDialog` 确认） |
| 仓库区 | RepoCard 网格（§4）；卡片按 `changed` 排序在前；空 → EmptyState（引导接入仓库，打开 AddRepoDialog） |
| 发布历史 | 最近 5 条 `ReleaseRecord` 行：`version`（mono）、`date`、`bump` 徽标、`pushed` 徽标；点击展开该记录日志（MarkdownView 渲染 `logs.external`）；「查看全部」暂以内嵌滚动实现 |

**交互**：删除项目（发布进行中 409 → toast 后端 `error` 文案）；编辑项目复用 AddProjectDialog（编辑模式预填 ProjectDef）。

### 3.3 仓库详情 `/repo/:pid/:rid`（RepoDetail.vue）

**数据来源**：仓库定义从 `projectsStore.byId(pid)?.repos` 取（无则 `GET /api/projects/:pid`）；状态 `GET /api/projects/:pid/repos/:rid/status`。

**头部**：仓库名 + 分支 chip（`branch`）+ 版本徽标（`versionFile?.version`）+ 变动/未提交徽标 + 纯本地徽标（`!hasRemote`）+ remote URL（截断 + 复制）。

**三 Tab（NTabs，路由 query `?tab=files|logs|settings` 保持可刷新）**：

**Tab 1 文件**：左右分栏（左 280px 可拖拽）。
- 左 FileTree：根节点进入即请求 `GET .../tree`（空 path）；展开子目录时请求 `.../tree?path=`；`TreeNode.truncated` 时节点下渲染「仅显示前 N 项，进入目录查看全部」提示行；文件点击 → 右侧 FileViewer。
- 右 FileViewer：`GET .../file?path=`；路径面包屑 + 行数/大小 + 复制按钮；`binary===true` → NResult「二进制文件不支持预览」；`truncated===true` → 顶部 NAlert（warning）+ 仅渲染前 `lines` 行；代码渲染用 highlight.js（按扩展名选语言，未知则 auto）。

**Tab 2 版本日志**：
- 顶部分段：`NSegmented`「对外 / 对内」；右侧「修订」切换按钮（有 `logs.*.autoDraft !== content` 差异时才出现）。
- 列表：`GET /api/projects/:id/releases` 过滤 `kind==='repo' && scopeId===rid`；每行 version/date/bump/pushed；选中行 → MarkdownView 渲染 `logs.internal` 或 `logs.external` 的 `content`。
- 修订视图：DiffView（§4.12）对比 `autoDraft` ↔ `content`，行级 LCS 标注（增=success 底、删=error 底）。
- 空 → EmptyState「该仓库暂无发布记录」。

**Tab 3 设置**：`NDynamicInput`/`NForm` 编辑 RepoDef 字段：`name`、`buildCommand`（placeholder 示例）、`outputDir`（默认 public 提示）、`writeVersionFile`（NSwitch + 说明「关闭后不写 version.json，零侵入」）、`remote` 只读展示；保存 → `PUT /api/projects/:pid`（整体保存 projects 中该仓库项，见 architecture §3.2）；「移除仓库」danger 按钮（确认后同路由保存）。

### 3.4 发布向导 `/project/:id/release`（ReleaseWizard.vue）

详见 §8（状态机）与 §9（日志编辑器）。页面骨架：PageHeader（返回项目）+ `NSteps` 横向六步 + 步骤内容容器（`card card-pad`）+ 底部步骤操作栏（上一步/下一步/执行发布）。

### 3.5 设置 `/settings`（Settings.vue）

**数据来源**：`GET /api/config`（AppConfig）加载表单；`PUT /api/config` 保存（整对象）。

| 分组 | 字段 | 控件 | 说明 |
|---|---|---|---|
| 外观 | `theme` | NRadioGroup light/dark/system | 保存即生效并同步侧栏按钮 |
| PWA | `pwa.enabled` | NSwitch | 开启后按 §10 动态注册 SW + 注入 manifest |
| 服务 | `host` / `port` | NInput / NInputNumber | 端口范围 1–65535；host 非回环地址时保存前红色警示「非本机监听存在安全风险」 |
| 轮询 | `pollInterval` | NInputNumber（ms，≥10000） | 说明：仓库变动自动检测周期 |
| AI | `ai.enabled` / `ai.baseUrl` / `ai.model` / `ai.apiKey` | NSwitch + NInput(password) | apiKey 仅本机存储，不出本机 |
| 数据仓库 | `dataDir` 只读展示 | — | 「立即同步」→ POST /api/system/sync，loading 态 + 结果 toast |
| 安全 | 轮换访问令牌 | 按钮 | POST /api/auth/rotate → 更新 sessionStorage token → toast「已轮换」 |

**状态处理**：保存中按钮 loading；409（发布进行中）→ toast 后端 `error`；网络失败 → toast + 表单保留。

### 3.6 404 `/：pathMatch(.*)*`

`NResult status="404"` + 「返回总览」按钮，2s 后自动重定向 `/`（可取消）。

### 3.7 徽标规则汇总（StatusBadge 统一实现，禁止散落自绘）

| 场景 | 判定条件 | 文案/图标 | 色 |
|---|---|---|---|
| 仓库有变动 | `RepoStatus.changed===true` | 「N 提交」(`i-carbon-git-commit`) | brand |
| 工作区未提交 | `RepoStatus.dirty>0` | 「未提交 N」(`i-carbon-warning-alt`) | error |
| 纯本地 | `RepoStatus.hasRemote===false` | 「纯本地」(`i-carbon-cloud-off`) | neutral（text-3） |
| 版本 | `versionFile?.version` | `v{version}`（mono） | neutral / brand（与 `milestoneTag` 一致时） |
| 日志状态 | `LogState` | auto「自动草稿」/ edited「已编辑」/ confirmed「已确认」 | gray / info / success |
| 推送状态 | `ReleaseRecord.pushed` | 「已推送」/「未推送」(`i-carbon-cloud-upload`) | success / warning |
| 方案 | `ProjectDef.repoVersionScheme` | 「混合版本」/「时间戳版本」 | neutral |
| bump | `BumpType` | major「重大」/ minor「次版本」/ patch「补丁」 | brand / info / neutral |
| 发布事件失败 | `PublishEvent.type==='repo-error'` | 「失败」(`i-carbon-error`) | error |
| 侧栏项目红点 | `OverviewData.projects[].changedRepoCount>0` | 8px 圆点（无文字，title 提示） | brand |

---

## 4. 组件清单

> 统一约定：所有组件 `<script setup lang="ts">`；props 全类型化；样式用 UnoCSS 类 + 少量 scoped CSS（仅限 markdown 渲染、highlight 主题这类无法原子化的场景）；组件内文案常量引 `@bxverse/shared` constants。

### 4.1 ProjectCard

```ts
props: { project: OverviewData['projects'][number] }
emits: { open: [id: string]; release: [id: string] }
```
视觉：`card card-pad card-hover`；头部名称 + `v{version}` mono chip；中部 `repoCount` 仓库 / `changedRepoCount` 待发布（>0 用 brand 强调 + 徽标）；底部 `lastRelease` 行（「上次发布 v{version} · {date}」，无则「暂无发布」text-3）；右上 hover 出现「发布」icon 按钮（stop 冒泡）。

### 4.2 RepoCard

```ts
props: { repo: RepoDef; status?: RepoStatus; loading?: boolean }
emits: { open: []; refresh: [] }
```
视觉：`card card-pad card-hover`；名称 + StatusBadge 组（changed/dirty/纯本地）；副行 `branch` · `head` 前 7 位 mono · `versionFile?.version`；底部 `buildCommand` 存在时显示终端图标 chip；loading 时整卡 `skeleton`；右上 hover 按钮：重新检测（`i-carbon-renew`，`emits('refresh')`）。

### 4.3 CommitList

```ts
props: {
  commits: CommitInfo[]
  grouped?: boolean        // 默认 false；true 时按 EXTERNAL_SECTIONS 分组聚合
  showFiles?: boolean      // 展开行内文件列表
  max?: number             // 默认不限制；超限显示「还有 N 条」折叠
}
emits: { copy: [hash: string] }
```
视觉：每行 `type 图标 + COMMIT_TYPE_LABELS[type] chip`、`subject`（truncate + title）、`hash` 前 7 位（`code-text`，点击复制 + toast）、`author` · `date`（text-3 右对齐）；`breaking===true` 行尾 error 色「BREAKING」chip；`showFiles` 时行下方缩进渲染 `files`（`i-carbon-document` 行、truncate）。分组模式按 `EXTERNAL_SECTIONS` 渲染「## 标题」小节。

### 4.4 MarkdownView

```ts
props: { content: string }
slots: { default: 空内容占位 }
```
实现：`markdown-it`（`{ html: false, linkify: true }`），代码块经 highlight.js（注册 js/ts/vue/json/bash/css 等常用语言）渲染；外层 `class="md-body"`，配套 `styles/markdown.css` 定义 h1–h4/列表/表格/引用/代码样式（引用 types.ts 无样式要求，此样式属于组件内私有）。空 `content` 渲染 slot。

### 4.5 StatusBadge

```ts
props: {
  type: 'changed'|'dirty'|'local'|'version'|'pushed'|'scheme'|'bump'|'error'
  label?: string          // 覆盖默认文案
  logState?: LogState     // 日志状态徽标（type 缺省时按 logState 渲染）
  count?: number          // changed/dirty 的数值
}
```
视觉：`chip` 基础上按 §3.7 配色；可选前导 6px 圆点；纯图标模式 `aria-label` 必填。

### 4.6 PageHeader

```ts
props: { title: string; description?: string; backTo?: string; icon?: string }
slots: { default: 右侧操作区 }
```
视觉：`page-header`；backTo 存在时渲染 `i-carbon-arrow-left` 圆角 icon 按钮（`focus-ring`）；标题 22px semibold；description text-2 14px；slot 区域右对齐。

### 4.7 EmptyState

```ts
props: { icon?: string /* 默认 i-carbon-cube */; title: string; description?: string }
emits: { action: [] }
slots: { action: 自定义 CTA（未提供且 emits 有监听时渲染默认「立即创建」按钮） }
```
视觉：`empty-wrap`；icon 48px text-3；title text-1；description text-3 13px。

### 4.8 AddProjectDialog

```ts
props: { show: boolean; editing?: ProjectDef | null }
emits: { 'update:show': [v: boolean]; saved: [p: ProjectDef] }
```
表单：`name`（必填，1–40 字符）、`description`、`bump`（NSegmented auto/manual，manual 时提示「默认按 patch 建议」）、`repoVersionScheme`（NSegmented hybrid/timestamp + 预览示例文案 `v1.2.0.26081315` / `v26081315`）、`externalExclude`（NSelect multiple，选项 `COMMIT_TYPES` 用 `COMMIT_TYPE_LABELS` 展示，默认勾选 `DEFAULT_EXTERNAL_EXCLUDE`）。
提交：新建 `POST /api/projects`；编辑 `PUT /api/projects/:id`；成功后 `emits('saved')` + toast + 关闭；错误 toast 后端 `error`。

### 4.9 AddRepoDialog

```ts
props: { show: boolean; projectId: string }
emits: { 'update:show': [v: boolean]; added: [r: RepoDef] }
```
NTabs 两页：
- **本地路径**：`path` NInput + 说明「必须是 git 仓库（含 .git）」；提交 `POST /api/projects/:projectId/repos` body `{ path }`。
- **Git 地址**：`url`（placeholder `https://…` 或 `git@…`）+ `name`（选填）+ `shallow` NSwitch；提交 body `CloneRequest { url, name?, shallow? }`。
克隆进行中：按钮 loading + 文案「克隆中…」（克隆耗时提示，不阻塞弹窗可最小化继续）。成功 `emits('added')`；失败展示后端 `{ error, code }`。

### 4.10 CommandPalette

无 props/emits，自读 `appStore`/`projectsStore`/`router`（§2.3）。视觉：`fixed top-20% left-1/2 -translate-x-1/2 w-160 shadow-lg rounded-lg bg-surface border border-border z-50`；搜索框 + 分组列表 + 底部快捷键提示；`focus-ring`。

### 4.11 FileTree

```ts
props: { pid: string; rid: string }
emits: { select: [path: string, entry: FileEntry] }
```
内部：维护展开节点集合 + 懒加载子节点（`reposStore.fetchTree`，key 缓存）；`TreeNode.truncated` 提示行；目录 `i-carbon-folder`（展开态 `i-carbon-folder-open`），文件按扩展名映射图标（默认 `i-carbon-document`）；`↑↓` 移动、`→/Enter` 展开或打开文件、`←` 折叠；选中行 `bg-brand-soft` + 左侧 2px brand 竖条；加载中行渲染 12px `NSpin`。

### 4.12 FileViewer

```ts
props: { pid: string; rid: string; path: string }
```
path 变化即请求 `fetchFile`；工具栏：面包屑（分段截断）、`size`/`lines` 信息、复制按钮（`i-carbon-copy`，复制成功 toast）；主体 `console-wrap`（等宽 13px）；highlight.js 按扩展名映射语言；`binary` → NResult；`truncated` → NAlert 顶部常驻。

### 4.13 DiffView

```ts
props: { before: string; after: string; labelBefore?: string; labelAfter?: string }
```
实现：行级 LCS diff（自研轻量实现 `utils/diff.ts`，输出 `{ type: 'same'|'add'|'del'; line: string }[]`）；渲染两列（左 before 右 after）带行号；add 行 `bg-success-soft` + 前导 `+`，del 行 `bg-error-soft` + 前导 `-`；头部 chip 显示「+N / -M」统计。

### 4.14 LogEditor

详见 §9 完整规格。

### 4.15 ReleaseConsole

```ts
props: { taskId: string }
emits: { finished: [result: { releaseId: string; version: string; failedRepos: string[] } | null]; failed: [] }
```
订阅 `api.subscribePublish`（§6）；行渲染规则：`log`→text-2 前缀 `$`、`step`→brand 加粗前缀 `▸`、`repo-start`→info 前缀 `▶`、`repo-done`→success `✓`、`repo-error`→error `✗`、`done`→success 横幅、`error`→error 横幅；`repoId` 非空时行首 chip 显示仓库名（从 plan 映射）。
交互：自动滚动（新行到达且「跟随」开 → `scrollTop=scrollHeight`，用户上滚 200px 即暂停跟随，按钮恢复）；断线时顶部 NAlert「连接断开，正在重连（第 N 次）…」；`done` → `emits('finished')` 并关闭连接。

### 4.16 其他小组件

- **ThemeToggle**：icon 按钮，循环 light→dark→system，tooltip 显示目标模式。
- **StatCard**：props `{ label, value, icon?, accent? }`；`stat-value` + `stat-label`。
- **LogStateBadge**：StatusBadge 的 logState 语义包装，向导第 3 步与记录详情共用。

---

## 5. 状态管理（Pinia）

> 四个 store：`app` / `projects` / `repos` / `releaseWizard`。禁止跨 store 直接改 state（一律 action）；页面组件只消费 store，不重复发请求。文件：`stores/app.ts` / `stores/projects.ts` / `stores/repos.ts` / `stores/releaseWizard.ts`。

### 5.1 app（stores/app.ts）

```ts
state: {
  bootstrapped: boolean
  config: AppConfig | null
  resolvedTheme: 'light' | 'dark'
  paletteOpen: boolean
  syncing: boolean
}
getters: {
  isDark: (s) => s.resolvedTheme === 'dark'
  pwaEnabled: (s) => s.config?.pwa.enabled ?? false
  port: (s) => s.config?.port ?? APP_DEFAULT_PORT
}
actions: {
  async bootstrap()            // ① GET /api/config；401 → GET /api/auth/init 取 token 存 sessionStorage 后重试；
                               // ② resolvedTheme = 解析 config.theme（system → matchMedia）；③ html.dark 同步；④ 按 pwa.enabled 调 pwa/register.ts
  async updateConfig(patch: Partial<AppConfig>)  // PUT /api/config，成功后合并到 config
  setTheme(t: 'light' | 'dark' | 'system')       // 本地即时切换 + 节流 updateConfig({ theme: t })
  togglePalette(open?: boolean)
  async rotateToken()          // POST /api/auth/rotate → 更新 sessionStorage token
  async syncDataRepo()         // POST /api/system/sync，syncing 态
}
```

### 5.2 projects（stores/projects.ts）

```ts
state: { items: ProjectDef[]; overview: OverviewData | null; loading: boolean; error: string | null }
getters: {
  byId: (s) => (id: string) => s.items.find(p => p.id === id)
  repoById: (s) => (pid: string, rid: string) => s.byId(pid)?.repos.find(r => r.id === rid)
  changedProjects: (s) => s.overview?.projects.filter(p => p.changedRepoCount > 0) ?? []
}
actions: {
  async fetchAll()                          // GET /api/projects
  async fetchOne(id)                        // GET /api/projects/:id，写入 items（upsert）
  async fetchOverview()                     // GET /api/overview
  async create(input: Omit<ProjectDef,'id'|'repos'|'version'|'createdAt'|'updatedAt'>)  // POST /api/projects → unshift
  async update(id, patch: Partial<ProjectDef>)   // PUT /api/projects/:id → upsert
  async remove(id)                          // DELETE /api/projects/:id → 移除
  async addRepo(pid, input: { path: string } | CloneRequest)  // POST /api/projects/:pid/repos → push 到对应项目 repos
}
```

### 5.3 repos（stores/repos.ts）

```ts
state: {
  statuses: Record<string, RepoStatus>      // key: `${pid}:${rid}`
  statusPending: Record<string, boolean>
  treeCache: Record<string, TreeNode>       // key: `${pid}:${rid}:${path}`
  fileCache: Record<string, FileContent>    // key: `${pid}:${rid}:${path}`
}
getters: {
  statusOf: (s) => (pid: string, rid: string) => s.statuses[`${pid}:${rid}`]
  treeOf:   (s) => (pid: string, rid: string, path: string) => s.treeCache[`${pid}:${rid}:${path}`]
}
actions: {
  async fetchStatus(pid, rid, fresh = false)   // GET .../status?fresh=，缓存 60s（新鲜度以 server 轮询为准）
  async refreshStatuses(pid)                   // 项目内并行 fetchStatus(fresh=true)
  async fetchTree(pid, rid, path = '')         // 命中 treeCache 直接返回
  async fetchFile(pid, rid, path)              // 命中 fileCache 直接返回
  clearAll()
}
```

### 5.4 releaseWizard（stores/releaseWizard.ts）

```ts
state: {
  projectId: string | null
  step: 1 | 2 | 3 | 4 | 5 | 6
  statuses: RepoStatus[]                 // 第 1 步 fresh 检测结果
  selectedRepoIds: string[]              // 默认 = 全部 changed 仓库
  bumpOverride: BumpType | 'auto'        // 第 2 步选择，默认 'auto'
  plan: PublishPlan | null
  logs: {
    external: { state: LogState; content: string }   // 初始 = plan.externalDraft, 'auto'
    internal: { state: LogState; content: string }   // 初始 = plan.internalDraft, 'auto'
  }
  offline: boolean                       // 默认 false
  skipBuild: boolean                     // 默认 false
  taskId: string | null
  events: PublishEvent[]
  phase: 'idle' | 'planning' | 'running' | 'done' | 'failed'
  result: { releaseId: string; version: string; failedRepos: string[] } | null
  error: string | null
}
getters: {
  changed: (s) => s.statuses.filter(st => st.changed)
  selectedRepos: (s) => s.statuses.filter(st => s.selectedRepoIds.includes(st.id))
  syncedOnly: (s) => (s.plan?.syncedOnly ?? [])        // 未变动、仅同步基版
  canNext: (s) => 按 §8.5 步骤校验表逐步骤计算
  canExecute: (s) => s.logs.external.state === 'confirmed' && s.logs.internal.state === 'confirmed' && !!s.plan
}
actions: {
  async start(pid)                     // 重置全部 + 跳向导
  async detect()                       // step1：reposStore.refreshStatuses(pid) → statuses
  async loadPlan()                     // step2：POST /api/projects/:pid/plan body { projectId, bump: bumpOverride, repoIds: selectedRepoIds } → plan；logs 初始化为 'auto' + 草稿
  async rePlan()                       // bumpOverride/selectedRepoIds 变化后重取（若日志已 edited 先确认提示）
  next() / back() / goto(step)
  editLog(side: 'external'|'internal', content: string)   // state: 'auto'|'edited' → 'edited'
  resetLog(side)                       // content = plan 草稿；state = 'auto'
  confirmLog(side)                     // 'edited' → 'confirmed'（内容非空校验）
  unconfirmLog(side)                   // 'confirmed' → 'edited'
  async execute()                      // step5：POST /api/projects/:pid/publish → { taskId } → phase='running' → subscribePublish
  async reset()
}
```

---

## 6. API Client 封装（api/http.ts）

```ts
const TOKEN_KEY = 'bxverse-token'

// 会话 token：sessionStorage（architecture §5.2），只走 X-BX-Token 请求头，绝不使用 Cookie
export async function request<T>(method: string, path: string, body?: unknown): Promise<T>
//  1. headers: { 'Content-Type': 'application/json', 'X-BX-Token': token }（有 token 时）
//  2. 响应 401：若无 token → GET /api/auth/init 获取 token 后自动重试一次；
//     重试仍 401 → toast「访问令牌失效，请重新打开页面」+ throw ApiError(401)
//  3. 非 2xx：解析 { error, code } → toast.error(error)（409 用 warning 样式）→ throw ApiError(status, code, error)
//  4. 网络异常：toast「无法连接本地服务（http://127.0.0.1:{port}）」+ throw

export function subscribePublish(onEvent: (e: PublishEvent) => void): () => void
//  EventSource 无法携带自定义头 → 用 fetch + ReadableStream 手动解析 SSE 帧：
//  GET /api/publish/stream（Accept: text/event-stream，X-BX-Token 头）
//  逐行解析 `event: publish` + `data: {json}` → JSON.parse → onEvent
//  断线重连：3s 起，指数退避 ×2，上限 10s；重连成功后继续接收（server 会补发快照事件）
//  忽略 `: ping` 心跳注释行；返回取消函数（abort + flag）
```

`api/index.ts` 资源函数（全部走 `request`，路径字面量只出现在本文件）：

```ts
getConfig / putConfig / getOverview / getProjects / createProject / updateProject / deleteProject
addRepo / getRepoStatus / getTree / getFile / planPublish / publish / getReleases / getRelease
syncDataRepo / rotateToken / authInit
```

---

## 7. 路由表与导航守卫

```ts
// router/index.ts —— history 模式（生产 SPA fallback 依赖）
const routes = [
  { path: '/',                  name: 'dashboard',     component: Dashboard.vue },
  { path: '/project/:id',       name: 'project-detail',component: ProjectDetail.vue },
  { path: '/project/:id/release', name: 'release-wizard', component: ReleaseWizard.vue },
  { path: '/repo/:pid/:rid',    name: 'repo-detail',   component: RepoDetail.vue },
  { path: '/settings',          name: 'settings',      component: Settings.vue },
  { path: '/:pathMatch(.*)*',   name: 'not-found',     component: NotFound.vue },
]
// meta.title 映射：总览/项目详情/发布向导/仓库详情/设置
```

守卫：

- `beforeEach`：`await appStore.bootstrap()`（仅首次）；设置 `document.title = `${meta.title} · ${APP_NAME}``；启动 `NLoadingBar`。
- `afterEach`：`NLoadingBar` 完成。
- 向导页组件内 `onBeforeRouteLeave`：`releaseWizard.phase==='running'` 时弹 `NDialog` 确认「发布仍在执行，离开将中断页面展示（服务端任务不受影响）」；确认离开时调用 SSE 取消函数。

---

## 8. 发布向导六步状态机与数据流

### 8.1 步骤定义

| 步 | 名称 | 关键数据 | 数据来源 |
|---|---|---|---|
| 1 | 检测变更 | `statuses` / `selectedRepoIds` | `GET .../repos/:rid/status?fresh=true`（并行） |
| 2 | 版本号 | `plan`（PublishPlan） | `POST /api/projects/:id/plan` |
| 3 | 日志编辑 | `logs.external` / `logs.internal` | plan 草稿 → 本地编辑态 |
| 4 | Dry-run 预览 | 由 `plan` 推导的「将执行命令清单」 | 纯前端渲染（不另发请求） |
| 5 | 执行 | `taskId` / `events` | `POST .../publish` + `GET /api/publish/stream` |
| 6 | 完成摘要 | `result` | SSE `done` 事件 `data` |

### 8.2 步骤间数据传递与回退规则

- 状态全部保留在 `releaseWizard` store，步骤切换**不销毁**已填数据（组件用 `v-show` 或 keep-alive，禁止卸载重建）。
- **回退保留**：3→2→3 日志编辑保留；4→2 修改 bump 触发 `rePlan()`，若任一侧日志 state 已是 `edited`/`confirmed`，先 `NDialog` 确认「重新生成计划将重置日志草稿」（确认后 logs 复位为 `auto` + 新草稿）。
- **失效规则**：在步骤 1 改变 `selectedRepoIds` 且与生成 plan 时的集合不一致 → 回到步骤 2 时必须 `rePlan()`（步骤 3/4 内容作废，按钮态提示「需重新生成计划」）。

### 8.3 步骤 1 细节

- 加载中：仓库卡骨架屏 + 「正在检测各仓库变更…」。
- 列表：每个仓库行 = RepoCard 变体（勾选框 + changed 徽标 + commits 数 + dirty 徽标 + `lastPublishCommit` 前 7 位）；默认勾选全部 `changed===true`；无变动仓库置灰显示「已同步」但**不可勾选**（它们将进入 `syncedOnly` 处理）。
- 空态：全部无变动 → EmptyState「所有仓库均为最新」+ 返回按钮。
- `dirty>0` 的仓库行尾 error 提示「有未提交改动，发布将失败（预检阻断）」——仍可勾选但步骤 2 前 toast 警告。

### 8.4 步骤 2 细节（版本号）

- 进入即 `loadPlan()`（`PublishRequest { projectId, bump: bumpOverride, repoIds: selectedRepoIds }`）。
- 展示区：
  - 项目版本：`{当前 projectVersion 基线} → {plan.projectVersion}`（大号 mono）+ `plan.bump` 徽标 + `suggestedBump` 说明（「建议：feat→minor / breaking→major / fix→patch」）。
  - bump 覆盖：NSegmented `auto / major / minor / patch`（绑定 `bumpOverride`，变更 → `rePlan()`）。
  - 仓库版本表：`plan.changed` 每行 name / `from` → `to`（mono，hybrid 展示 `v1.2.0.26081315`）/ commits 数；`plan.syncedOnly` 折叠区「仅同步基版 version.json（N 个）」。
  - `milestoneTag` 徽标（mono）+ `buildStamp` 展示；`plan.warnings` NAlert 列表。

### 8.5 步骤校验表（canNext / 按钮态）

| 当前步 | 进入下一步条件 | 不满足时行为 |
|---|---|---|
| 1 | `selectedRepoIds.length > 0` | 下一步禁用 + 提示「请至少选择一个变动仓库」 |
| 2 | `plan !== null` 且非 planning | loading 禁用 |
| 3 | 无强制条件 | 未确认时下一步点击弹提示「建议确认日志后再继续」（可继续） |
| 4 | `canExecute`（两侧 confirmed） | 「执行发布」禁用 + tooltip「对内/对外日志需全部确认」 |
| 5 | phase==='done' | 执行中下一步禁用 |
| 6 | — | 「完成」→ 返回项目详情 |

### 8.6 dry-run（步骤 4）→ execute（步骤 5）参数映射

步骤 4 渲染命令清单（**不发请求**，由 `plan` 推导）：

```
每个 plan.changed 仓库：
  1. [preflight] 检查 HEAD/dirty/lastPublishCommit
  2. [$ buildCommand]          ← 若 RepoDef.buildCommand 且 !skipBuild
  3. git tag v{projectVersion}          (milestoneTag)
  4. git tag build/v{version}           (plan.tags 对应行)
  5. 写 version.json / version-history.json   ← writeVersionFile!==false
  6. 更新 lastPublishCommit
每个 plan.syncedOnly 仓库：仅写 version.json 同步基版
项目：写发布记录（internal.md / external.md / data.json）
远程：!offline && hasRemote → git push --tags（失败仅警告）
```

步骤 4 顶部开关：`offline`（「离线发布（跳过远程推送）」）、`skipBuild`（「跳过构建命令」）——两个开关直接影响上方清单行（行灰显或标注「已跳过」）。

步骤 5 执行请求：

```ts
// POST /api/projects/:pid/publish
{
  projectId,                        // 当前项目
  bump: plan.bump,                  // 或 'auto'（bumpOverride==='auto' 时）
  repoIds: selectedRepoIds,
  offline, skipBuild,               // 步骤 4 开关
  externalContent: logs.external.state === 'auto' ? undefined : logs.external.content,
  internalContent: logs.internal.state === 'auto' ? undefined : logs.internal.content,
}
```

- 409（队列忙）→ NAlert「已有发布任务进行中」+ 重试按钮。
- 成功返回 `{ taskId }` → `phase='running'` → ReleaseConsole 挂载订阅。

### 8.7 步骤 6 完成摘要

`done` 事件 `data: { releaseId, version, failedRepos }`：
- 成功横幅：版本号大号展示 + 「发布记录 rel_{id} 已写入数据仓库」+ `pushed` 状态（`done` 事件后可选 `GET /api/releases/:id` 刷新 `pushed`）。
- `failedRepos` 非空 → warning 区列出失败仓库名 + 说明「失败仓库未更新基准，可下次重新发布」（失败隔离，architecture §6.3）。
- 动作：返回项目详情 / 查看发布记录（`GET /api/releases/:id` 弹层渲染双轨日志）/ 再次发布（`reset()` 回步骤 1）。
- `error` 事件（0 仓库成功）→ 整页 NResult error + 重试（回到步骤 2 重取 plan）。

---

## 9. 日志编辑器规格（LogEditor）

### 9.1 双轨差异

| | 对外 external | 对内 internal |
|---|---|---|
| 内容 | 按 `EXTERNAL_SECTIONS` 分节、排除 `ProjectDef.externalExclude` 类型 | 全量：提交 / 文件 / 统计 |
| 交互 | **可编辑**：左编辑右预览分屏 | **折叠查看**（NCollapse），展开默认只读，「编辑」按钮切换为可编辑 |
| 徽标 | 顶部 LogStateBadge | 折叠头行内 LogStateBadge |

### 9.2 external 分屏布局

```
[工具栏]  [自动草稿] [插入模板▾] [对比草稿]            [LogStateBadge] [确认]
┌─────────────────────┬─────────────────────────────┐
│ NInput type=textarea │ MarkdownView（实时预览，debounce 300ms）│
│ (mono 13px, 等宽)    │ 同步滚动可选（默认开）        │
└─────────────────────┴─────────────────────────────┘
```

### 9.3 工具栏按钮

| 按钮 | 行为 |
|---|---|
| 自动草稿 | 弹确认（已编辑时）→ `content = autoDraft`、state='auto' |
| 插入模板 | NDropdown：`EXTERNAL_SECTIONS` 各节标题 + 「按类型分组插入全部提交」（用 `plan.changed` 聚合 commits，按 section 生成 bullet 列表，插入光标处） |
| 对比草稿 | 切换 DiffView（`before=autoDraft, after=content`，label「自动草稿」/「当前内容」） |
| 确认 | state='edited' → 'confirmed'，锁定编辑器；再次点击（「解除确认」）→ 回 'edited' |

### 9.4 状态流转（每侧独立，两侧状态互不影响）

```
        [编辑任意内容]
  auto ────────────────► edited ───[确认]──► confirmed
   ▲                        ▲                    │
   │ [自动草稿按钮]           │ [解除确认]           │
   └────────────────────────┴────────────────────┘
```

- `auto`：内容 === `plan.externalDraft`/`plan.internalDraft`，灰色徽标「自动草稿」，预览可用、编辑可用。
- `edited`：蓝色徽标「已编辑」，可继续编辑；`content` 每次变更同步写入 store（无显式保存按钮）。
- `confirmed`：绿色徽标「已确认」，编辑器锁定（disabled + 半透明），仅「解除确认」可用。
- 约束：空内容不可确认（toast）；`unconfirm` 后进入执行步骤的守卫重新拦截（canExecute=false）。

### 9.5 提交确认与 publish 参数

- 仅当两侧均为 `confirmed` 时步骤 4 的「执行发布」可用（§8.5）。
- `externalContent` / `internalContent` 仅在 state ∈ {edited, confirmed} 时携带（§8.6）；state='auto' 时省略，服务端使用其自身草稿。

---

## 10. PWA 运行时启用

- `vite.config.ts`：`VitePWA({ injectRegister: false, registerType: 'autoUpdate', manifest: {...}, workbox: { navigateFallbackDenylist: [/^\/api/], runtimeCaching: 仅静态资源（hash 产物 CacheFirst / 文档 NetworkFirst）；/api 永不缓存 } })`。
- `pwa/register.ts`：导出 `enablePWA()` / `disablePWA()`；`enablePWA` 动态 `import('virtual:pwa-register')` 注册 SW，并动态向 `<head>` 注入 `<link rel="manifest" href="/manifest.webmanifest">`（用现有 manifest 或按 AppConfig 生成）；`disablePWA` 注销 SW 并移除 link。
- 调用点：`appStore.bootstrap()` 依据 `AppConfig.pwa.enabled` 决定（§5.1）；设置页保存 pwa 开关后立即调用（SW 注册/注销即时生效，无需刷新）。
- dev 模式不注册（仅 `import.meta.env.PROD` 生效）。

---

## 11. 无障碍与键盘操作清单

**键盘**

| 快捷键 | 范围 | 行为 |
|---|---|---|
| `Ctrl+K` / `Ctrl+P` | 全局 | 开/关命令面板（§2.3） |
| `Esc` | 全局 | 关面板/对话框/下拉；执行中控制台不可 Esc 退出（防误触） |
| `↑` `↓` `Enter` | 面板/菜单/树 | 选择与执行 |
| `→` / `←` | 文件树 | 展开 / 折叠 |
| `Tab` / `Shift+Tab` | 对话框 | 焦点循环（Naive 内置焦点陷阱） |

**无障碍**

- 焦点：全局 `focus-ring` 可见焦点环；对话框打开焦点落首个输入，关闭归还触发元素。
- 图标按钮：无文字图标按钮必须 `aria-label` 或 NButton 内嵌 tooltip。
- 徽标：StatusBadge 不单独依赖颜色（必配文字或 title）。
- 对比度：正文 ≥ 4.5:1（text-2 #57606A on white ≈ 6.1:1；brand-500 on white ≈ 4.7:1 仅用于大字/图标与描边，小号品牌文字用 brand-600）。
- 动效：`prefers-reduced-motion: reduce` 全部归零（§1.6）。
- 表单：校验错误与 `NAlert` 关联 `aria-describedby`；必填字段 `required` 属性。
- 控制台：输出区 `aria-live="off"`，仅阶段变化（step/done/error）用 `aria-live="polite"` 播报，避免读屏轰炸。
- 骨架屏/加载区：`aria-busy="true"` + 「加载中」文本。
- 路由切换：标题同步（§7），焦点重置到页面主标题（PageHeader）。

---

## 12. 与需求文档的对应关系

| 编号 | 需求 | 本文对应章节 |
|---|---|---|
| R1 | 客户端形态（本地 Web + 可选 PWA） | §2 布局、§10 PWA 运行时启用 |
| R2 | 项目/仓库两级管理 | §2.2 侧栏项目导航、§3.1/§3.2 页面 |
| R3 | 仓库接入（本地路径 + Git 地址克隆） | §4.9 AddRepoDialog（`{path}` / `CloneRequest` 双 Tab） |
| R4 | 仓库目录结构与文件查看 | §3.3 Tab 文件、§4.11 FileTree、§4.12 FileViewer（懒加载/truncated/binary） |
| R5 | 仓库级版本与日志管理 | §3.3 Tab 版本日志（kind==='repo' 过滤、修订视图） |
| R6 | 项目级版本与日志管理 | §3.2 发布历史、§8 发布向导 |
| R7 | 对内/对外日志双轨 | §3.3 双轨切换、§9 双轨编辑器 |
| R8 | 版本号方案可配 | §4.8 AddProjectDialog（repoVersionScheme）、§8.4 步骤 2（bump 覆盖） |
| R9 | 自动化 | §8.1 六步流程（自动检测/plan/草稿）、§4.15 ReleaseConsole |
| R10 | 纯本地与远程联动 | §8.6 offline 开关、§3.5 设置、§3.7 纯本地徽标 |
| R11 | 现有工程入默认项目 | §3.1 总览初始数据展示（默认项目）+ §4.7 空状态引导 |
| R12 | 版本联动 | §8.4 syncedOnly 展示「仅同步基版」、§8.6 dry-run 清单 |
| R13 | 改动点可见 | §3.1 changedRepos 面板、§4.3 CommitList（commits/files） |
| R14 | 日志自动生成 + 人工编辑确认 | §9.4 状态机（auto→edited→confirmed）、§9.3 工具栏 |
| R15 | 完整性（无历史包袱） | 全部按 types.ts 定稿类型设计，未迁移旧实现 |
| R16 | 足够好用 | §2.3 命令面板、§11 键盘清单、§4.7 空状态引导 |
| R17 | UI/UX 美观优雅精致大方 | §1 设计系统（色板/字体/间距/圆角/阴影/动效）、§3.7 徽标统一 |
