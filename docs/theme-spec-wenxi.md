# UI 规范 · WenXi 深色玻璃拟态主题

> 依据参考图（WenXiBuddy 任务管理界面，深色 SaaS 看板）整理。用于 bxverse 第二套主题风格（`AppConfig.themeStyle='wenxi'`，仅深色）。
> 状态：✅ **已落地**（2026-08-13，经 HTML 设计稿 v1.3 确认后实现）

---

## 1. 设计语言一句话

**「夜航翠光」**：近纯黑基底 + 玻璃拟态卡片 + 翠绿（薄荷绿）单一强调色 + 克制的彩色语义点缀，营造科技感、专注感、呼吸感的深色办公美学。

## 2. 色彩系统（令牌）

### 2.1 中性基底（黑→灰阶）

| 令牌 | 值 | 用途 |
|---|---|---|
| `--wenxi-bg` | `#050507` | 应用底色（近纯黑） |
| `--wenxi-bg-2` | `#0A0B0E` | 内容区底色（比 bg 略亮一档） |
| `--wenxi-surface` | `rgba(255,255,255,.045)` | 卡片玻璃面（半透明 + blur 叠加） |
| `--wenxi-surface-hover` | `rgba(255,255,255,.08)` | 卡片/行 hover |
| `--wenxi-surface-strong` | `#14161A` | 需要不透明底的面（如弹层） |
| `--wenxi-border` | `rgba(255,255,255,.08)` | 常规边框 1px |
| `--wenxi-border-strong` | `rgba(255,255,255,.16)` | hover/输入聚焦边框 |
| `--wenxi-text-1` | `#F4F6F5` | 主文字（近白，微带绿冷调） |
| `--wenxi-text-2` | `#B0B6B3` | 次级文字 |
| `--wenxi-text-3` | `#6E7571` | 弱化/辅助文字 |

### 2.2 强调与语义色

| 令牌 | 值 | 用途 |
|---|---|---|
| `--wenxi-accent` | `#00C96E（定稿沉稳绿，原设计稿 #00E676 已收敛）` | 主强调（翠绿）：主按钮、激活态、进行中状态点、今日指示线 |
| `--wenxi-accent-hover` | `#2BF095` | hover |
| `--wenxi-accent-pressed` | `#00C26B` | pressed |
| `--wenxi-accent-soft` | `rgba(0,230,118,.14)` | 激活项/标签的柔和底 |
| `--wenxi-accent-glow` | `rgba(0,230,118,.28)` | 光晕（激活卡阴影、指标卡发光） |
| `--wenxi-danger` | `#FF4D4F` | 错误/逾期 |
| `--wenxi-warning` | `#FFA940` | 警示/高优先级 |
| `--wenxi-info` | `#3B82F6` | 信息/设计中 |
| `--wenxi-purple` | `#A855F7` | 开发中 |
| 语义 soft | 同色 `α=.14` | 标签底色 |

**状态点色规**（沿用参考图语义）：进行中=翠绿、开发=紫、设计=蓝、逾期/阻塞=红、已完成=翠绿实心、未开始=灰。

### 2.3 配色原则

- 翠绿只做「行动/进行/成功」一件事，绝不滥用；信息层次靠灰阶，不靠彩色。
- 彩色标签必须「半透明底 + 同色文字」双件套，禁止纯色高饱和填充块。
- 数字类信息（指标、版本号、hash）用 `tabular-nums`，保证纵向对齐。

## 3. 字体与排版

- 字体栈：`-apple-system, 'Segoe UI', 'PingFang SC', 'HarmonyOS Sans SC', 'Microsoft YaHei', 'Inter', sans-serif`；代码/数字 `ui-monospace, 'Cascadia Code', Consolas, monospace`。
- 字重：Bold(700) 只给超大数字与主按钮文字；Semibold(600) 标题；Medium(500) 节标题/按钮；Regular(400) 正文。

| 层级 | 字号/字重 | 颜色 |
|---|---|---|
| 指标大数字 | 34–40px / 700 / tabular | text-1 |
| 页面标题 | 22–24px / 600 | text-1 |
| 卡片/节标题 | 15px / 600 | text-1 |
| 正文 | 13px / 400 | text-2 |
| 辅助/时间戳 | 11–12px / 400 | text-3 |

