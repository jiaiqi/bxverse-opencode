# UI 风格规范：「玻璃黑金 Bento」（v5 · 强调色可插拔版）

> 从 `design/bxverse-final-vision-v5.html` 全量提炼的可复用提示词：把本文件内容直接复制给任何 AI，即可按 v5 风格设计其他应用。若对方 AI 支持读文件/截图，建议连同 v5 原型一起提供（本提示词负责约束，原型负责视觉参照）。目标应用不是管理台时，§5 布局骨架可删，其余风格基因原样保留。
>
> **强调色机制**：本风格的骨架是固定的（暖石底 + 玻璃材质 + 三级文字 + 语义色），唯一强调色是一组可插拔 token（§3.3 色板）。全文凡出现 `--acc / --acc-strong / --acc-bright / --acc-soft / --acc-line / 强调色 / 金色光晕` 等字样，一律指**当前选中的那一套色板**对应值。用户未指定时默认用「鎏金」。

请严格按照以下风格规范设计界面。这是一套「暖石色 + 单强调色 + Liquid Glass 玻璃材质 + Bento 网格」的现代管理台/工作台设计语言，浅色优先、深色等价，信息密度中高（约 7/10）。

## 1. 一句话定位

在暖石色（stone）底色上漂浮磨砂玻璃卡片，以**一个**强调色为唯一视觉焦点，用一块深色玻璃 hero 瓦片做视觉锚点；克制的动效 + 颗粒质感 + 环境光晕，整体气质是「沉稳的奢侈感工具」，不是花哨的渐变风。

## 2. 字体

- 无衬线：`Outfit`（回退 -apple-system / PingFang SC / HarmonyOS Sans SC），中文自动落到苹方/鸿蒙黑体。
- 等宽：`JetBrains Mono` —— 所有数字、版本号、哈希、代码、路径、时间戳一律用等宽字体，并加 `font-variant-numeric: tabular-nums`。
- 字号体系：正文 14px / 行高 1.6；页面大标题 22px / 800 / 字距 -0.015em；区块标题 15.5px / 800；组件文字 13px；微标签 10.5–12px / 700 / 大写 / 字距 0.14em（分组标题、表头用）；大数字 28px / 800。
- 字重跨度 400–800，强调靠字重而非颜色。

## 3. 颜色

### 3.1 基础 token（固定，不随色板变）

浅色主题：

```css
--bg:#ECEAE5;            /* 页面底：暖石灰 */
--surf:#FFFFFF;          /* 实底表面（弹层内、次要件） */
--inktile:#1C1917;       /* 墨石色块（hero、toast、品牌标） */
--t1:#1C1917; --t2:#57534E; --t3:#A19D96;   /* 三级文字：主/次/弱 */
--ok:#16A34A; --warn:#EA580C; --dng:#DC2626;   /* 语义色各配 soft(≈.09 透明度) 与 line(≈.35) 两档 */
```

深色主题（等价切换，非简单反色）：

```css
--bg:#100F0D; --surf:#1E1C1A; --inktile:#F5F5F4;
--t1:#F5F5F4; --t2:#A8A29E; --t3:#78716C;
--ok:#4ADE80; --warn:#FB923C; --dng:#F87171;
```

### 3.2 强调色 token（由色板注入，公式统一）

```css
/* 浅色 */
--acc:        <色板 light.acc>;
--acc-strong: <色板 light.strong>;
--acc-bright: <色板 light.bright>;
--acc-soft:   color-mix(in srgb, var(--acc) 9%, transparent);   /* 或 rgba 等价透明度 .09 */
--acc-line:   color-mix(in srgb, var(--acc) 35%, transparent);  /* rgba 透明度 .35 */
--acc-glow:   color-mix(in srgb, var(--acc-bright) 35%, transparent);
/* 深色 */
--acc:        <色板 dark.acc>;
--acc-strong: <色板 dark.strong>;
--acc-bright: <色板 dark.bright>;
--acc-soft:   透明度 .11；--acc-line: .4；--acc-glow: .28
```

使用规则：**强调色是唯一强调色**，只用于主按钮、激活态、当前项、关键数字、focus 描边；语义色只用于状态标签/图标，永不做大面积底色。若选中的色板与某语义色过于接近（见 §3.3 各色板备注），按备注微调对应语义色。

### 3.3 强调色板（任选其一，默认 A）

