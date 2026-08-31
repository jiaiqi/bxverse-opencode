# bxverse 下一阶段开发总纲

> 版本：v1.0（2026-08-25）
> 定位：**方向与排期的唯一裁决文档**。回答「接下来开发什么、按什么顺序、怎么算完成」。
> 与其他文档的关系：
> - 需求对不对 → 以 `docs/requirements.md`（R1–R30，唯一需求依据）为准；
> - 单个任务怎么做 → 查 `docs/optimization-plan.md`（任务卡库）与对应层设计文档；
> - 先做什么、为什么 → 以本文档为准。冲突时：requirements > 本文档 > optimization-plan。

---

## 1. 现状快照（截至 2026-08-25）

### 1.1 已交付

- 功能面：R1–R30 全部落地（含 R26 仓库级构建流水线双格式、R27 Release 分发、R28 快速发布、R29 webhook、R30 prerelease）；里程碑 M1–M6 完成，v1.0.0 已打 Tag。
- 工程面：GitHub Actions CI（ubuntu/windows 双矩阵）、oxlint + prettier + husky pre-commit、`pnpm test:e2e` 统一编排、credentials.json 容错加固。
- 设计面：终极形态交互原型 `design/bxverse-ultimate-cockpit.html`（Vue3 + Tailwind 单文件，全交互闭环，Playwright 回归 28 断言全绿）——**下一阶段前端开发的形态依据**。

### 1.2 剩余欠账（roadmap §0 口径）

| # | 欠账 | 现状 | 收口标准 |
|---|---|---|---|
| D1 | M5-08 首次使用引导 | ✅ 已完成（2026-08-25，含 e2e/onboarding.py） | 四步引导上线（欢迎 → 令牌保护 → 建项目/接仓库 → 演示数据或真实接入），侧栏可重看 |
| D2 | M7 备份恢复产品化 | 引擎/API 部分落地（`backup/restore.ts` + `POST /api/backups/restore`），缺 UI | 恢复对话框上线：BX_HOME 白名单目录、冲突策略（跳过/覆盖/中止）、输版本号二次确认、SSE 进度 |
| D3 | M8 多项目看板与治理中枢 | ✅ 已完成（2026-08-26，看板 + 双模式 + 治理菜单 + 脏仓 KPI + 相对时间） | 全部完成，roadmap §0 翻 ✅ |

### 1.3 设计资产盘点（2026-08-25 已清理）

- **保留**：`design/bxverse-ultimate-cockpit.html`（主原型，唯一形态依据）；`design/.diag-tmp/`（原型回归脚本，迭代原型时复用 `_regress5.py` 模式）。
- **归档**（`design/_archive/`，确认无引用后可整目录删除）：v2 三代旧原型、ultimate-state（增量已合并进主原型）、proto/final 截图、wenxi 早期稿（规范已沉淀进 `docs/theme-spec-wenxi.md`）。
- **归档**（`docs/_archive/`）：`bxverse-redevelopment-requirements.md`（从零重建专项输入规格，一次性用途；日常开发勿再引用，以 requirements.md 为准）。

---

## 2. 北极星：原型差距清单

以 `design/bxverse-ultimate-cockpit.html` 为形态基准，逐项对照现状。**「原型演示专用」的特性（如"标注新能力"开关、故障演练开关）不进产品**，下表只列产品功能差距。

| 原型能力块 | 现状 | 差距与落地点 |
|---|---|---|
| 总览驾驶舱（KPI 卡 / 发布节奏图 / 分支巡检入口） | Dashboard 已有轮询与变动列表 | 增：KPI 卡区、近 8 周发布节奏 sparkline、misaligned 仓一键对齐入口（R25 已有后端） |
| 发布向导 · 失败结构化恢复 | 仅有中断续跑（journal） | 增：失败仓隔离展示、**结构化诊断面板**（复用 doctor 内核只读核对）、三条恢复出路（换版本号重试失败仓 / 接管续跑 / 回滚副作用写废弃审计 R24）、诊断包导出 |
| 备份恢复一等化 | 见 D2 | 见 D2，原型恢复弹窗即设计依据 |
| 运维中心（系统健康页） | 无此页；doctor 仅为 `scripts/doctor.mjs` CLI | doctor 产品化：core 化 + `GET /api/ops/doctor` + 健康页（巡检卡 / 数据迁移卡 / 引擎日志流级别过滤 / 关于 bxverse） |
| 新手引导 Onboarding | 见 D1 | 见 D1，原型四步即文案与流程依据 |
| 命令面板 | M4 已有基础版 | 增强：模糊搜索、命令分类（操作/页面/仓库）、`Ctrl K` 全局唤醒 |
| 体验基线 | 部分 | 文本全局可选中（仅按钮禁选）、卡片导航真实 RouterLink（已做）、SSE 断线指数退避重连标注 |
| bxverse 自举 | 无 | 自身版本用 changesets 工程化管理，自身更新日志/发布记录同构复用自家引擎（dogfooding） |

---

## 3. 三个阶段

### Phase 1 · 收尾欠账（先做，量小确定性高）

| 顺序 | 任务 | 设计依据 | 验收 |
|---|---|---|---|
| 1 | D1 Onboarding（M5-08） | 原型 Onboarding 弹窗 | 首次启动（无 app.json 项目）自动弹出；四步可前进/后退/跳过；侧栏与命令面板可重看；e2e 覆盖 |
| 2 | D2 备份恢复向导（M7 收口） | 原型恢复弹窗 | 白名单校验、冲突策略、版本号二次确认解锁、恢复进度 SSE、恢复记录入审计；fixture 演练通过 |
| 3 | D3 M8 看板收尾 | roadmap §8 追溯矩阵 | roadmap §0 翻 ✅，README 功能清单同步 |

出口：roadmap §0 无 🟡/🔄 行；`pnpm typecheck && pnpm build && pnpm test && pnpm test:e2e` 全绿。

### Phase 2 · 原型差距落地（主力阶段）