## 4. 形状、玻璃与动效

- **圆角**：卡片 18px；面板/输入 12px；按钮胶囊 999px；标签 7px；小徽标圆角 6px。
- **玻璃卡片配方**：
  ```css
  background: linear-gradient(160deg, rgba(255,255,255,.06), rgba(255,255,255,.02));
  border: 1px solid var(--wenxi-border);
  backdrop-filter: blur(18px) saturate(140%);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.06), 0 12px 32px rgba(0,0,0,.35);
  ```
- **背景氛围**：内容区顶部一束 `radial-gradient(60% 40% at 50% 0%, rgba(0,230,118,.05), transparent)` 极淡翠光；大数字卡片 hover 时叠加 `accent-glow` 阴影。
- **动效**：150ms ease-out 微过渡（color/background/border/box-shadow）；卡片 hover 上浮 `translateY(-2px)`；禁用 `transition-all`（遵循 WIG 规范）。

## 5. 图标

- 一律**线性图标**：`stroke-width 1.8`、无填充、圆角端点；常规 16–18px、侧栏 18px、指标卡 20px。
- 装饰图标 `aria-hidden="true"`；icon-only 按钮必须 `aria-label`（WIG 硬约定延续）。

## 6. 布局结构（三区）

```
┌─ 侧栏(216px/可折叠64px) ─┬─ 顶栏(56px) ──────────────────────────┐
│ Logo「BX 版本管理台」      │ 状态chip · 命令面板搜索 · 同步 · 新建项目 │
│ 总览(激活=翠绿soft底)      ├────────────────────────────────────────┤
│ ▾ 项目                     │ 内容区（page：标题 + 指标卡 + 区块）     │
│   主产品线 ●(待发布点)      │                                      │
│   …                        │                                      │
│ ─────────────              │                                      │
│ 服务状态 chip · 设置 ·     │                                      │
│ 主题 · 命令面板(Ctrl K)    │                                      │
└────────────────────────────┴──────────────────────────────────────┘
```

- 侧栏玻璃化：`bg rgba(10,11,14,.75)` + 右侧 1px 边框；激活项 = `accent-soft` 底 + 翠绿文字 + 左侧 2px 翠绿指示条。
- 顶栏新增（参考图引入）：通知区可选（绿点未读）、命令面板搜索框（占位符「搜索…」）、状态 chip、主题切换、主按钮放右侧。

## 7. 组件规范

### 7.1 按钮
| 类型 | 配方 |
|---|---|
| 主按钮 primary | 胶囊、`accent` 实底、白色文字+图标、hover 提亮 + 微光晕 |
| 幽灵按钮 ghost | 胶囊、透明底、`border` 描边、text-2；hover 边框提亮 |
| 危险按钮 danger | 胶囊、透明底、danger 描边文字；hover danger-soft 底 |
| 图标按钮 | 圆角 10px、text-3；hover 白字 + surface-hover 底 |

### 7.2 卡片
- 玻璃配方（§4）；hover 边框 → `border-strong`。
- 指标卡：左侧线性图标（16px 浅灰）+ 超大数字 + 标签；「有变化」时数字着翠绿 + 底部一条 2px 翠绿渐变线 + 柔和 glow。

### 7.3 标签 / 徽标 / 状态点
- 标签：`同色soft底 + 同色文字 + 7px 圆角`，如「高优先级」「待发布」；带小图标时图标 `aria-hidden`。
- 徽标（列头计数）：`text-3` 文字 + 深灰胶囊底（`rgba(255,255,255,.06)`）。
- 状态点：6px 圆点，按 §2.2 色规；行内前导，`aria-hidden`。

### 7.4 列表行 / 看板
- 列表行：左右 padding 20px、行高 44px、hover `surface-hover`；分隔线 `divide-border`。
- 看板列：玻璃卡 + 列头（色点 + 列名 + 计数徽标）；任务行：状态点 + 编号（text-3 小字）+ 名称（白 13px/500）+ 时间（text-3 11px）。