| 色板 | 主题 | --acc | --acc-strong | --acc-bright |
|---|---|---|---|---|
| **A 鎏金 Amber**（默认 · v5 原版） | 浅 | `#A16207` | `#92610A` | `#CA8A04` |
| | 暗 | `#D9A521` | `#E3B341` | `#F0C24A` |
| **B 松石青 Teal** | 浅 | `#0F766E` | `#115E59` | `#14B8A6` |
| | 暗 | `#2DD4BF` | `#5EEAD4` | `#8AE9DB` |
| **C 赤陶 Terracotta** | 浅 | `#C2410C` | `#9A3412` | `#F0641E` |
| | 暗 | `#FB923C` | `#FDA46A` | `#FDBA8C` |
| **D 深海蓝 Cerulean** | 浅 | `#0369A1` | `#075985` | `#0EA5E9` |
| | 暗 | `#38BDF8` | `#7DD3FC` | `#BAE6FD` |
| **E 石墨 Mono** | 浅 | `#1C1917` | `#292524` | `#57534E` |
| | 暗 | `#E7E5E0` | `#F5F5F4` | `#FFFFFF` |

各色板气质与备注：

- **A 鎏金**：原版气质，「沉稳的奢侈感」，暖石底的天然搭档。无备注。
- **B 松石青**：暖底上唯一的冷色互补，清雅、专业工具感；与语义 ok 绿区分度足够。
- **C 赤陶**：暖调、手作/匠人气质。⚠️ 与 warn 橙（#EA580C）同族：选中本板时把 warn 改为琥珀 `#CA8A04`（暗色 `#FBBF24`），保持可区分。
- **D 深海蓝**：冷调科技感，适合数据/开发者工具。必须用此处给的深青蓝，**不得**换成 Tailwind 默认蓝 #3B82F6 一类的亮蓝。
- **E 石墨**：无彩色单色奢华，全靠字重与材质表达层级，最克制的一档。选中本板时 `--acc-glow` 用中性色 `rgba(51,46,40,.25)`（暗 `rgba(255,255,255,.12)`）。

## 4. 玻璃光影材质层（核心特征）

- **磨砂卡片**：`background: linear-gradient(155deg, rgba(255,255,255,.55), rgba(255,255,255,.32)); backdrop-filter: blur(20px) saturate(165%); border:1px solid rgba(255,255,255,.62); box-shadow: inset 0 1px 0 rgba(255,255,255,.6), 0 20px 48px -16px rgba(51,46,40,.2)`。暗色下玻璃为 rgba(46,42,38,.5)→rgba(30,28,25,.4)，边框 rgba(255,255,255,.1)，顶部内高光减到 .07。
- **环境光层**：页面铺一层 fixed 的 `pointer-events:none` 背景，由 2–3 个大半径 radial-gradient **强调色**/石色光斑（透明度 .08–.17）+ 一道 160° 白色线性高光组成，加 28s ease-in-out infinite alternate 的缓慢位移呼吸动画。默认布局（可直接用）：`radial-gradient(640px 420px at 14% -6%, var(--acc-glow), transparent 62%), radial-gradient(780px 520px at 92% -10%, rgba(120,113,108,.16), transparent 62%), radial-gradient(560px 460px at 74% 112%, color-mix(in srgb, var(--acc) 10%, transparent), transparent 62%)`。
- **颗粒质感**：最上层 fixed 覆盖 SVG feTurbulence 噪点（fractalNoise, baseFrequency .8），浅色 mix-blend-mode:multiply / opacity .32，暗色 overlay / .2。
- **深色玻璃 hero 瓦片**：`radial-gradient(340px 220px at 88% -10%, color-mix(in srgb, var(--acc-bright) 30%, transparent), transparent 70%)` 叠加 `linear-gradient(150deg, rgba(46,42,38,.96), rgba(24,22,20,.94))`，边框 rgba(255,255,255,.14)；hover 时一道 115° 白色光泽（透明度 .09）从左扫到右（translateX -130%→130%，1.15s）。
- **强调色主按钮**：`linear-gradient(160deg, var(--acc-bright), var(--acc-strong))`（亮部在上、暗部在下）+ `inset 0 1px 0 rgba(255,255,255,.35)` 顶部高光 + `0 8px 22px -8px var(--acc-glow)` 强调色光晕；hover 整体提亮一档（filter:brightness(1.06) 或换更亮一档渐变）。浅色主题按钮文字 #fff；深色主题按钮文字一律 #1C1917。金色次强调按钮（hero 内 CTA 用）：`linear-gradient(160deg, 提亮一档的 bright, 压暗一档的 strong)`，文字 #231A05。
- **降级**：`@media (prefers-reduced-transparency: reduce)` 时所有玻璃退回实底色（浅 #FFF / 暗 #1E1C1A），去 blur，隐藏颗粒。

## 5. 布局骨架