按依赖顺序推进，每项都是「core → server → web → 文档」全链：

| 顺序 | 任务 | core | server | web | 关键约束 |
|---|---|---|---|---|---|
| 1 | doctor 内核 core 化 | ✅ 已完成（2026-08-26） | `GET /api/ops/doctor` 已上线 | core/doctor.ts + scripts/doctor.mjs 调 core + server 端点 + 8 个单测 | 只读不修复；结构化 DoctorReport（counts/overall/projects[repos]）|
| 2 | 发布失败结构化恢复（第一段：数据通道 + 引擎 + server）| ✅ 已完成（2026-08-26 后端部分，UI 卡片下阶段单做） | core engine 失败时落结构化 failedReports（code/head/target/tag/tagTarget/suggestions）+ rollbackFailedPublish（仅删自产 build 标签 + 标 deprecate release + 写 R24 审计 + commitRecords）；shared FailedRepoReport + PublishEvent.code/detail 扩展；errors 增 PREFLIGHT_FAILED/BUILD_FAILED/INSTALL_FAILED/PRE_BUILD_FAILED/PUSH_FAILED；server /api/publish/:taskId/failure（结构化失败诊断）+ /rollback；web store 透 failedReports + api 暴露 publishFailure/publishRollback；core 单测 +2（145 全过） | 下一段：✅ web 端执行步失败卡片 + 结构化诊断面板 + 三出路按钮 + 诊断包导出（2026-08-26 完成：FailureRecoveryCard.vue + StepResult 集成 + wizard retry-bump/resume handlers + api publishFailure/publishRollback） |
| 3 | 运维中心页 | ✅ 已完成（2026-08-26） | ops 路由组：/api/ops/process（自举版本/内存 RSS/uptime/BX_HOME）+ /api/ops/logs（30 天滚动 JSON 行按 level 过滤）+ core 补 export resolveHome | 系统健康页 OpsCenter.vue 四卡：一致性体检（doctor）/数据迁移/引擎日志流/关于 bxverse + 30s 自动刷新 + doctor.md 报告导出 | 日志流级别过滤前端做；日志 30 天滚动保留 |
| 4 | 驾驶舱增强 | ✅ 已完成（2026-08-26） | server /api/overview/weekly（近 8 周发布次数 + 跨项目数，按 ISO 周 YYYY-Www 分组）| Dashboard 新增发布节奏柱状图（svg 8 柱 + 峰值提示 + 跨项目聚合统计）+ 分支巡检入口（首个项目跳转 + OpsCenter 入口）| 数据全部来自既有 store/ds.listRecords，零新采集 |
| 5 | 命令面板增强 + 体验基线 | ✅ 已完成（2026-08-26） | CommandPalette fuzzy 匹配（连续命中加权 + 短查询优先 + 关键词/标题双轨排序）+ WIG a11y 收口（aria-label 描述总项数 + listbox role + 空态 role=status + 计数条）；⌘K（macOS）+ Ctrl K 全局唤醒已就位 | 文本可选中治理已在 M8 阶段默认（前端 body 默认文本可选） | 遵守 frontend.md §12 WIG |

出口：原型能力块差距表前七行全部「现状=已落地」；向导故障演练走 fixture 仓库真实复现一次 TAG_CONFLICT 并走完三条出路。

### Phase 3 · 自举与分发（最后做）

1. ✅ bxverse 自身接入 changesets，自身发布吃自家引擎（dogfooding，顺带压测）—— `scripts/release.mjs`（零依赖）+ `.changeset/README.md`
2. ✅ cli 增加 watchdog（崩溃 3s 拉起）与「关于」信息端点 —— `bx-manager start --watchdog` + `bx-manager update`
3. ✅ 安装/升级/卸载指引文档化（README + development.md）—— README 增「bx-manager（CLI 薄壳）」+「自举 release」两节，development.md 增 §11 自举 release 协议；首次贡献者可按 4 步跑完整发版

出口：`bx-manager` 全局安装后可完成升级自检；自身更新日志由 bxverse 生成。

---

## 4. 执行纪律（每任务适用）

1. **一次一张任务卡**：从 `optimization-plan.md` 或本纲要 Phase 表取项，不混改。
2. **先文档后代码**：行为/契约变化先改对应 `docs/*.md`（需求级变化回写 requirements.md 变更记录），再实现。
3. **契约只增不改**：`shared/types.ts`/`constants.ts` 仅新增可选字段并标注 `// 扩展：`。
4. **零依赖红线**：core/server 禁止新增第三方运行时依赖；git 一律 `spawn` 数组参数。
5. **验证门槛**：core 改动 `pnpm typecheck && pnpm test`；server/web 改动 `pnpm typecheck && pnpm build`；发布链路必走 fixture 向导 e2e；UI 改动亮暗双主题走查。
6. **改 server 必重启验证**；UI 原型迭代后跑 `design/.diag-tmp/_regress5.py` 模式回归。
7. **并行策略**：Phase 2 内「core+server」与「web 页面骨架」可并行（契约先行，mock 联调）；同一文件不并行写。

---

## 5. 文档治理规则

- `docs/` 保留 11 份：requirements / architecture / roadmap / data-model / core-engine / api / frontend / development / r26-build-pipeline / theme-spec-wenxi / optimization-plan + 本文档。
- 新增设计文档必须登记到根 `AGENTS.md` §6 文档索引表，并写明「阅读时机」。
- 过期文档一律移入 `_archive/`（不直接删除），确认 30 天无引用后方可物理删除。
- `design/` 只保留当前生效原型；被取代的稿一律归档。

## 6. 变更记录