### 7.5 步骤条（发布向导六步）
- 已完成=翠绿勾 + 连线翠绿；当前=翠绿实心圆 + glow；未到=灰空心圆 + 灰连线；步骤名 12px。

### 7.6 进度指示
- 进度环（项目卡）：SVG stroke-dasharray，翠绿；进度条：翠绿渐变填充 + 深灰轨道。

## 8. 与当前主题的差异对照

| 维度 | 现状（亮/暗 indigo） | WenXi 深色玻璃拟态 |
|---|---|---|
| 主色 | Indigo `#4C6EF5` | 翠绿 `#00C96E（定稿沉稳绿，原设计稿 #00E676 已收敛）` |
| 基底 | 浅灰 F5F6F8 / 深灰 121316 | 近纯黑 050507 |
| 卡片 | 实色不透明、8px 圆角 | 玻璃半透明 + blur、18px 圆角 |
| 按钮 | 方角 8px | 胶囊 999px |
| 强调方式 | 色块填充 | soft 底 + 同色文字 + 光晕 |
| 数字 | 24px font-mono | 34–40px Bold tabular + 发光 |
| 顶栏 | 无 | 新增（搜索/状态/主操作） |

## 9. 落地映射（已实现 ✅）

- `apps/web/src/theme.ts`：新增 `wenxiThemeOverrides`（翠绿体系 + 18px 卡片圆角 + 胶囊按钮 + 玻璃色值）。
- `apps/web/uno.config.ts`：圆角/按钮变量化（`--bx-radius-*` / `--bx-radius-btn`），`sidebar-item-active` 加 `--bx-nav-indicator` 左指示条。
- `apps/web/src/styles/tokens.css`：`html.theme-wenxi` 全套 CSS 变量覆盖 + 背景氛围光 + 玻璃卡片配方（`backdrop-filter: blur(18px)`）+ 顶栏/侧栏玻璃化。
- `packages/shared/src/types.ts`：`AppConfig.themeStyle?: 'indigo' | 'wenxi'`（扩展字段，可选，不破坏既有语义）。
- `apps/server/src/api/config.ts`：POST /api/config 白名单新增 `themeStyle` + 校验。
- `apps/web/src/stores/app.ts`：`themeStyle` state/action（app.json 持久化）；wenxi 强制深色 + `html.theme-wenxi` class。
- `apps/web/src/App.vue`：Naive theme/overrides 按 themeStyle 选择。
- `apps/web/src/layouts/AppLayout.vue`：新增顶栏（页标题 / 命令面板搜索 / 服务状态 chip / 主题切换 / 同步数据 / 新建项目）。
- `apps/web/src/views/Dashboard.vue`：页头同步/新建按钮上移顶栏去重；空状态新建弹窗保留。
- `apps/web/src/views/Settings.vue`：外观区块新增「主题风格」双卡选择（点击即时预览）。

## 10. 已确认决策（2026-08-13）

1. ✅ 主强调色定为 **#00C96E 沉稳翠绿**（含 hover #1FD982 / pressed #00B160 / soft α.14 / glow α.28）。
2. ✅ **引入顶栏**：页标题 + 命令面板搜索 + 服务状态 chip + 主题切换 + 同步数据 + 新建项目；侧栏只保留导航与设置/主题/命令面板。
3. ✅ 主题切换交互：wenxi 风格下侧栏/顶栏主题按钮点击切回 indigo（保留当前 mode 语义）；indigo 下循环 亮/暗/系统。
4. ✅ 风格选择入口：设置页「外观与体验」区块双卡选择，点击即时预览并持久化到 app.json。
5. ✅ wenxi 仅提供深色（参考图为纯深色设计）；`system` 模式在 wenxi 下等价于深色。

## 11. 参考物

- 设计稿：`design/wenxi-mockup.html`（v1.3）+ `design/wenxi-mockup-preview.png`
- 落地实拍：`design/wenxi-app-dashboard.png`（总览页）、`design/wenxi-app-settings.png`（设置页）
