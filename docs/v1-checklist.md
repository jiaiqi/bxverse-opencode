# bxverse v1.0 验收清单

> **v1.0 是首次 major 跨版本（v0.1.0 → v1.0.0）**，意味着 API 契约与产品行为稳定。
> 本清单是 v1.0.0 tag 之前的硬性质量门禁，**全部 ✅ 才能打 tag**。

> 创建日期：2026-08-27
> 打 tag 前最后核查时间：见 git log。

---

## 1. 质量门禁（自动化）

| 门禁 | 命令 | 期望结果 | 实际 |
|---|---|---|---|
| TypeScript 严格模式 | `pnpm typecheck` | 全 0 error | ✅ 19 文件 0 error |
| 全链构建 | `pnpm build` | shared → core → server → cli → web 顺序成功；web 出 PWA assets | ✅ |
| Core 单测 | `pnpm --filter @bxverse/core test` | 全 pass | ✅ 19 文件 145 测试 |
| e2e 三场景 | `pnpm test:e2e` | resume / wizard / onboarding 全过 | ✅ |

## 2. 功能门禁（R1-R30 + M1-M8）

> 见 `docs/roadmap.md` §0 状态总表。Phase 1 三件欠账（M5-08/M7/M8）+ Phase 2 主力段 5 段 + Phase 3 自举分发 3 段全部 ✅。

| Phase | 内容 | 状态 |
|---|---|---|
| Phase 1 | M5-08 首次引导 / M7 备份恢复 / M8 看板与治理中枢 | ✅ |
| Phase 2 序号 1 | doctor 内核 core 化 | ✅ |
| Phase 2 序号 2 | 发布失败结构化恢复（后端+UI） | ✅ |
| Phase 2 序号 3 | 运维中心 OpsCenter（4 卡：巡检/迁移/日志流/关于） | ✅ |
| Phase 2 序号 4 | 驾驶舱增强（8 周 sparkline + 分支巡检入口） | ✅ |
| Phase 2 序号 5 | 命令面板 fuzzy 匹配 + WIG a11y 收口 | ✅ |
| Phase 3 序号 1 | 自举 changeset + dogfooding 闭环 | ✅ |
| Phase 3 序号 2 | cli watchdog + update 子命令 | ✅ |
| Phase 3 序号 3 | README + development.md 发版文档化 | ✅ |

## 3. 契约与依赖门禁

| 项 | 期望 |
|---|---|
| `packages/shared/src/types.ts` | **只增不改**（所有扩展字段标注 `// 扩展：` + 原因） |
| `packages/shared/src/constants.ts` | 不改（`APP_DATA_DIR_NAME='.bxverse'` 等定稿常量冻结） |
| core/server 第三方运行时依赖 | **零新增**（`dependencies` 仅 `@bxverse/shared` 与 `@bxverse/core`） |
| web 依赖新增 | 按文档锁定技术栈（vue/naive-ui/pinia/vue-router/vite-plugin-pwa/uno/carbon-icons） |
| 业务仓库侵入 | **零侵入**（不 commit/amend/force-push；只打标签/写 version.json） |

## 4. 文档门禁

| 文档 | 状态 |
|---|---|
| `docs/requirements.md` R1-R30 | 全部落地（含 R26/R27/R28/R29/R30 + M5-08/M7/M8/M11/M12/M13/M14） |
| `docs/roadmap.md` §0 状态总表 | M1-M8 全部 ✅（无 🟡/🔄/—） |
| `docs/architecture.md` | 进程模型/路由表/安全/§7 文件级蓝图 |
| `docs/data-model.md` | 数据模型/存储/app.json/records/journal/version.json |
| `docs/core-engine.md` | 引擎细节（R26 repo-policy 等） |
| `docs/api.md` | 端点总览（含 M11/M12/M13 新增端点） |
| `docs/frontend.md` | 页面/组件/状态/§4 组件清单/§12 WIG |
| `docs/development.md` | §11 自举 release 协议 |
| `docs/r26-build-pipeline.md` | R26 权威方案 + §7.1 无工程化适配 |
| `docs/theme-spec-wenxi.md` | WenXi 主题规范 |
| `docs/optimization-plan.md` | Wave 任务卡库 |
| `docs/next-development-plan.md` | Phase 1-3 全部 ✅ 销项 |
| `README.md` | 含「bx-manager（CLI 薄壳）」+「自举 release」两节 |
| `.changeset/README.md` | 自举 changeset 协议 |
| `AGENTS.md` | 文档索引表同步 |

## 5. CI / 验证脚本门禁

| 项 | 期望 |
|---|---|
| 根 `package.json` scripts | `dev/build/typecheck/test/lint/format/seed/doctor/icons/release/release:dry/test:e2e` 全部就绪 |
| `e2e/run.mjs` 编排 | 三场景顺序跑通（中断续跑 → 向导 → 引导） |
| `e2e/onboarding.py` | M5-08 自动弹出 + 四步流转 + 重看入口 |
| `e2e/wizard-flow.py` | 步骤 1-7 全过（含恢复演练） |
| `e2e/resume.mjs` | 跨进程 kill → 重启 → 幂等续跑不重复打标签 |
| `scripts/doctor.mjs` | 调 core/doctor；CLI 端与系统健康页同源 |
| `scripts/release.mjs` | 零依赖；扫 `.changeset/*.md` → bump 6 个 package.json + 写 CHANGELOG |

## 6. 设计门禁

| 项 | 状态 |
|---|---|
| 主原型 | `design/bxverse-ultimate-cockpit.html` —— 终极形态交互原型（Vue3+Tailwind 单文件） |
| 原型回归 | Playwright 28+ 断言全绿，零 pageerror |
| 旧稿归档 | `design/_archive/`（v2 三代、ultimate-state 增量已合并） |
| 文档归档 | `docs/_archive/`（旧 redevelopment-requirements） |

## 7. 仓库卫生门禁

| 项 | 期望 |
|---|---|
| `git status` | 工作树干净或只剩本轮提交 |
| `design/.diag-tmp/` | 仅存临时探针，**不进 commit**（已 .gitignore 或自查） |
| `__pycache__` / `node_modules` / `dist` | .gitignore 覆盖 |
| `.changeset/*.md` | 已消费的已删除；v1.0.0 的 changeset 保留直到本轮 release |

## 8. v1.0 标签与发布

| 项 | 操作 |
|---|---|
| 打 tag | `git tag -a v1.0.0 -m "release: v1.0.0 (首次 major)"` |
| push tag | `git push origin v1.0.0`（**需用户显式确认**，默认不 push） |
| npm publish | **不执行**（v1.0.0 仅本地 + 文档化） |
| CHANGELOG | `scripts/release.mjs` 自动追加 v1.0.0 段（major） |

---

**v1.0 承诺**：API 契约稳定；不再「仅增字段可加」，**`shared/types.ts` 与 `shared/constants.ts` 双冻结**；后续走 `1.x` 维护更新路径。