- 左侧**悬浮玻璃侧栏**：不贴边，四周留 16px gutter，宽约 224px，圆角 22px，同款玻璃材质；内含品牌标（32px 墨石色圆角方块 + 白色等宽字缩写）、项目列表、分组导航（大写微标签分组头）、底部主题开关与状态行。
- 主区：sticky 顶栏（透明玻璃 blur(16px)，无边框线），左标题右搜索框 + 主按钮；内容列 `max-width:1200px; margin:0 auto; padding:26px 30px 80px`。
- **Bento 总览网格**：4 列 / gap 12px；关键「待办 hero」瓦片 span 2×2 用深色玻璃材质；统计瓦片 1×1；图表/次要瓦片 span 2×1。其他列表页用 3 列卡片网格。

## 6. 组件规范

- 圆角：卡片 16px，控件/按钮/输入 9px，弹层 18px，标签胶囊 99px，头像 8px。
- 卡片 hover：translateY(-2px) + 边框变亮（浅色 rgba(255,255,255,.85)）+ 阴影加深。
- 标签 pill：语义色文字 + soft 底 + `inset 0 0 0 1px <语义line色>` 内描边，11px/700；强调色标签用 `var(--acc-soft)` 底 + `var(--acc-line)` 内描边。
- 表格：表头 11px/700/大写/字距 .08em，行 hover 用半透明白（浅 .32 / 暗 .05）不加边框色。
- Tabs：底部 2px `var(--acc)` 下划线激活，文字变 `var(--acc-strong)`（暗 `var(--acc)`）加粗。
- 步骤条：圆形序号球，激活时 `var(--acc)` 实底 + `0 0 0 4px var(--acc-soft)` 外扩环，完成态绿色 soft；步骤间连接线为 2px，填充时 scaleX 从左展开。
- 分段控件：外包 1px 边框 + 6% 墨色底的槽，内部白色 pill 滑块，spring 曲线滑动。
- 时间线：左侧 2px 竖线，节点为 2.5px 边框圆点，最新一条 `var(--acc)` 实底 + acc-soft 光环。
- 弹层：全屏遮罩 rgba(28,25,23,.45) + blur(7px)，弹层本体为更实的玻璃（blur 30px / saturate 180%），入场 translateY(20px)+scale(.97) 弹入。
- 命令面板（⌘K）：顶部无边框输入 + 分组列表 + 底部快捷键说明条（↑↓ 选择 / ↵ 执行 / Esc 关闭）。
- Toast：深墨色玻璃胶囊居底部居中堆叠，图标用 `var(--acc-bright)`。
- 输入框 focus：`border-color: var(--acc); box-shadow: 0 0 0 3px var(--acc-soft)`。
- kbd：等宽 10px，1px 边框 + 底边 2px，4px 圆角。

## 7. 动效

- 缓动：标准 `cubic-bezier(.22,1,.36,1)`，弹性 `cubic-bezier(.34,1.4,.5,1)`；过渡统一 .18–.35s。
- 页面进场：子元素依次 `rise`（opacity 0→1 + translateY 10px→0，45ms 阶梯延迟）。
- 数字用 count-up（750ms，ease-out cubic）；柱状图从底部 scaleY 生长（spring，逐根 50ms 延迟）；成功态用 SVG stroke-dashoffset 描画对勾。
- 按钮 active 缩放 .97；图标按钮 hover 旋转 90°（关闭按钮）。
- 必须支持 `prefers-reduced-motion: reduce`（全部动画时长压到 .01ms）。

## 8. 细节与无障碍

- focus-visible：2px `var(--acc)` outline + 2px offset。
- 装饰图标 aria-hidden；icon-only 按钮带 aria-label；弹层 role="dialog" aria-modal。
- 文本选区背景 `color-mix(in srgb, var(--acc) 22%, transparent)`。
- 滚动条：10px，thumb 用 line3 色 + 2.5px 同底色边框做「内缩」效果。
- 空状态：居中、大图标 50% 透明度、两行文案（标题 700 / 描述 12px 弱色）。
- 新建占位卡片：1.5px 虚线边框 + 透明底，hover 变 `var(--acc)` + acc-soft 底。

## 9. 反面清单（禁止）

- 强调色**只能取自 §3.3 色板之一**；禁止 Tailwind 默认蓝 #3B82F6、霓虹紫、粉紫渐变、glow 文字；一个界面只允许一套强调色，不得混用多板。
- 禁止大面积高饱和色块；语义色只做小标签。
- 禁止纯黑 #000 / 纯白对比过激的界面，全部走暖石色灰阶。
- 禁止无意义的 3D、拟物阴影堆叠；玻璃材质必须服务于层级（浮层 > 侧栏 > 卡片），不得到处都是。
- 数字/代码不得用比例字体；中文回退字体必须显式声明 PingFang SC / HarmonyOS Sans SC / Microsoft YaHei。