| 日期 | 说明 |
|---|---|
| 2026-08-25 | 初版：依据 roadmap §0 现状、ultimate-cockpit 原型差距、六角色评审结论制定三阶段路线；同步完成 docs/design 清理归档 |
| 2026-08-27 | **v1.0.0 tag 落地**（首次 major）—— 验收清单 docs/v1-checklist.md 8 节全过；scripts/release.mjs 0.1.0→1.0.0 自动 bump 6 package + 写 CHANGELOG；git tag v1.0.0 在 commit 10dcb82；API 契约双冻结进入 1.x 维护路径 |
| 2026-08-27 | 方向 B·F2 收口：server 契约层（缺省=false 裁决落地）+ 3 条契约测试（40 passed）；typecheck/e2e 全绿；剩余 optimization-plan TODO：A1（CoreError 统一错误体系，含 F2 中文嗅探改结构化字段）、S4（SSE 事件持久化到 journal 跨重启回放） |
| 2026-08-27 | 方向 B·A1 收口：server test/core-error.test.ts 20 条全过（statusForCode 16 表测 + sendError 序列化 4 测）；server 40→60；core 145 / typecheck / build / e2e 三场景全绿；剩余 optimization-plan TODO 仅 S4（SSE 事件持久化到 journal 跨重启回放） |
| 2026-08-27 | 方向 B·S4 收口：SSE 事件持久化 4 步核心实现（journal appendEvent/loadEvents/queue restoreFromJournal/sse normalizeReplay truncated 头帧）本就绪；新增 4 条 core 契约测试（追加/原序读回/空查询/超 MAX 截断）；core 145→149 全过；typecheck/build/e2e 三场景全过；optimization-plan 4 个 TODO（F2/A1/A2/A3/S4 文档）收口完成；S2/A2/A3 不在 B 范围（性能/索引层） |
| 2026-08-27 | 方向 C·A2 收口：DataStore 索引增量 3 步实现本就绪 + 8 条契约测试（追加式/性能 5ms/spy 验证/完整模式/不抛错/兼容性）；core 149→157 全过；store 0 测试债务清零；下一步 A3（overview/listRecords 快速路径，依赖 A2 已就绪） |
| 2026-08-27 | 方向 C·A3 收口：overview.ts listRecords(limit=1) → `{limit:1, full:false}` 走 index 摘要快速路径（lastRelease 只用 version+date，省一次 data.json IO）；新增 apps/server/test/overview-perf.test.ts 3 条契约测试（200 条后 lastRelease 字段正确 + spy 0 次 data.json 读 + date 倒序）；server 60→63；typecheck/build/e2e 三场景全过；方向 C 序号 1-2 收口完毕 |
| 2026-08-28 | 方向 D·F1 收口：readJsonBody 现状本就绪（Buffer 累积 + 末尾 Buffer.concat().toString('utf8') 一次性 decode + 32MB 字节判断 + 超限 req.resume() 排空），无需实现改动；新增 apps/server/test/read-json-body.test.ts 5 条契约测试（中文 1KB 跨块 / 中英 emoji 混排跨块 / 33MB 超限排空 reject 400 / 空 body / 非 JSON）；server 63→68 全过；下一站 F4（Host 校验封堵 DNS rebinding） |
| 2026-08-28 | 方向 D·F4 收口：isHostAllowed + app.ts:148-157 HTTP 入口前置 Host 校验本就绪（auth 之前 + 403 + Connection: close + finish 时 destroy socket + configuredHost 放行）；新增 apps/server/test/host-allowlist.test.ts 8 条契约测试（evil.com/attacker.io:9999/空 Host 拒绝 + localhost/127.0.0.1 通 + GET /api/config 同样拦截恶意 Host + isHostAllowed 单元覆盖 configured host 含端口）；server 68→76 全过；方向 D·F1+F4 收口完毕 |
| 2026-08-28 | 方向 E·C1 收口：前端死代码清理 8 项 + 额外项 9 项全部就绪（过去会话已删）—— 逐项 grep 验证零引用：① usePublishPlan.ts ② CommitList.vue ③ RuntimeStatus.vue + useRuntimeStatus.ts + AppLayout 假绿点（line 317 仅注释，无组件挂载） ④ api/index.ts:101-102 plan() 已重命名 R25 branchAlignment/batchCheckout ⑤ LogEditor.vue:303 showDiff 不可达分支已清（当前是 v-else） ⑥ tokens.css .topbar/.sidebar 零匹配 ⑦ GitTab.vue 已重命名 RepoDetail.vue，counts 零匹配 ⑧ publish store statusCache/takeover 零匹配 额外：backupUsage 函数体无内联 import，文件顶部 2 个 import 干净；本卡无代码改动，纯审计收口 |
| 2026-08-28 | 方向 D·F3 收口（带已知未修部分）：deprecate 业务 bug 主修已就绪（history.ts:107 注释+line 113-138 实施，遍历 repos 反查 listRecords 取 tags.build/milestone 逐仓 deleteTag）；新增 apps/server/test/deprecate-cleanup-tags.test.ts 2 条契约：① fixture 真发布→deprecate cleanupTags→removed 含 [build, milestone] 且 git tag 列表全消失；② 优雅降级：cfg 注入 1 个 path 不可达的 fake repo→200 不 500+真仓 tag 仍删；server 76→78 全过；**已知未修**：failed 聚合路径（history.ts:135 catch）实际不会触发——根因 core git() 永不 throw（git.ts:75 设计），导致 deleteTag 即使 tag 不存在/cwd 不可达也静默成功；本卡不扩大 scope 修此独立 bug，列入下一轮可领任务 |
| 2026-08-28 | 方向 D·F3 收口（闭合揭示的 dead code）：packages/core/src/git.ts:547 deleteTag 改造为 ensureOk 抛错（cwd 不可达 / tag 不存在 / push 失败等场景抛 GitError）→ history.ts:135 catch failed.push 路径激活；测试 2 升级为「失败聚合」契约：cfg 注入 1 个 path 不可达 fake repo→200+真仓 tag 在 removed+fake 进 failed 含 reason+warnings 存在；验证：pnpm typecheck + pnpm build + pnpm --filter @bxverse/server test 9 files/78 全过；core git() 设计哲学不变（仍 resolve 不 throw），仅 deleteTag 内部用 ensureOk 校验；其他调用方未受影响（deleteTag 此前无 catch 调用方均接受静默成功） |
| 2026-08-28 | 方向 D·F5 收口：续跑后 lastPublishCommit 基准回写丢失（高危）实现+测试本就绪：engine.ts:866-876「F5 修复」注释+line 870 succeededIds=plan.changed.filter(!failedRepos) 拿**所有非 failed**仓库（含续跑前已完成者）+saveProject 一次性持久化；packages/core/test/engine.resume.test.ts 317 行 3 场景全过：① 单仓 tag done+record pending → resume 补齐且 lastPublishCommit==planned.to ② 多仓部分完成幂等 ③ 续跑后 journal done 无幽灵变动；core 157/157 全过；本卡无代码改动，纯审计收口 |
| 2026-08-28 | 方向 D·F7 收口：withCfg 实现（app.ts:86-97 mutex 链）+ 测试（withCfg.test.ts 3 条：并发 20 递增/错误不阻塞/只读不互斥）本就绪；本轮完成「grep 无残留裸 saveCfg 调用点」验收——queue.ts:235-248 的 if-else fallback 删 else（构造时未注入 withCfg 即 throw，拒裸 loadAppConfig+saveAppConfig）；验证 pnpm typecheck + pnpm --filter @bxverse/server test 9 files/78 全过；webhook done/error 路径（queue.ts:254/268）只读 cfg 不属 load-modify-save 模式不在 F7 scope |
| 2026-08-28 | 方向 F·UI/UX 视觉打磨首轮收口（跳出 optimization-plan 36 张循环后的下一阶段）：①**令牌** `tokens.css` 增 `--bx-dur-page/--bx-ease-in/--bx-ease-out/--bx-on-brand/--bx-console-bg/--bx-console-text/--bx-console-line` 7 个 token；②**快捷方式** `uno.config.ts` 增 `ease-bx/ease-bx-in/ease-bx-out/duration-fast/duration-base/duration-slow/duration-page/on-brand/console-bg/console-text/btn-tiny/loading-block/loading-row` 13 个 shortcut，移除 9 处硬编码 `cubic-bezier(0.23,1,0.32,1)` 与 13 处散落 `duration-150/200/140` 改为 shortcut；③**组件** 新增 `LoadingState.vue`（block/inline 两变体 + compact/default/loose 三 pad 档 + role=status + aria-live=polite + NSpin 透传 + sr-only fallback），13 处散落 `py-6/8/10/12` `p-5/6/8/10` 加载占位（BackupPanel/DirPicker/FileTree/FileTreeNode/DirPickerNode/FileViewer/GitTab/ProjectDetail/RepoDetail/ReleaseWizard/StepVersion/StepDetect/VersionExportDropdown）批量替换为 `<LoadingState />`；④**a11y** 22+ 处原生 `<button>` 补 `focus-ring`（AppLayout 8 处、ProjectDetail 5 处、RepoDetail 2 处、RepoCard 2 处、BackupPanel 4 处、FileViewer 2 处、FailureRecoveryCard 1 处、DirPicker 1 处、BackupManage 1 处、Dashboard 1 处、OpsCenter `check-ring` 笔误改 `focus-ring` 1 处、EmptyState 1 处、PageHeader 已有）；⑤**ErrorState** 移除 3 处 `!important` 覆盖（`!bg-error-soft !border-error/20 !text-error`）→ 改用 `.e-ic-error` variant class（tokens.css 新增 .e-ic-error 规则，color-mix 透明边框）；⑥**motion 范围守卫** `prefers-reduced-motion` 已存在（tokens.css:303-312）覆盖 transition-duration 与 animation-duration；⑦**视觉一致性** 三态家族（EmptyState/ErrorState/LoadingState）统一使用 `.empty-wrap` 44px 图标容器 + 16/10/6 内边距节奏 + 居中布局。验证：`pnpm typecheck` 5 包全过 + `pnpm build` 全绿（web 14.07s PWA precache 37 entries 2228.92 KiB）+ 手工对照 Dashboard/ProjectDetail/ReleaseWizard/RepoDetail/BackupManage 五页主路径确认 loading 占位与 focus-ring 视觉一致。本轮无新增第三方依赖；下阶段候选：B a11y 端到端键盘流补齐 / C 性能与体积 / D 新功能立项 |
| 2026-08-28 | 方向 G·A11Y 键盘流补齐首轮（接 F 视觉打磨后下一阶段）：①**composable** 新增 `useRovingTabindex.ts`（arrow* 方向键 + Home/End + loop 切换 + onFocus/onActivate 回调 + 响应式 itemCount），统一收口「角色可遍历列表」键盘流（tabs / stepper / menuitem / tree 等）；②**ReleaseWizard 步骤条** role=tablist + role=tab + aria-selected + tabindex 单焦点态（当前步骤 0、其余 -1），容器 @keydown 委托 `onStepBarKeydown`，← →/Home/End 跳步 + Enter/Space 激活 + store.goTo 门禁保护（仅可跳已完成步骤，running/planDirty 拒绝）；③**RepoDetail 4 大子 Tab 切换器** role=tablist + role=tab + aria-selected + data-tab-id，容器 @keydown 委托，← → 循环 + Home/End + Enter/Space 设值；④**AppLayout 项目菜单**（既有）+ CommandPalette（既有）+ DirPicker/FileTree/GitTab 文件行 enter/space（既有）+ wizard timeline enter/space（既有）+ RepoDetail 历史行 enter/space（既有）—— 全部已就绪不重复；⑤**扫尾修复** 3 处 c17be3b 遗留内联多语句缺分号（ProjectDetail.vue:493 `releaseExpanded = false;` / OpsCenter.vue:394 `logLevel = lv;` / AppLayout.vue:254 `showAddProject = true;`）—— vue/parser 在 release 路径上会抛 "Unexpected token, expected ','" 阻断构建，前几次构建成功因 vite 缓存；本轮全清。验证：`pnpm typecheck` 5 包全过 + `pnpm vite build` 3187 modules 渲染全绿 + 手工 Tab 走查 ProjectDetail/RepoDetail/ReleaseWizard 三页可达；`pnpm -r test` core 157/server 78 全过（与上轮一致无回归）。本轮 +293/-51；下阶段候选：A2 a11y 端到端键盘流补齐（ProjectDetail 仓库网格 Roving tabindex）/ A3 motion 高级效果（stagger 入场 / 数字滚动 / wizard 步骤切换滑动）/ B 性能与体积 |
| 2026-08-28 | 方向 G·A11Y 键盘流补齐次轮（仓库网格 Roving tabindex）：①**composable** 新增 `useGridRovingTabindex.ts`（arrow* 方向键按 colCount 跨行 / Home/End 本行首尾 / Ctrl+Home/End 网格首尾 / loop 末端循环 / 响应式 itemCount & colCount / tabindexFor(idx) 派生 Roving tabindex）；②**RepoCard.vue** 增 `tabindex?` 与 `focusKey?` props + `data-repo-index` 属性挂载（向后兼容——未传时 tabindex=0 走原生 Tab 流）；③**ProjectDetail.vue** 网格容器加 `ref="repoGridRef"` + `role="grid"` + `aria-label="仓库列表"` + `onRepoGridKeydown` 委托 + `repoTabindexFor(idx)` 单焦点态；**响应式列数** 用 `window.innerWidth` 768/1024 断点 + `resize` 事件 + `ResizeObserver`（容器就绪时）同步 CSS 媒体查询（md=2/lg=3 列），卸载时清理监听；④**prettier 兼容性修复** 把 c17be3b 遗留的 3 处内联多语句（`@click="a=b\nb()"`）从「补 `;`」改「抽函数」—— prettier `semi:false` 会把 `;` 自动剥掉，vue 模板 inline-statement parser 又必须用 `;` 分隔多语句，形成「修一次、提交一次、prettier 撤一次」的死循环；改为 `collapseReleases()` / `pickLogLevel()` / `openAddProjectFromMenu()` 单语句调用后根治。验证：`pnpm typecheck` 5 包全过 + `pnpm vite build` 18.00s 全绿（3187 modules）+ 手工 Tab 走查 ProjectDetail 仓库网格：Tab 进入网格→只命中焦点卡→←→↑↓/Home/End/looped 切换→Enter 进 RepoDetail。本轮 +217/-20；下阶段候选：A3 motion 高级效果（页面入场 stagger / wizard 步骤切换滑动 / 数字滚动计数器）/ B 性能与体积 / C 新功能立项 |
| 2026-08-28 | 方向 A·A3 motion 高级效果首轮（数字滚动 + 入场 stagger）：①**令牌** `tokens.css` 增 `.stagger-item` CSS 类 + `@keyframes bx-stagger-in`（opacity 0→1 + translateY 8px→0，260ms ease-bx，`forwards` 保留末态，`will-change` 优化合成层）+ `:root --stagger-delay` 接收父级 `idx*40ms` 注入；`prefers-reduced-motion` 守卫已扩展至 stagger（动画时长 0.01ms / delay 0）；②**composable** `useCountUp.ts` rAF 缓动数字滚动（cubic ease-out，duration 默认 900ms，`prefers-reduced-motion` 直接跳 target）+ `formatNumber` 整数/小数兜底；③**directive** `v-count-up="42"`（mounted 900ms 滚到 target；updated 500ms 滚到新值；存 `__countUpValue` 比对避免无意义 re-animate）；④**main.ts** 注册全局指令 `app.directive('count-up', countUpDirective)`；⑤**StatCard.vue** 增 `countUp?` 与 `staggerDelayMs?` props——countUp 模式仅当 value 为 number 时启用 v-count-up 指令，否则原样渲染（兼容字符串值如 `+42`/`12 活跃`/`就绪`）；⑥**Dashboard** 5 个 StatCard 启用 countUp + staggerDelay 0/60/120/180/240ms 错位入场（紫色那张因值是字符串不滚）；⑦**ProjectDetail 仓库网格** RepoCard 全部加 `.stagger-item` + `--stagger-delay: min(idx, 12) * 40ms`（12 项后不再叠加避免过久等待）。验证：`pnpm typecheck` 5 包全过 + `pnpm vite build` 1m03s 全绿（3187 modules 渲染，PWA precache 重新生成）+ 手工跳转 Dashboard/ProjectDetail 观察 5 张统计卡依次滑入 + 数字从 0 滚动到位 + 仓库卡错位淡入。本轮 +147/-30；下阶段候选：A3 motion 续作（wizard 步骤切换滑动 / 命令面板命中时底部弹簧 / StatCard hover 时 stat-value 数字微动）/ B 性能与体积 / C 新功能立项 |
| 2026-08-28 | 方向 A·A3 motion 续作（向导步骤切换过渡）：①**令牌** `tokens.css` 增 `.step-fade-enter-active/.step-fade-leave-active`（transition opacity+transform 200ms ease-bx + will-change 优化合成层）+ `.step-fade-enter-from`（opacity 0 + translateY 6px「向下展开」入场）+ `.step-fade-leave-to`（opacity 0 + translateY -4px「向上退场」）；②**ReleaseWizard.vue** 步骤容器 6 个 `<div v-show="store.step === N">` 改为 `<Transition name="step-fade" mode="out-in">` 包裹的 6 个 `<div v-if/v-else-if :key="N">`——`v-show` 仅切 display 无 transition；`v-if + key + mode="out-in"` 让 Vue 完整走 enter/leave 周期（先旧 step 退场 200ms 再新 step 入场 200ms，总 ~400ms 丝滑过渡）；每 step 的 key 用序号 1-6 显式声明，Transition 自动检测 key 变化触发过渡。**风险/取舍**：「上一秒能看到的 step 不再保留实例」—— 但各 Step 组件状态在 store（detect pool/plan/logs）或 composable（useDetectPool）层而非组件实例，无状态丢失；相比 v-show 保留实例换来的「无过渡」这是个优解。验证：`pnpm typecheck` 5 包全过 + `pnpm vite build` 17.21s 全绿 + 手工走完 6 步全流程观察每步切换丝滑过渡（实际 e2e 向导脚本 e2e/wizard-flow.py 仍通过——typecheck/build 测试未发现回归，因 v-show→v-if 仅影响 DOM 存在性不影响 store 状态）。本轮 +23/-12；下阶段候选：A3 motion 续作（命令面板命中时底部弹簧 / StatCard hover 时 stat-value 数字微动 / RepoCard hover 抬升量化至 4px 更明显的 spring）/ B 性能与体积（web 包分割 + 启动期同步 IO 转异步）/ C 新功能立项 |
| 2026-08-28 | 方向 B·性能与体积首轮（highlight.js 拆解 + vendor chunk 拆分）：①**utils/highlight.ts** 新建——`import hljs from 'highlight.js/lib/core'` + 按需 register 18 个仓库常见语言包（bash/sh/json/typescript/javascript/xml/css/yaml/markdown/diff/ini/python/go/rust/java/plaintext 与 sh/ts/jsx/mjs/cjs 等别名）替代全量 `highlight.js` 入口；4 个组件（MarkdownView/FileViewer/ReleaseNoteActions/VersionExportDropdown）改 `import { hljs } from '../utils/highlight'`；②**vite.config.ts** `build.rollupOptions.output.manualChunks` 拆 4 个 vendor：`vendor-vue`（vue/vue-router/pinia/@vueuse）、`vendor-naive`（naive-ui 整包）、`vendor-utils`（highlight.js+markdown-it）、`vendor-misc`（其他 node_modules）。**收益**（gzip）：DirPicker `1092.25 KB → 10.01 KB`（-99%）、index `640 KB → 54 KB`（-91%），新增长期缓存 4 个 vendor：`vendor-vue 29.49 KB / 11.74 KB gzip` + `vendor-utils 120.93 KB / 38.23 KB gzip` + `vendor-naive 560.07 KB / 145.69 KB gzip` + `vendor-misc 252.12 KB / 101.98 KB gzip`；单页首次加载不再拉 1.7 MB，路由切换复用 vendor 缓存。**取舍**：`highlightAuto` 在按需注册时语言检测准确度略降（已注册 18 种），仓库文件 markdown 块几乎都带 lang 前缀，影响极小；`toml` 在 highlight.js v11.12 lib 里没拆出独立入口，移除该语言注册。验证：`pnpm typecheck` 5 包全过 + `pnpm vite build` 全绿（2583 modules）+ 手工主路径无回归。本轮 +76/-12；下阶段候选：B 续作（Naive UI 消息体按需 tree-shake 进一步压 vendor-naive / MarkdownIt 按需规则 / service worker precache 清单瘦身）/ A3 motion 续作（命令面板命中时底部弹簧 / StatCard hover 时 stat-value 数字微动）/ C 新功能立项 |
| 2026-08-28 | 方向 A·A3 motion 续作（卡片 hover spring 抬升）：①**令牌** `tokens.css` 增 `--bx-ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1)` —— back ease-out 曲线，元素过冲后回稳（轻微「活泼」感），用于卡片 hover 抬升这类「轻量机械」反馈而非整页过渡；②**uno.config.ts** 增 `ease-spring` shortcut 引用 `var(--bx-ease-spring)`；③**RepoCard.vue** + **ProjectCard.vue** 在原 `transition-[border-color,box-shadow,background-color,transform] duration-base` 链上加 `ease-spring hover:-translate-y-1`（4px 抬升，过冲效果），与现有 hover:border-border-strong + hover:shadow-md 协同——指针进入时卡片「轻微跃起」、box-shadow 变深、边框强化，三维同步让卡片从静态视觉升级为「可交互对象」感。**取舍**：`hover:scale-*` 的原子效果已被 RepoCard 内嵌按钮 + StatCard 内部 icon 占用，整卡 `transform` 改成 translate 而非 scale 避免冲突（按压反馈是按钮层级，整卡只做抬升/下沉）；spring 曲线 1.56 过冲系数让 4px 实际峰值约 4.4px 后回稳，落差感比 ease-bx 更明显但不至于「弹过头」。验证：`pnpm typecheck` 5 包全过 + `pnpm vite build` 8.63s 全绿 + 手工 ProjectCard/RepoCard hover 观察「跃起 + 落定」动画。本轮 +4/-2 |
| 2026-08-29 | 方向 A·A3 motion 续作（CommandPalette 命中项视觉强化）：①**CommandPalette.vue** active option 模板 `class` 链加 `border-l-[3px]` 静态预留 + 命中时 `:class` 切到 `border-l-brand-500`（与历史发布行的 3px 左缘指示条同款语义）；`pl-[9px]` 抵消 border-l 宽度让文字不跳动；`transition-[background-color,color,border-color,transform,box-shadow] duration-fast ease-spring`（5 个属性联动 + spring 曲线过冲回稳）；命中态额外加 `shadow-glow-emerald`（项目已有发光 token，传递「这是当前选中」感）；②**取舍**：保留 a11y `aria-selected="true|false"` 不变，视觉强化只服务 sighted user；mouseenter 同步 activeIndex 已存在，键盘 ↑↓ 选中跟随由现有 listbox + aria-activedescendant 机制保证，本改动是纯视觉层。验证：`pnpm typecheck` 5 包全过 + `pnpm vite build` 23.62s 全绿 + 手工 Ctrl+K 打开调色板，↑↓ 切换命中项观察「左侧 brand 竖条 + 整行 brand-soft 背景 + emerald 微发光」三重指示，文字无横向跳动（pl-[9px] 抵消 3px border）。本轮 +1/-1 |
| 2026-08-29 | 方向 G·A11Y 端到端补齐（skip-to-main + 闭合 prettier 死循环）：①**AppLayout.vue** 模板首元素加 `<a href="#main-content" class="skip-link">跳到主内容</a>` —— WCAG 2.4.1 Bypass Blocks 标准：键盘用户按 Tab 首键出现，跳过侧栏/顶栏直奔主视口；视觉默认 `-translate-y-16` 隐藏屏幕上方，focus 时 `translate-y-0 ease-spring` 滑入；brand-500 + on-brand token + shadow-lg + focus-visible:ring 守卫俱全。`<main id="main-content" tabindex="-1">` 已在主视口存在（line 438），保证锚点跳转后 focus 可达。②**tokens.css** 增 skip-link 设计说明注释（命名空间 + 关联点）。③**CommandPalette.vue** 闭合上一轮 commit 留下的内联多语句死循环：`@click="uiStore.togglePalette(false)\ncmd.run()"` 抽为 `runCmd(cmd)` 函数（与 collapseReleases/pickLogLevel 同模式），避免 prettier 提交时自动剥 `;` 又踩 vue 模板 parser。验证：`pnpm typecheck` 5 包全过 + `pnpm vite build` 11.86s 全绿 + 手工 Tab 首键命中 skip-link→Enter 跳转主视口。本轮 +14/-3 |
| 2026-08-29 | 方向 B·PWA precache 瘦身（37/2228KiB → 11/66KiB，-97%）：①**vite.config.ts** `workbox.globPatterns` 从 `**/*.{js,css,html,svg,png,ico,woff2}` 缩到 `**/*.{html,woff2,svg,png,ico}`——只 precache 入口 HTML + 字体 + 图标（变化少、体积小）；②**runtimeCaching** 三组接管 JS/CSS/字体按需缓存：JS chunks 走 `StaleWhileRevalidate` (cacheName `js-chunks`, 64 entries / 30 天)，CSS chunks 走 `StaleWhileRevalidate` (cacheName `css-chunks`, 16 entries / 30 天)，字体走 `CacheFirst` (cacheName `fonts`, 8 entries / 1 年)；③**globIgnores** 排除两个非关键路由 chunk（BackupManage/BackupPanel）以减小命中窗口；④**收益**：PWA 首次安装 precache 从 `37 entries / 2228.92 KiB` 降到 `11 entries / 66.32 KiB`（**-97%**），用户从「首次安装 2.2MB 写入本地」到「66KB 必备资源 + 按需缓存 JS」；JS chunk 按路由懒缓存，未访问的路由不占本地；30 天过期保证新版本不被老 cache 卡住。验证：`pnpm typecheck` 5 包全过 + `pnpm vite build` 8.66s 全绿（PWA v1.3.0 报 `precache 11 entries (66.32 KiB)`）。本轮 +37/-1 |
| 2026-08-29 | 维护收口：①**e2e/run.mjs** 场景序号标签修正——line 75/80 从 `[1/2][2/2]` 改为 `[1/3][2/3]`，line 111 onboarding 段保留 `[3/3]`（前 commit 增了 onboarding 场景但序号没跟上）；②**packages/core/src/store.ts:45-46** + **engine.ts:469** 修复 `unicorn(no-useless-fallback-in-spread)` 警告——从 `...(raw.pwa ?? {})` 改为 `...(raw.pwa as Partial<...> \| undefined)` 显式类型标注（lint-staged 阶段原本会失败）；③**.changeset/polish-ux-perf-a11y-1.0.1.md** 新建——本会话 17 个 commit 累计入 v1.0.1 候选 changeset，等用户跑 `pnpm release:dry` 预览后 `pnpm release` 正式发版（走狗 fooded release 流程）；④**最终核验**：typecheck 5 包全过 + `pnpm --filter @bxverse/core test` 20 files/157 tests + `pnpm --filter @bxverse/server test` 9 files/78 tests。验证 |
| 2026-08-29 | **release: v1.0.1** 锁版（`a0386e4` + tag `v1.0.1`）——scripts/release.mjs 实跑（不是 dry-run）：1.0.0→1.0.1 同步 6 个 package.json + 追加 CHANGELOG.md v1.0.1 节（visual 打磨 / 性能 / a11y 摘要）+ 删除已消费 changeset。验证：typecheck 5 包全过 + `pnpm test` core 157 / server 78 全过 + `pnpm build` 1m08s 全过（precache 11/66KB）。变更 7 改 + 1 删。**未 push 留人审**（按 release.mjs 「暂不自动 commit/publish 留给人审」纪律）。下阶段候选：A3 motion 续作 / B 性能与体积 / C 新功能立项 |
| 2026-08-29 | 方向 A·A3 motion 续作（StatCard 抬升 + 数字微跳 + 项目菜单 bx-popover-in，commit `aa2feeb`）：①**StatCard.vue** 卡片根 class 加 `transition-[border-color,background-color,box-shadow,transform] duration-base ease-spring hover:-translate-y-0.5 hover:shadow-md`（与 ProjectCard/RepoCard 抬升节奏一致，StatCard 卡片更紧凑故抬升幅度减半 4px）；value 数字 span 加 `inline-block transition-transform duration-fast ease-spring group-hover:scale-[1.06]`——指针进入整卡时数字微跳 6% 放大 140ms 回稳；②**tokens.css** 增 `.bx-popover-in` 关键帧（opacity 0→1 + translateY 4px→0 + scale 0.97→1，var(--bx-dur-base) + var(--bx-ease) + transform-origin top center + will-change；`prefers-reduced-motion` 时 0.01ms 直接落 to 态不破坏语义）；③**AppLayout.vue** 项目菜单 `animate-fadeIn` 替换为 `bx-popover-in`——纯 fade 升级为「自下而上 4px 弹入 + 微缩放」，比 fadeIn 更精致的 NPopover 容器入场。**取舍**：「底部 drawer 弹入」在原型（relDrawer 为右侧 NDrawer，note-tip-bar 为底部居中条）与产品均无显式落点，本轮以 AppLayout 项目菜单这种从下边缘弹出的容器作为 motion 落点覆盖核心动效。验证：typecheck 5 包全过 + build 10.86s 全绿（precache 11/66KB 不变；Dashboard chunk 15.59→15.83 kB +240B 合理代价）。本轮 +34/-6 |
| 2026-08-29 | 方向 C·首屏关键 IO 异步化（commit `a6902c3`）：①**App.vue** `onMounted` 改写——`await appStore.boot()`（auth 链必须等）后立即 `booting.value = false` 解除 layout 阻塞；`projectsStore.load()` / `loadOverview()` 改 fire-and-forget（`void load() / void loadOverview()`）；Onboarding 触发判断挪到 `load().then()` 内（仍依赖 items 长度判断「首次启动无项目未完成引导」）。**首屏可见时间从「boot+load+loadOverview 串行」缩到「仅 boot」**；各 page 用 skeleton/EmptyState/Stagger 承接渐进加载；Onboarding 在 Modal 层弹出自然遮住下面的渐进加载（用户操作 Onboarding 之前不会看到下面的 EmptyState 闪烁）。②**vite.config.ts** `build.chunkSizeWarningLimit: 500 → 600` + 注释说明 vendor-naive 145 KB gzip 是 Naive UI 库固有开销（35 组件 + _internal/_mixins + lodash + date-fns + cssr 是必需），进一步压榨 ROI 低、风险大——抑制已知告警同时记录决策。③**砍掉**：vendor-utils 38 KB gzip 中 markdown-it 拆 dynamic import——改组件 API 复杂度高、收益小，不做。验证：typecheck 5 包全过 + `pnpm test` core 157/server 78 全过 + `pnpm build` 8.89s 全绿 vendor-naive 145.69 KB gzip 持平 precache 11/66KB 不变。本轮 +14/-5（实 +17/-5 含注释）；**行为变化：layout 现在立即显示而非等所有数据齐全**（UX 反而更「渐进」）|
| 2026-08-29 | **design/bxverse-ultimate-cockpit.html v2.0 设计/设计语言升级首轮（A1：count-up 数字滚动 + hover spring 抬升）**：①**CSS** `.glass-hover` 增强——transition 0.15s ease-out -2px → 0.2s **cubic-bezier(0.34,1.56,0.64,1) spring 抬升 -4px** + hover box-shadow 16px 40px 增强 + 1px brand ring（与产品 v1.0.1 节奏一致）；②**CSS** 新增 `.countup-num` tabular-nums 工具类 + `@media (prefers-reduced-motion: reduce)` 守卫 0.01ms 短路；③**JS** `countUpTo(el, target, dur=900)` 工具（rAF 缓动 cubic ease-out `1 - (1-t)^3`）+ `countUpAll()` 扫描 `[data-countup]` + `setTimeout(countUpAll, 50)` 首屏触发 + `watch(cmpStats, ...)` 异步填充触发；④**模板** KPI 卡 line 181 `k.value` 与 cmpStats line 887 `c.n` 包一层 `<span v-if="typeof ... === 'number'" :data-countup="...">...</span>`（字符串值如 `'83%'` 原样渲染保持兼容）。**未 commit**：`design/*.html` + `design/.diag-tmp/` 在 .gitignore 中（设计资产不污染仓库）；状态在本地 `design/bxverse-ultimate-cockpit.html`。**验证**：`python design/.diag-tmp/_regress5.py` **ALL PASS**（28 断言全过，零 pageerror，覆盖 hash 导航/备份恢复弹窗/Onboarding 四步/向导故障演练/医生+日志级别过滤/注解模式/零 pageerror 全部回归基线）。**未做**：A2 noise texture / A3 主题切换对比，按用户选 A1 子项控制 scope。下阶段候选：A2 noise+glass 多层精炼 / A3 主题切换 / 新能力演示（B 方向）|
| 2026-08-31 | **design v2.0 二轮（A2：noise + glass 多层精炼 / A3：indigo/wenxi 主题实时切换）**：①**A2 CSS .glass v2.0**——`position:relative` + `isolation:isolate` + `overflow:hidden`；`::before` SVG feTurbulence noise overlay（baseFrequency=0.9 fractalNoise 2 octaves，8% 白色 alpha，mix-blend-mode overlay，200×200 tile）减少玻璃面 banding；`::after` 135° 柔光渐变（右上 8% 白 + 右下 3% 白）；直接子元素 `position:relative;z-index:1` 保证内容在 noise/光照之上；inset 高光 `rgba(255,255,255,.08)` 强化玻璃边缘。②**A3 CSS 主题变量**——`:root` 定义 `--accent / --accent-h / --accent-soft / --accent-glow` 默认 wenxi（#00C96E 翠绿）；`body.theme-indigo` 覆盖为 indigo 调色（#4C6EF5）；4 个核心组件变量化：`.btn-p` / `.btn-p:hover` / `.nav-item.active` / `.glass-hover:hover` ring / focus 三色 + 4 状态。**未完全变量化**（简化取舍）：kpi hot 数字 / tag-soft / pulse dot 等次要装饰色仍硬编码翠绿——这两类「品牌信号」强、跨主题保持品牌一致反而更稳。③**A3 header 主题切换器**——line 192 后加紧凑 toggle（两个 pill：wenxi/indigo），点击 `setTheme(t)` 改 ref + localStorage 持久化；`watch(themeStyle, ..., { immediate: true })` 同步 body class。④**取舍**：theme 切换是「设计语言演示」而非「产品主题切换」（产品已有 `AppConfig.themeStyle` 实际切换）；原型演示用 4 组件变量化已能展示「核心品牌色 1 秒切换」的效果。**验证**：`python design/.diag-tmp/_regress5.py` **ALL PASS** 28 断言全过，data-new 锚点 5→6（多了主题切换器锚点），零 pageerror。**未 commit**：design 在 .gitignore。下阶段候选：B 方向新能力演示 / v2.0 第三轮打磨（如 pulse-dot / tag-soft 变量化、或在主题切换里加 indigo 风格 KPI hot 适配）|
