# bxverse 更新日志

## v1.0.0（2026-08-27）

### 重大变更（major）
- v1.0 首次 major 跨版本：bxverse 自身发版与产品发版同源化（dogfooding 闭环）。API 契约进入稳定期：shared/types.ts + shared/constants.ts 双冻结，后续走 1.x 维护更新路径。

**核心能力（v0.1.0 → v1.0.0 累计交付）**：

- **R1-R30**：项目/仓库级版本管理、双轨更新日志（internal/external）、R26 仓库级构建流水线（X.Y.Z + V 时间戳双格式 + manifestTarget 自动透传）、R27 external 日志分发（复制 / 导出 .md/.html / GitHub/Gitee Release 同 tag PATCH ）、R28 快速发布通道、 R29 webhook 通知、R30 prerelease 自定义
- **M5-08 首次使用引导**：四步引导 + 自动弹出 + 重看入口
- **M7 备份恢复产品化**：R19 bundle + 快照 + 产物备份 + 一等恢复（BX_HOME 白名单 + 冲突策略 overwrite + 版本号二次确认 + 恢复审计 restores）
- **M8 多项目看板与治理中枢**：脏仓 KPI + 相对时间 + 仓库治理菜单（编辑/移除）
- **M11 发布失败结构化恢复**：每仓结构化诊断（code/head/target/tag/tagSource/suggestions）+ 三出路（换版本号重试/接管续跑/回滚）+ 诊断包导出
- **M12 运维中心 OpsCenter**：一致性体检 + 数据迁移 + 引擎日志流级别过滤 + 关于 bxverse 自举版本
- **M13 驾驶舱增强**：近 8 周发布节奏柱状图 + 分支巡检入口
- **M14 命令面板增强**：fuzzy 匹配 + WIG a11y 收口
- **cli watchdog + update 子命令**：崩溃 3s 自动拉起；检查 npm registry 最新版本
- **零依赖自举 release**：`scripts/release.mjs` 聚合 `.changeset/*.md` → 自动 bump 6 个 package.json + 写 CHANGELOG.md

**质量门禁**：
- core 145 测试 / 19 文件
- typecheck 0 error（5 个包）
- build 全链成功
- e2e 三场景（中断续跑 / 向导六步含恢复演练 / 首次引导）全过

完整验收清单：`docs/v1-checklist.md`。

## v1.0.1（2026-08-29）

### 修复与维护（patch）
- post-v1.0 维护期：UI/UX 视觉打磨 + 性能大幅改善 + a11y 端到端补齐

- 视觉：motion token 体系（dur-fast/base/slow/page + ease-in/out/spring）+ LoadingState/focus-ring/stagger entry/wizard slide transition/card hover spring
- 性能：highlight.js 按需注册 18 个语言（4 处替换 utils/highlight）+ vite manualChunks 拆 4 个 vendor + PWA precache 22% 缩身（2.2MB→66KB） + utils/highlight ts 类型标注修复
- a11y：原生 button 补 focus-ring 全站 + useRovingTabindex / useGridRovingTabindex 双 composable + ReleaseWizard 步骤条 role=tablist + RepoDetail 子 Tab + ProjectDetail 仓库网格 role=grid + skip-to-main-content (WCAG 2.4.1) + ErrorState 移除 !important
- 维护：闭合 c17be3b 遗留内联多语句死循环（prettier 与 vue parser 冲突根治）+ packages/core/src/store.ts 修复 unicorn 警告

## v1.1.0（2026-09-01）

### 新增（minor）
- B 方向 · 多栈 versionSource：core/repo-policy 加 `detectVersionSource` + `readVersionBySource` + `writeVersionBySource`（gradle/cargo/goModule）；shared RepoDef.versionSource 枚举扩 5 值；RepoSettings NSelect 5 选 1
- C 方向 · 跨项目搜索：`GET /api/cross/search?q=&type=commit|version|name` 端点（commit 用 fullHash 前缀 / version 精确含 v/V 容错 / name 子串匹配）；web `CrossProjectSearch.vue` + `/cross` 路由 + 顶栏 + CommandPalette 入口
- D 方向 · 升级日志聚合页：`GET /api/aggregate/{feed,timeline,export}` 3 端点（feed 倒序 / 时间线 day/week/month 分桶 / md+json 导出附件流）；web `UpgradeFeed.vue` 视图（粒度/范围/项目 3 组过滤 + Timeline mini + 导出 .md）+ `/feed` 路由 + 顶栏 + CommandPalette 入口
- R31 · 多项目跨工程版本矩阵视图：`GET /api/matrix` + `/matrix` 路由 + `VersionMatrix.vue`，drift 列高亮、跨项目版本不齐可视化、0 入侵纯聚合
- R32 · 升级后回退到历史版本（端到端 0 入侵）：4 步 RollbackWizard（选 release → 影响面预览 → 版本与日志确认 → 执行）+ 3 入口（ProjectDetail/RepoDetail/CommandPalette）；3 门禁（confirmed 必填 + riskLevel='block' 409 拒绝 + 业务仓 0 入侵）；附 `docs/r32-rollback-guide.md` l-pc-front 迁移指南

## v1.2.0（2026-09-01）

### 新增（minor）
- UltimateHealthGrid：design v2.0 ULTIMATE 原型 7 区——系统健康速览 4 卡（数据仓库 clean · journal 无残留 · 备份目录覆盖率 · 服务进程 v/uptime/mem），数据走 `api.opsProcess()` + overview 聚合
- UltimateNotificationFeed：design v2.0 ULTIMATE 原型 8 区——实时通知流（绿/红 dot + 文本 + 时间戳），数据走 `api.opsLogs('all')` 最近 5 条，warn/error 级标红
- UltimateRecentReleases：design v2.0 ULTIMATE 原型 6 区——最近 4 条 release（状态 icon check/ban + 版本 + 项目 + 日期 + 仓数 + 提交数），数据走 `api.aggregateFeed({ limit: 4 })`，跳 UpgradeFeed
- UltimateSparkline：design v2.0 ULTIMATE 原型 5 区——近 8 周发布节奏 SVG 折线（260×70 渐变填充 + 描边 + W29/W36 端点 + 合计/峰值统计），数据走 `api.overviewWeekly()`
- UltimateView 完整驾驶舱：把 design v2.0 ULTIMATE 原型 9 大区（左侧 nav + 顶栏 + 4 张 KPI + 待发布变动 + sparkline + 最近发布 + 系统健康 4 卡 + 通知流）整体搬进产品 `/ultimate` 路由；新增 wenxi/indigo 双主题 `--wx-*` tokens + `.stat-card-wx` / `.wx-surface` / `.health-card-wx` / `.wx-row` / `.wx-dot` / `.commit-chip` 等基础 class；修复 vite dev 默认只 listen IPv6 `::1` 导致浏览器 IPv4 访问 `ERR_CONNECTION_REFUSED` 的隐性 bug（`apps/web/vite.config.ts` 加 `host: '127.0.0.1'`）。UI 风格与 design v2.0 原型一致
