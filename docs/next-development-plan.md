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
