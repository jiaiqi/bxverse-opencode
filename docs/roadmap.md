# bxverse 开发路线图（Roadmap）

## 0. 当前状态（持续更新）

| 里程碑 / 需求 | 状态 | 完成时间 |
|---|---|---|
| M1 核心引擎 | ✅ 完成（49 测试） | 2026-08-13 |
| M2 服务端 + CLI | ✅ 完成（22 测试） | 2026-08-13 |
| M3 前端三页 | ✅ 完成（Playwright 端到端） | 2026-08-13 |
| R18 版本清单导出（下载/写仓库/本地目录） | ✅ 完成 | 2026-08-13 |
| M4 发布向导六步 + 双轨日志编辑器 + SSE 控制台 + 前端轮询刷新 | ✅ 完成（向导 e2e + 中断续跑演练通过） | 2026-08-13 |
| WIG 整改 + 四项目借鉴（realpath 加固 / RuntimeStatus / 提交级排除 / seed+icons 脚本） | ✅ 完成 | 2026-08-13 |
| M5 自动化 / PWA 运行时启用 / AI / 收尾 | 🟡 部分完成（M5-01 PWA 运行时注册 ✅；AI/引导/兼容回归待做） | 2026-08-13 |
| M6 版本一致性对比与发布备份（R19） | ✅ 完成（core 单测 + API E2E 全通过） | 2026-08-13 |
| M7 备份恢复（R19 低优先级，远期） | ⏸ 暂缓 | — |

---

> 文档版本：v0.1（2026-08-13）
> 依据：`docs/requirements.md`（唯一需求依据）、`docs/architecture.md`（§7 文件清单）、`packages/shared/src/types.ts` 与 `constants.ts`（定稿契约）、根 `package.json` 与 `pnpm-workspace.yaml`。
> 读者：开发 agent、任务拆分与排期。
>
> **设计文档状态（依赖待补声明）**：`architecture.md` 已定稿；`data-model.md`、`api.md`、`core-engine.md`、`frontend.md`、`development.md` 为并行任务产物，撰写时尚未到位。本路线图中引用它们的位置以「依赖待补」标注；各文档到位后，**M1 启动前须做一次一致性核对**（核对基准永远为 requirements.md + shared/types.ts + architecture.md，冲突时以 requirements.md 为准）。

---

## 1. 里程碑总览

| 里程碑 | 名称 | 核心产出 | 预估人日 | 出口 |
|---|---|---|---|---|
| M1 | 核心引擎 | @bxverse/core 全部模块 + 单测 | ~28 | core 可被 server 调用，零第三方运行时依赖 |
| M2 | 服务端 | @bxverse/server 全部路由 + SSE + 队列 + CLI 薄壳 | ~20 | §3.2 路由 curl 全量验证通过 |
| M3 | 前端三页 | web 脚手架 + Dashboard/Projects/History | ~17 | 三页对真实数据闭环可用 |
| M4 | 发布向导 + 日志编辑 | 六步向导、双轨日志编辑、设置页、命令面板 | ~16 | fixture 仓库全流程发布通过 |
| M5 | 自动化/PWA/AI/收尾 | PWA 开关、AI 润色、初始数据、边界回归、文档 | ~12 | 生产形态交付、根三条命令全绿 |
| M6 | 备份与一致性对比（R19） | 源码/产物自动备份、哈希清单、三层对比、备份管理页 | ~10 | fixture 全流程发布含备份 + 两次发布对比通过 |
| M7 | 备份恢复（低优先级） | bundle 克隆恢复、产物解包到指定目录、恢复向导 | ~4 | 暂缓：M6 交付后再排期 |
| M8 | 多项目看板与仓库治理 | 项目看板、本地路径/Git克隆双模式接入、产物目录与构建命令配置 | ~6 | 看板与双模式接入闭环 |

合计约 107 人日（未计并行文档任务；M6 为 R19 新增，M7 暂缓不计入当前排期）。

### 1.1 里程碑依赖图

```
┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌─────────────────┐   ┌──────────────┐
│ M1 核心引擎   │──►│ M2 服务端     │──►│ M3 前端三页   │──►│ M4 发布向导   │──►│ M5 自动化/PWA/  │──►│ M6 备份与    │
│  packages/core│   │  apps/server  │   │  apps/web    │   │  +日志编辑     │   │  AI/收尾        │   │  一致性对比   │
│              │   │  apps/cli     │   │              │   │              │   │                 │   │  (R19)      │
└──────────────┘   └──────┬───────┘   └──────┬───────┘   └──────┬───────┘   └─────────────────┘   └──────┬───────┘
                          │                  │                  │                                        │
                          │   M3 依赖 M2（REST/SSE 契约）；M4 依赖 M3（页面/组件/store）与 M2               │
                          │   M5 依赖 M4（全流程可跑后才做自动化收尾）                                     │
                          │   M6 依赖 M4/M5（发布主流程与轮询就绪后挂接备份步骤）；M7（恢复）暂缓独立排期 ◄─┘

并行通道：docs/data-model.md、api.md、core-engine.md、frontend.md、development.md
          （与 M1–M4 并行撰写，M1 出口前须完成与 data-model.md 的一致性核对）
```

- 硬依赖：`M1 → M2 → M3 → M4 → M5 → M6` 串行主线；M3 与 M4 都依赖 M2，M4 另依赖 M3 的组件与 store；M6 依赖 M4 的发布引擎挂接点与 M5 的自动化收尾；M7（备份恢复）低优先级，M6 出口后单独排期。
- 软依赖：M5-02（AI）依赖 M1-26 已建、M4-05 已建；M5-03（初始数据）依赖 M3-10 与 M2-17。
- 里程碑入口软性（依赖就绪即可启动），出口硬性（见各节「出口定义」，不达标不得进入下一里程碑）。

---

## 2. M1 核心引擎（@bxverse/core）

### 2.1 目标与范围

- **目标**：落地 architecture.md §7 中 `packages/core/` 全部 `[待建]` 模块：git 封装、版本计算、日志流水线、发布编排（plan/engine/preflight/journal）、存储（config/records/dataRepo/credentials）、轮询检测、可选 AI 客户端；导出稳定的公共 API 面供 server 调用。
- **在范围内**：零第三方运行时依赖（仅 Node 内置 + `child_process.spawn('git')`）；依赖 `@bxverse/shared` 类型；vitest 单测（临时 git fixture 仓库）。
- **不在范围内**：任何 HTTP/Web/UI；对业务仓库的自动 commit/amend/force-push（永不做）；SSE 与队列（属 M2）；直接操作 6 个真实工程（仅 fixture 仓库测试，真实工程入 M5-03）。

### 2.2 任务清单

> 文件路径均相对 `G:\vibecoding\`；「依赖」列为任务编号，空表示无。

| 编号 | 标题 | 涉及文件 | 输入 → 输出 | 依赖 | 人日 |
|---|---|---|---|---|---|
| M1-01 | core 包脚手架 | `packages/core/package.json`、`tsconfig.json`、`tsup.config.ts`、`.gitignore` | shared 已构建 → 空包可 `build`/`typecheck`，`dependencies` 仅 `@bxverse/shared` | — | 0.5 |
| M1-02 | 家目录解析 | `packages/core/src/home.ts` | `BX_HOME` 环境变量、`constants.APP_DATA_DIR_NAME` → `resolveHome()` 返回 `{root,dataDir,reposDir,journalDir,logsDir,tmpDir}` 并确保目录存在 | M1-01 | 0.5 |
| M1-03 | git 客户端封装 | `packages/core/src/git/client.ts` | repoPath + 参数数组 → `runGit(repo, args, opts)`：`spawn('git')` 数组参数（绝不拼接 shell 字符串）、超时、错误归一为 `GitError{code,stderr}` | M1-01 | 1 |
| M1-04 | 仓库状态 | `packages/core/src/git/status.ts` | repoPath → `RepoStatus`（branch/head/dirty/hasRemote/remoteUrl/versionFile/buildTags/milestoneTag/lastPublishCommit） | M1-03 | 1 |
| M1-05 | 提交解析 | `packages/core/src/git/commits.ts` | repoPath、range（`lastPublishCommit..HEAD`）、pathspec → `CommitInfo[]`/`Stats`/`DiffStat`（conventional commit 解析 type/scope/breaking，`--no-renames` 控制耗时） | M1-03 | 1.5 |
| M1-06 | 标签操作 | `packages/core/src/git/tags.ts` | repoPath、tagName、commit → `listTags()`/`createTagIfAbsent()`（幂等：同名同 commit 跳过）/`getMilestoneTag()` | M1-03 | 1 |
| M1-07 | 仓库接入/克隆 | `packages/core/src/git/clone.ts` | 本地 path（校验 `.git`）或 `CloneRequest`（https/ssh 白名单）→ `validateLocalRepo()`/`cloneRepo()` 落到 `~/.bxverse/repos/{projectId}/` | M1-03 | 1 |
| M1-08 | 文件树 | `packages/core/src/git/files.ts` | repoPath、dirPath → `TreeNode`/`FileEntry`/`FileContent`（`DEFAULT_IGNORE_DIRS`、上限截断置 `truncated`、二进制检测、`..` 逃逸校验） | M1-03 | 1 |
| M1-09 | 版本解析 | `packages/core/src/version/parse.ts` | 字符串 → 用 `SEMVER_RE`/`HYBRID_VERSION_RE` 校验并拆解（vX.Y.Z / vX.Y.Z.YYMMDDHH / vYYMMDDHH） | M1-01 | 0.5 |
| M1-10 | bump 推断 | `packages/core/src/version/bump.ts` | `CommitInfo[]`、当前版本、`ProjectDef.bump` → `suggestedBump`（breaking→major / feat→minor / fix→patch；manual→patch；无变动→null） | M1-09 | 0.5 |
| M1-11 | buildStamp 生成 | `packages/core/src/version/stamp.ts` | Date、现有 build 标签列表 → `buildStamp`（YYMMDDHH）+ 撞名追加序号 | M1-09 | 0.5 |
| M1-12 | 版本计算 | `packages/core/src/version/index.ts` | projectVersion、buildStamp、`repoVersionScheme` → 仓库版本（hybrid=`vX.Y.Z.YYMMDDHH` / timestamp=`vYYMMDDHH` / semver 直传） | M1-09/10/11 | 0.5 |
| M1-13 | 对内日志模板 | `packages/core/src/logs/internal.ts` | 版本、提交、统计、影响文件 → `internalDraft`（全量：提交明细+文件清单+统计，信息不裁剪） | M1-05 | 1 |
| M1-14 | 对外日志模板 | `packages/core/src/logs/external.ts` | 提交、`externalExclude`、`EXTERNAL_SECTIONS` → `externalDraft`（分节、过滤、用户可感知措辞） | M1-05 | 1 |
| M1-15 | 日志 diff | `packages/core/src/logs/diff.ts` | `autoDraft`、`content` → 行级 LCS diff（供前端 `DiffView` 渲染） | M1-13/14 | 0.5 |
| M1-16 | 日志流水线 | `packages/core/src/logs/index.ts` | commits、配置 → `generateLogs()/editLog()/confirmLog()` 状态机 `auto→edited→confirmed`（产出 `ReleaseLog{state,content,autoDraft}`） | M1-13/14/15 | 0.5 |
| M1-17 | 配置存储 | `packages/core/src/store/config.ts` | home、默认值 → `readConfig()/writeConfig()`（`app.json` tmp+rename 原子写；缺失时写默认 `AppConfig`，默认 port=`APP_DEFAULT_PORT`） | M1-02 | 1 |
| M1-18 | 凭据存储 | `packages/core/src/store/credentials.ts` | home → `getOrCreateToken()/rotateToken()`（`crypto.randomBytes(32)`、0600 权限、`timingSafeEqual` 比对入口） | M1-02 | 0.5 |
| M1-19 | 数据仓库 | `packages/core/src/store/dataRepo.ts` | dataDir、remote 配置 → `ensureDataRepo()`（git init + .gitignore + 首次 commit）/`commitData()`/`pullData()`（`--ff-only`）/`pushData()`（失败仅警告） | M1-03 | 1.5 |
| M1-20 | 发布记录存储 | `packages/core/src/store/records.ts` | `ReleaseRecord`、releases 目录 → `writeRelease()/readRelease()/listReleases()`（`releases/{scopeId}/{versionSafeName}/` 三文件 + `index.json` 更新，落盘后不可变） | M1-03 | 1.5 |
| M1-21 | 轮询检测 | `packages/core/src/detect/poll.ts` | `ProjectDef[]`、`pollInterval` → `RepoStatus` 缓存（TTL=pollInterval；`changed = commits>0 || dirty>0`） | M1-04/05 | 1 |
| M1-22 | 发布预检 | `packages/core/src/publish/preflight.ts` | `PlannedRepo[]`、仓库状态 → 阻断项清单（architecture §6.2 全表：路径/.git/detached/dirty/lastPublishCommit 可达性/milestone 冲突/build 撞名/远程降级） | M1-03/06 | 1 |
| M1-23 | 发布计划 | `packages/core/src/publish/plan.ts` | `PublishRequest`、`ProjectDef`、`RepoStatus` → `PublishPlan`（suggestedBump/projectVersion/buildStamp/changed/syncedOnly/milestoneTag/tags/双轨草稿/warnings） | M1-10/11/12/14/16/21 | 1.5 |
| M1-24 | 发布 journal | `packages/core/src/publish/journal.ts` | taskId、step 事件 → `writeJournal()`（tmp+rename 原子写）/`scanJournals()`（running→interrupted）/`resumeSteps()`（幂等跳过 done） | M1-02 | 1 |
| M1-25 | 发布引擎 | `packages/core/src/publish/engine.ts` | `PublishRequest`、journal、事件回调（`PublishEvent`）→ 仓库串行：preflight→[buildCommand]→tag milestone→tag build→写 version.json/version-history→仓库记录→`lastPublishCommit`；syncedOnly 仅同步基版；`!offline` 且 hasRemote → `push --tags`（失败仅降级警告）；done 汇总 `failedRepos` | M1-06/19/20/22/24 | 2 |
| M1-26 | AI 客户端（可选） | `packages/core/src/ai/client.ts` | `AppConfig.ai`、日志文本 → `polishDraft()`（未启用短路返回原文；fetch 调用 baseUrl） | M1-17 | 0.5 |
| M1-27 | 公共导出与单测 | `packages/core/src/index.ts`、`packages/core/test/*.test.ts` | 全部模块 → 稳定导出面 + vitest 用例（version/日志模板/commits 解析/journal/plan 纯函数 + 临时 git fixture 仓库；`scripts.test` 对齐根 `pnpm test`） | M1-02…26 | 2 |

### 2.3 验收标准

- [ ] `pnpm --filter @bxverse/core typecheck` 0 错误（strict 基线下无 `any`）
- [ ] `pnpm --filter @bxverse/core build` 产出 `dist/`
- [ ] `pnpm test`（根级）通过，覆盖 version/commits 解析/logs 模板/journal 恢复/plan 计算核心路径
- [ ] `packages/core/package.json` 的 `dependencies` 仅含 `@bxverse/shared`；`pnpm why <包名>` 确认无第三方运行时依赖
- [ ] fixture 冒烟：临时 `BX_HOME` 下能创建 `data/ repos/ journal/ logs/ tmp/`，完成一次纯函数发布模拟（tag/记录/journal 全链路）
- [ ] **依赖待补**：与 `docs/data-model.md` 做字段一致性核对（记录/版本安全名/version.json 结构），冲突以 requirements.md 为准

### 2.4 出口定义

core 全部模块导出稳定、单测全绿、零第三方运行时依赖，可直接被 server 引用；不提供任何 HTTP/UI 能力。

---

## 3. M2 服务端（@bxverse/server + @bxverse/cli）

### 3.1 目标与范围

- **目标**：零依赖 `node:http` 实现 architecture §3 全部路由（§3.2 表）、鉴权（§5.2/5.3）、SSE（§3.3）、发布单队列、静态托管（§3.4）、启动序列与优雅退出（§3.1）；CLI 薄壳四子命令（§3.5）。
- **在范围内**：全部 `/api/*` 路由；`apps/web/dist` 生产托管（M3 完成前允许 404/占位）；vitest 集成测试（临时 BX_HOME + fixture 仓库 + `http.request`）。
- **不在范围内**：前端页面（M3/M4）；发布向导 UI；PWA；AI 路由（M5-02）；业务逻辑必须调用 core（本包不实现 git/版本/日志细节）。

### 3.2 任务清单

| 编号 | 标题 | 涉及文件 | 输入 → 输出 | 依赖 | 人日 |
|---|---|---|---|---|---|
| M2-01 | server 脚手架 | `apps/server/package.json`、`tsconfig.json`、`tsup.config.ts` | core 已构建 → 空 server 包可 build/typecheck（dep: @bxverse/core、@bxverse/shared；engines node>=20） | M1-27 | 0.5 |
| M2-02 | 请求解析/错误封装 | `apps/server/src/http/json.ts` | `IncomingMessage` → `readJsonBody()`（大小上限 1MB）/`sendJson()`/`sendError({code,message})`（状态码语义化） | M2-01 | 0.5 |
| M2-03 | 鉴权中间件 | `apps/server/src/http/auth.ts` | req、credentials → `authenticate()`（`X-BX-Token` timingSafeEqual 比对）+ Origin 白名单（`http://127.0.0.1:{port}`、`http://localhost:{port}`）+ 非 GET 强制 `Content-Type: application/json` | M1-18、M2-01 | 1 |
| M2-04 | 路由与中间件链 | `apps/server/src/http/router.ts` | 方法+路径+handler 注册 → 路由分发（`router→auth→handler→JSON`）、404/405、统一错误捕获 | M2-02/03 | 1 |
| M2-05 | 静态托管 | `apps/server/src/http/static.ts` | 请求路径、`apps/web/dist` → 静态文件 + SPA fallback 到 `index.html` + Cache-Control（`index.html`/manifest 不缓存，hash 产物 immutable）；路径穿越防护 | M2-01 | 0.5 |
| M2-06 | 配置 API | `apps/server/src/api/config.ts` | GET/PUT `/api/config`（发布进行中 409）→ `AppConfig` | M1-17、M2-04 | 0.5 |
| M2-07 | 鉴权 API | `apps/server/src/api/auth.ts` | GET `/api/auth/init`（Origin 白名单内首次引导，返回 token）、POST `/api/auth/rotate`（需旧 token，原子轮换） | M1-18、M2-03 | 1 |
| M2-08 | 项目 API | `apps/server/src/api/projects.ts` | GET/POST `/api/projects`、GET/PUT/DELETE `/api/projects/:id`（发布中 409）→ `ProjectDef[]`/`ProjectDef` | M1-17、M2-04 | 1 |
| M2-09 | 仓库 API | `apps/server/src/api/repos.ts` | POST `/api/projects/:id/repos`（`{path}` 本地校验 或 `CloneRequest`）、GET `.../repos/:repoId/status`（`fresh=true` 实时）、DELETE → `RepoDef`/`RepoStatus` | M1-04/07、M2-04 | 1.5 |
| M2-10 | 文件 API | `apps/server/src/api/files.ts` | GET `tree?path=`（懒加载，超限 `truncated`）、GET `file?path=`（大小/二进制截断）→ `TreeNode`/`FileContent`；`..` 逃逸 400 | M1-08、M2-04 | 1 |
| M2-11 | 发布 API | `apps/server/src/api/publish.ts` | POST `/api/projects/:id/plan` → `PublishPlan`；POST `/api/projects/:id/publish` → `{taskId}`（队列忙 409） | M1-23/25、M2-04 | 1 |
| M2-12 | 历史 API | `apps/server/src/api/history.ts` | GET `/api/projects/:id/releases`、GET `/api/releases/:id` → `ReleaseRecord[]`/`ReleaseRecord` | M1-20、M2-04 | 0.5 |
| M2-13 | 总览 API | `apps/server/src/api/overview.ts` | GET `/api/overview` → `OverviewData`（项目/仓库/变动仓库聚合） | M1-20/21、M2-04 | 1 |
| M2-14 | 同步 API | `apps/server/src/api/sync.ts` | POST `/api/system/sync` → 数据仓库 pull/push 结果 | M1-19、M2-04 | 0.5 |
| M2-15 | 发布队列 | `apps/server/src/queue.ts` | engine + 事件回调 → `PublishQueue` 全局单 FIFO：忙时 409 或排队（返回位置）；执行中暂停该项目轮询；事件转发 SSE | M1-25、M2-11 | 1 |
| M2-16 | SSE 通道 | `apps/server/src/sse.ts` | `PublishEvent` → SSE 连接管理：`text/event-stream`、15s 心跳 `: ping`、`retry: 3000`、断线重连补发任务快照、优雅退出全量关闭 | M2-01 | 1.5 |
| M2-17 | 进程入口 | `apps/server/src/index.ts` | — → §3.1 启动序列（BX_HOME→app.json→目录确保→数据仓库 ensure→journal 扫描标记 interrupted→轮询定时器→listen `127.0.0.1:8899`→打印 URL）+ SIGINT/SIGTERM 优雅退出 | M1-19/21/24、M2-05/15/16 | 1.5 |
| M2-18 | CLI 薄壳 | `apps/cli/package.json`、`tsconfig.json`、`src/index.ts` | 命令参数 → `bx-manager start/dev/data-dir/status`（解析 BX_HOME/端口、spawn server、打开浏览器、不复制业务逻辑；`bin: {"bx-manager":"./dist/index.js"}`） | M2-17 | 1 |
| M2-19 | 服务端集成测试 | `apps/server/test/*.test.ts` | 临时 BX_HOME + fixture 仓库 → vitest 覆盖：401 无 token/403 伪造 Origin/项目 CRUD/仓库接入/plan/publish 全链路 + SSE 事件序列断言 | M2-17 | 2 |

### 3.3 验收标准

- [ ] `pnpm --filter @bxverse/server typecheck` 通过；`pnpm build` 全链（shared→core→server→cli）成功
- [ ] `pnpm dev` 启动后 curl 冒烟：
  - `curl http://127.0.0.1:8899/api/overview`（无 token）→ 401
  - `curl -X POST http://127.0.0.1:8899/api/auth/init` → 返回 token
  - `curl -H "X-BX-Token: <t>" http://127.0.0.1:8899/api/projects` → 200 JSON
  - `curl -X POST -H "Origin: http://evil.example" http://127.0.0.1:8899/api/projects` → 403
  - `curl -N -H "X-BX-Token: <t>" http://127.0.0.1:8899/api/publish/stream` → 观察到 `: ping` 心跳
- [ ] `pnpm build && pnpm start` 后浏览器可打开 `http://127.0.0.1:8899`（web 未建时返回占位/404 均可）
- [ ] 非回环 host 配置启动时打印安全警告；端口占用时报错并给出明确提示
- [ ] Ctrl+C 优雅退出（打印关闭日志，SSE 连接被服务端关闭）
- [ ] `pnpm --filter @bxverse/server test` 全绿（根 `pnpm test` 当前仅跑 core，**依赖待补**：与 `docs/api.md`/`docs/core-engine.md` 到位后核对路由表与事件格式一致性）

### 3.4 出口定义

architecture §3.2 全部路由可用且经 curl 验证；SSE 通道、单队列、静态托管、优雅退出工作正常；CLI 四命令可执行。

---

## 4. M3 前端三页（@bxverse/web）

### 4.1 目标与范围

- **目标**：web 脚手架 + 三页可用闭环：Dashboard（R2/R13）、Projects（R2/R3/R4）、History（R5/R6/R7）。
- **在范围内**：Vue3 + Vite + TS + Naive UI + UnoCSS（presetIcons carbon）+ Pinia + Vue Router；HTTP 客户端（token 注入 + fetch 流式 SSE 基建，供 M4 复用）；亮/暗主题。
- **不在范围内**：发布向导与日志编辑器（M4）；PWA 注册（M5-01）；AI（M5-02）；Settings 页（M4-12，先占位）；`verse/` 参考原型代码复用（仅风格参考）。

### 4.2 任务清单

| 编号 | 标题 | 涉及文件 | 输入 → 输出 | 依赖 | 人日 |
|---|---|---|---|---|---|
| M3-01 | web 脚手架 | `apps/web/package.json`、`vite.config.ts`、`uno.config.ts`、`tsconfig.json`、`index.html`、`src/env.d.ts` | 锁定依赖清单 → Vite dev 可起、`/api` 代理 `127.0.0.1:8899`、UnoCSS（presetUno+presetIcons `@iconify-json/carbon`、`darkMode:'class'`）、vite-plugin-pwa（仅配置不注册，见 M5-01） | M2-17 | 1.5 |
| M3-02 | 应用壳 | `apps/web/src/main.ts`、`App.vue` | — → createApp+pinia+router+naive+uno.css；App.vue 布局壳（侧栏/顶栏/主题切换挂载点/全局消息/命令面板挂载） | M3-01 | 1 |
| M3-03 | HTTP 客户端 | `apps/web/src/api/http.ts` | sessionStorage token → `request()`（注入 `X-BX-Token`、401 时重新 `auth/init`、错误归一 `{message,code}`）+ `streamSse()`（fetch+ReadableStream 解析，EventSource 不可用因需自定义头） | M3-01、M2-03 | 1 |
| M3-04 | API 资源层 | `apps/web/src/api/index.ts` | — → §3.2 全部资源函数（config/overview/projects/repos/files/plan/publish/releases/sync/auth），类型引用 `@bxverse/shared` | M3-03 | 1 |
| M3-05 | 配置 store | `apps/web/src/stores/config.ts` | GET /api/config → `AppConfig` 状态 + theme + `pwa.enabled` 运行时开关占位 | M3-04 | 0.5 |
| M3-06 | 项目 store | `apps/web/src/stores/projects.ts` | projects API → 项目/仓库列表、`RepoStatus`、CRUD actions、overview 数据 | M3-04 | 1 |
| M3-07 | UI store | `apps/web/src/stores/ui.ts` | — → 主题/命令面板显隐/全局消息 | M3-01 | 0.5 |
| M3-08 | 路由 | `apps/web/src/router/index.ts` | — → `/` `/projects` `/publish` `/history` `/settings` 五路由（`/publish`、`/settings` 先占位页） | M3-01 | 0.5 |
| M3-09 | Dashboard 总览页 | `apps/web/src/views/Dashboard.vue` | overview 数据 → 项目卡片（版本/仓库数/变动数）、变动仓库聚合（提交数/影响文件，R13）、空状态引导 | M3-05/06 | 1.5 |
| M3-10 | Projects 管理页 | `apps/web/src/views/Projects.vue` | 项目 store → 项目 CRUD、仓库列表、接入弹窗（本地路径 + URL 克隆两 Tab，R3）、仓库状态徽标、文件树抽屉入口、删除确认 | M3-06 | 2 |
| M3-11 | 文件树组件 | `apps/web/src/components/RepoTree.vue` | tree API → 懒加载树（`truncated` 触底加载、carbon 图标、文件查看） | M3-04 | 1 |
| M3-12 | History 历史页 | `apps/web/src/views/History.vue` | releases API → 发布记录列表（项目+仓库两级筛选）、详情抽屉（双轨日志 Tab 展示，R5/R6/R7） | M3-04 | 1.5 |
| M3-13 | 空状态组件 | `apps/web/src/components/EmptyState.vue` | — → 空状态引导（carbon 图标+文案+行动按钮） | M3-01 | 0.5 |
| M3-14 | 主题与暗色 | `apps/web/src/`（naive themeOverrides、uno dark class 同步） | theme store → 亮/暗两套主题（naive themeOverrides 与 UnoCSS class 策略同步切换、组件 token 统一） | M3-05/07 | 1 |
| M3-15 | 三页联调 | `apps/web/src/views/*` | M2 服务 + 真实数据 → 端到端手工验证清单（新建项目→接仓库→看树→看历史） | M3-09/10/12、M2-17 | 1 |

### 4.3 验收标准

- [ ] `pnpm --filter @bxverse/web typecheck` 与 `build` 通过（strict、无 `any` 滥用）
- [ ] `pnpm dev` 打开 `http://127.0.0.1:5173`：Dashboard/Projects/History 三页功能闭环
- [ ] 手工链路打勾：新建项目 → 本地路径接入仓库 → 文件树懒加载 → 仓库状态显示变动 → 历史页可见记录
- [ ] 亮/暗切换两套主题下无对比度问题；图标全部来自 carbon 集（无 emoji/位图）
- [ ] 浏览器 console 无报错；history 路由深链刷新正常（dev fallback 与生产 SPA fallback 均验证）
- [ ] **依赖待补**：与 `docs/frontend.md` 到位后核对页面/组件拆分一致性

### 4.4 出口定义

三页对真实数据闭环可用；`/publish` 与 `/settings` 为占位页即可；SSE 客户端基建（`streamSse`）已就绪供 M4 使用。

---

## 5. M4 发布向导 + 日志编辑

### 5.1 目标与范围

- **目标**：六步发布向导完整可用（检测→版本→日志→dry-run→执行→完成），双轨日志编辑（状态机 `auto→edited→confirmed` 强制）、SSE 实时控制台、Settings 页、命令面板。
- **在范围内**：`stores/publish.ts` 状态机；`Publish.vue` 六步；`LogEditor`/`DiffView`/`PublishConsole`/`CommandPalette` 组件；fixture 仓库端到端发布与中断续跑演练。
- **不在范围内**：PWA 注册、AI 润色按钮（M5）、6 真实工程导入（M5-03）、全站键盘可达性专项（M5-07）。

### 5.2 任务清单

| 编号 | 标题 | 涉及文件 | 输入 → 输出 | 依赖 | 人日 |
|---|---|---|---|---|---|
| M4-01 | 发布 store | `apps/web/src/stores/publish.ts` | plan/publish API → 六步状态机（step 1..6、repoIds、`PublishPlan`、双轨日志状态各自独立、dryRun 数据、错误） | M3-04 | 1 |
| M4-02 | 向导骨架 | `apps/web/src/views/Publish.vue` | 发布 store → 六步步骤条（Naive Steps）、步骤切换守卫（日志未 `confirmed` 禁入执行步） | M4-01 | 1 |
| M4-03 | 步骤一 检测 | `Publish.vue` 内 Step1 区块 | status API（fresh=true）→ 实时聚合：变更/未变仓库分组、提交列表、diff stat、手动勾选参与仓库 | M3-06 | 1 |
| M4-04 | 步骤二 版本 | `Publish.vue` 内 Step2 区块 | plan API → 展示 `suggestedBump`（高亮推荐）、projectVersion/buildStamp/milestoneTag、可手调 bump 重算、syncedOnly 提示 | M4-01 | 1 |
| M4-05 | 双轨日志编辑器 | `apps/web/src/components/LogEditor.vue` | `ReleaseLog` → internal/external 两 Tab、状态徽标（auto/edited/confirmed）、编辑即置 edited、确认按钮置 confirmed | M3-01 | 1.5 |
| M4-06 | 草稿对比组件 | `apps/web/src/components/DiffView.vue` | `autoDraft`、`content` → LCS diff 渲染（增删行着色） | M4-05 | 1 |
| M4-07 | 步骤三 日志 | `Publish.vue` 内 Step3 区块 | plan 的 internalDraft/externalDraft → 集成 LogEditor + DiffView，双轨独立确认 | M4-04/05/06 | 0.5 |
| M4-08 | 步骤四 dry-run | `Publish.vue` 内 Step4 区块 | plan 数据 → 将执行的命令清单（build 命令/标签/文件写入/记录/推送）+ warnings 展示 | M4-04 | 1 |
| M4-09 | 实时控制台 | `apps/web/src/components/PublishConsole.vue` | SSE 流 → step/log/repo-start/done/error 分级着色、自动滚动 | M3-03 | 1.5 |
| M4-10 | 步骤五 执行 | `Publish.vue` 内 Step5 区块 | publish API（携带 externalContent/internalContent）→ `{taskId}` + 订阅 `/api/publish/stream` → 实时呈现 | M4-01/09 | 1 |
| M4-11 | 步骤六 完成 | `Publish.vue` 内 Step6 区块 | done 事件 data → 发布卡片（版本/成功仓库/failedRepos 警示）+ 跳转 History | M4-10 | 0.5 |
| M4-12 | 设置页 | `apps/web/src/views/Settings.vue` | config API → 配置表单（端口/host/主题/pollInterval/PWA 开关/AI 配置/数据仓库同步按钮与状态） | M3-05 | 2 |
| M4-13 | 命令面板 | `apps/web/src/components/CommandPalette.vue` | 命令注册表 → ⌘K 打开、页面跳转/新建项目/发起发布等命令、键盘导航 | M3-07 | 1 |
| M4-14 | 向导端到端验证 | fixture 临时仓库 → 全流程发布演练 + 中断续跑演练（kill server → 重启 → 重新发起同发布 → 幂等续跑不重复打标签） | M4-11、M2-19 | 1.5 |

### 5.3 验收标准

- [ ] 用 fixture 仓库完成一次全流程发布：检测→版本→日志确认→dry-run→执行（SSE 实时）→完成
- [ ] 双轨日志均需 `confirmed` 才能执行（未确认时「执行」按钮禁用）
- [ ] journal 演练：执行中 kill server → 重启 → 重新发起同发布 → 幂等续跑不重复打标签
- [ ] `pnpm --filter @bxverse/web build` 通过；向导全程浏览器 console 无错误
- [ ] 键盘可达：向导全步骤可 Tab/Enter 操作；⌘K 命令面板可用
- [ ] **依赖待补**：与 `docs/frontend.md`（若含交互细则）核对向导行为一致性

### 5.4 出口定义

用户可用 UI 完成真实发布全流程（对 fixture 仓库试运行通过）；双轨日志状态机在 UI 层强制执行。

---

## 6. M5 自动化 / PWA / AI / 收尾

### 6.1 目标与范围

- **目标**：PWA 运行时开关、AI 日志润色接线、6 工程初始数据导入「主产品线」、边界兼容回归、可达性与首次引导打磨、生产打包验证、文档收尾、全量回归。
- **在范围内**：`pwa/register.ts` 动态注册；`POST /api/ai/polish` 新路由（需同步补充进 `docs/api.md`）；初始数据导入；离线降级/Windows 路径边界；键盘可达性专项；首次启动引导；`pnpm build && pnpm start` 生产验证；`docs/development.md` 补全。
- **不在范围内**：新功能需求；Tauri 桌面壳（远期备选）；数据仓库多机冲突自动解决（仅警告 + 人工处理）。

### 6.2 任务清单

| 编号 | 标题 | 涉及文件 | 输入 → 输出 | 依赖 | 人日 |
|---|---|---|---|---|---|
| M5-01 | PWA 运行时注册 ✅（已完成） | `apps/web/src/pwa/register.ts`、`apps/web/public/`、manifest 配置 | `AppConfig.pwa.enabled` → enabled 时动态 import 注册 SW（dev 短路）；disabled 时 unregister + 清缓存 + 移除 manifest link；boot 与设置页保存两个调用点 | M3-05、M4-12 | 1 |
| M5-02 | AI 润色接线 | `apps/server/src/api/`（新增 polish 路由）、`LogEditor.vue` 润色按钮 | 日志文本 + `AppConfig.ai` → POST `/api/ai/polish` → 润色结果（未启用时按钮隐藏/短路；api.md 同步补路由） | M1-26、M4-05 | 1 |
| M5-03 | 初始数据导入 | 导入脚本或 UI 引导（写入 app.json） | 6 工程路径清单 → 「主产品线」项目 + 6 仓库（R11）；路径不存在给出明确修复提示 | M3-10、M2-17 | 1 |
| M5-04 | 自动检测体验 | `Dashboard.vue` 轮询刷新 | `pollInterval` → 变更徽标实时性（无闪烁）、发布期间暂停该项目轮询 | M3-09、M1-21 | 0.5 |
| M5-05 | 兼容与边界 | 全链路 E2E | 无 origin 纯本地发布、离线降级、Windows 盘符/中文/含空格路径、超长提交信息 → 全部通过或仅警告 | M4-14 | 1.5 |
| M5-06 | 性能复核 | git 缓存、文件树 | 大仓库（含 node_modules 忽略）树懒加载、status 缓存命中验证 | M3-11 | 0.5 |
| M5-07 | 键盘可达性/焦点管理 | 全站组件 | Tab 顺序、Esc 关闭弹窗、焦点陷阱、可见焦点环 → 全站键盘可操作 | M4-13 | 1 |
| M5-08 | 首次引导 | `App.vue`/相关引导组件 | 首次启动 → 引导串联：token 初始化→建项目→接仓库→首次发布（空状态衔接） | M3-13、M4-12 | 1 |
| M5-09 | 生产打包验证 | 根 scripts | `pnpm build && pnpm start` 全流程（PWA 开关开/关各一轮）→ 浏览器访问 8899 完整可用 | M5-01 | 1 |
| M5-10 | 文档收尾 | `docs/development.md`、`README.md` | 开发文档补全（调试/故障排查/常见坑）、README 使用说明更新 | 全部 | 1 |
| M5-11 | 全量回归与追溯 | 全部验收命令 | 重跑根三条命令 + R1-R17 追溯矩阵核对 + 已知问题清单 | 全部 | 1 |

### 6.3 验收标准

- [ ] `pnpm typecheck` / `pnpm build` / `pnpm test` 全绿（根级三条命令）
- [ ] PWA 开关：`enabled=false` 时无 SW 注册；`enabled=true` 后可安装并离线打开已缓存页面
- [ ] 6 工程全部出现在「主产品线」项目，Dashboard 显示变动信息
- [ ] 无 origin 仓库可完成纯本地发布；有远程仓库发布失败仅降级警告
- [ ] AI 未启用时润色入口隐藏/短路，不报错
- [ ] 首启引导串完「初始化→建项目→接仓库→发布」全链路
- [ ] **依赖待补**：`docs/development.md` 补全后，其「验证命令」与本路线图验收命令一致

### 6.4 出口定义

生产形态可交付：`pnpm build && pnpm start` 一条路径完整可用；文档齐全；R1-R17 全部有覆盖且验证通过。

---

## 7. M6 备份与一致性对比（R19）

### 7.1 目标与范围

- **目标**：每次发布自动备份源码与产物，支持三层次一致性对比（源码 git diff / 产物清单对比 / manifest 校验），备份元数据入 git 数据仓库审计，大文件存本地 `backups/`。
- **在范围内**：`core backup/`（零依赖 tar.gz + 哈希清单 + bundle/archive/产物归档）、`core compare/`（对比引擎）、engine 发布流程挂接（tag 后源码备份、build 后产物备份）、备份 API 与前端备份管理/对比 UI、仓库级 `artifactDir` 配置。
- **不在范围内**：**恢复功能**（bundle 克隆恢复 / 产物解包，属 M7 低优先级暂缓）；自动清理过期备份（手动删除 + 磁盘占用展示即可）；对业务仓库的任何自动 commit。

### 7.2 任务清单

| 编号 | 标题 | 涉及文件 | 输入 → 输出 | 依赖 | 人日 |
|---|---|---|---|---|---|
| M6-00 | 契约扩展 | `packages/shared/src/types.ts` | 设计 → `RepoDef.artifactDir?`、`AppConfig.backup?{enabled,dir,source,onFailure}`、`PublishRequest.backupSource?/backupArtifacts?`、`ReleaseRecord.backups?: RepoBackupRef[]`、`BackupEntry`/`BackupManifest`/`FileCompareItem`/`CompareResult`（全部可选字段，`// 扩展：` 标注） | — | 0.5 |
| M6-01 | 哈希清单 | `packages/core/src/backup/manifest.ts` | 目录绝对路径、排除规则 → `BackupManifest`（相对路径→sha256/size 流式哈希，含 `totals`；排除 `.git` 与既定忽略规则） | M6-00 | 0.5 |
| M6-02 | 零依赖 tar.gz | `packages/core/src/backup/tar.ts` | 文件清单 → ustar tar + `node:zlib` gzip 流式写入（不落临时文件；长路径/中文名 pax 扩展头） | M6-01 | 0.5 |
| M6-03 | 源码备份 | `packages/core/src/backup/source.ts` | repoPath、tag → `git bundle create`（含全部历史与标签，可 clone 恢复）+ `git archive --format=tar` 快照（仅已跟踪文件，天然遵循 .gitignore）→ `source.bundle`/`source.tar.gz` + sha256 | M6-01/02 | 0.5 |
| M6-04 | 产物备份 | `packages/core/src/backup/artifact.ts` | `RepoDef.artifactDir`（未配置→跳过并返回空）→ 目录归档 `artifact.tar.gz` + `artifact-manifest.json` | M6-01/02 | 0.5 |
| M6-05 | 备份编排 | `packages/core/src/backup/index.ts` | 发布上下文、仓库、tag → `backupRepo()`（幂等：同名文件存在即跳过；失败清理半成品；`onFailure: warn\|fail`；元数据 JSON 落 `data/backups/`（git 审计）） | M6-03/04 | 1 |
| M6-06 | 对比引擎 | `packages/core/src/compare/index.ts` | ①两个 commit/tag → `git diff --name-status --numstat` 文件级差异+统计；②两份 `BackupManifest`（或清单 vs 目录实时哈希）→ 新增/删除/修改/一致 四类 + totals；③输出可序列化 `CompareResult`（前端渲染 + 校验报告导出） | M6-01 | 1.5 |
| M6-07 | 发布引擎集成 | `packages/core/src/engine.ts` | 发布流程插入：tag 后执行源码备份 → build 后执行产物备份 → `ReleaseRecord.backups` 挂引用；SSE 发 `step` 事件（`备份：源码 bundle 完成`）；失败按策略 warn（记入 warnings）或 fail（中止仓库并清理） | M6-05、M1-25 | 1 |
| M6-08 | core 单测 | `packages/core/test/backup.test.ts`、`compare.test.ts` | fixture 仓库：发布后备份文件存在且 sha256 一致；manifest 校验通过；两次发布对比得到预期差异；bundle 可被 `git bundle verify` | M6-05/06/07 | 1 |
| M6-09 | 备份/对比 API | `apps/server/src/api/backups.ts` | 路由：`GET /api/repos/:id/backups`（列表）、`GET /api/backups/:releaseId/:repoId`（元数据）、`GET /api/backups/download/:releaseId/:repoId/:kind`（流式下载）、`DELETE /api/backups/:releaseId/:repoId`、`POST /api/backups/compare`、`POST /api/backups/verify`、`GET /api/repos/:id/diff?from=&to=`（源码 diff） | M6-06/07、M2 路由基建 | 1 |
| M6-10 | 前端备份管理与对比 | `apps/web/src/views/BackupManage.vue`、`RepoDetail.vue`（artifactDir 树选择）、`ReleaseWizard.vue`（备份开关+完成页摘要）、`ProjectDetail.vue`（发布历史「对比」入口） | 仓库设置选产物目录（复用 R18 树选择器）；向导备份开关；备份管理页（列表/下载/删除/磁盘占用）；对比面板（四类差异着色 + 校验报告导出） | M6-09、M4 页面 | 2 |
| M6-11 | 文档回写与追溯 | `docs/api.md`、`docs/data-model.md`、`docs/frontend.md` | 备份存储布局、API 协议、前端交互补齐；R19 追溯矩阵核对 | M6-10 | 0.5 |

### 7.3 验收标准

- [ ] fixture 全流程发布：tag 后生成 `source.bundle` + `source.tar.gz`；build 后生成 `artifact.tar.gz` + `artifact-manifest.json`；sha256 与元数据一致
- [ ] `.gitignore` 语义：源码快照仅含已跟踪文件；bundle 含全部历史与本次 tag
- [ ] 未配置 `artifactDir` 的仓库发布不报错（跳过产物备份，warnings 提示）
- [ ] `onFailure=warn` 时备份失败不阻断发布；`fail` 时仓库发布失败且无半成品残留
- [ ] 两次发布对比：产物级差异四类分类正确；源码级 git diff 与 `git diff` 命令行一致
- [ ] 备份元数据 JSON 进入数据仓库（`data/backups/`）可被 git 审计；大文件不在数据仓库内
- [ ] `pnpm typecheck` / `pnpm test` / `pnpm build` 全绿；core 仍零第三方运行时依赖
- [ ] 备份管理页可下载/删除/对比/校验；向导完成页展示备份摘要

### 7.4 出口定义

每次发布自动产出可审计、可校验、可对比的源码与产物备份；对比功能可支撑「本次归档包 vs 上次投产包」类核验场景；M7（恢复）暂缓排期。

---

## 7.5 M8 多项目看板与仓库治理中枢（R2/R3 双模式接入 + 治理中枢）

### 7.5.1 目标与范围

- **目标**：项目级看板可多业务线并行管理，仓库接入支持本地路径/Git 克隆双模式，治理中枢可配置产物目录与构建命令并做接入校验与失败提示。
- **在范围内**：`projects` 看板（卡片含版本/仓库数/变动数/末次发布）、接入弹窗两 Tab、仓库卡片治理（构建命令/产物目录 `artifactDir` 树选、启用开关）、接入校验与错误码映射、看板筛选与空状态。
- **不在范围内**：分支巡检批量切分支（M9）、AI 场景路由（M10）、废弃审计（M11）。

### 7.5.2 任务清单

| 编号 | 标题 | 涉及文件 | 输入 → 输出 | 依赖 | 人日 |
|---|---|---|---|---|---|
| M8-01 | 看板 store 聚合 | `apps/web/src/stores/projects.ts`、`api/index.ts` | `GET /api/projects` + `overview` → 看板聚合（项目卡片数据、变动仓库计数、末次发布） | M3-06 | 0.5 |
| M8-02 | 项目看板页 | `apps/web/src/views/ProjectBoard.vue`（或 `Dashboard.vue` 升级）、`components/ProjectCard.vue` | 看板数据 → 网格看板（卡片：版本/仓库数/变动数/末次发布、空状态引导、筛选） | M8-01 | 1 |
| M8-03 | 双模式接入弹窗 | `apps/web/src/components/AddRepoDialog.vue`、`stores/projects.ts` | 本地路径（校验 `.git`）/ `CloneRequest{url,shallow,name}` → `POST /api/projects/:id/repos` 双 Tab，错误码 `REPO_INVALID/CLONE_FAILED` 映射 | M2-09 | 1 |
| M8-04 | 仓库治理卡片 | `apps/web/src/views/ProjectDetail.vue`、`components/RepoCard.vue`、`components/DirPicker.vue` | `RepoDef{buildCommand,artifactDir,displayName}` → 构建命令输入 + 产物目录树选（复用 R18 选择器）、写版本文件开关 | M6-10 | 1 |
| M8-05 | 接入校验与提示 | `apps/server/src/api/repos.ts`、`packages/core/src/git/clone.ts` | 路径/URL 校验（`..` 逃逸、协议白名单、`shallow` 超时 120s）→ 400 `VALIDATION` 明确修复提示 | M1-07 | 0.5 |
| M8-06 | 看板联调与空状态 | `apps/web/src/views/*`、`stores/*` | 真实数据 → 端到端：新建项目→双模式接入→治理配置→看板刷新 | M8-02/03/04 | 1 |

### 7.5.3 验收标准

- [ ] 看板显示多项目卡片（版本/仓库数/变动数/末次发布）与变动仓库聚合
- [ ] 本地路径接入校验 `.git`，Git 地址白名单 `https/ssh/git@` 且 `shallow` 可选，失败提示明确
- [ ] 仓库卡片可配置 `buildCommand` 与 `artifactDir`（树选），未配置产物目录时备份跳过提示
- [ ] `pnpm typecheck` / `pnpm build` 通过；`pnpm --filter @bxverse/server test` 接入用例全绿

## 8. 风险清单与缓解措施

| # | 风险 | 影响 | 缓解措施 |
|---|---|---|---|
| 1 | 并行设计文档（data-model/api/core-engine/frontend/development）与本路线图存在时序差或口径冲突 | 字段/协议返工 | 双定稿基准固定为 requirements.md + shared/types.ts + architecture.md；各文档到位后 M1 出口前做一致性核对，冲突以 requirements.md 为准 |
| 2 | 零依赖 `node:http` 手写路由/SSE 边界多（chunk 分片、心跳、断连、背压） | M2 进度受阻 | M2-16 与 M2-19 专项测试先行；SSE 客户端用 fetch 流（EventSource 无法带自定义头）；错误统一封装兜底 |
| 3 | 6 真实工程工作树 dirty 或历史被 force-push | 首次发布被预检阻断 | 预检给出可操作提示（先提交/stash）；`lastPublishCommit` 不可达走全量收集降级；M5-03 导入时逐仓库体检并出报告 |
| 4 | 大仓库 git 调用慢（全量 diff、文件树根目录条目多） | 体验与轮询开销 | M1-05 限制收集范围 + `--no-renames`；M1-21 TTL 缓存；M3-11 懒加载截断；M5-06 复核 |
| 5 | Naive UI 主题与 UnoCSS dark class 策略不同步 | 亮/暗主题 UI 撕裂 | M3-14 单任务统一处理：UnoCSS `darkMode:'class'` + naive themeOverrides 随 store 同步切换 |
| 6 | vite-plugin-pwa 构建期注册与运行时开关冲突 | PWA 不可控（需求要求运行时开关） | 不用插件默认注册；`registerType` 配置 + `pwa/register.ts` 手动动态 import，disabled 时 `unregister` |
| 7 | Windows 路径（`E:\`、中文、空格）在 git spawn/JSON 序列化出错 | 发布失败/乱码 | 全程数组参数 spawn（不经过 shell）；路径统一正斜杠归一；M5-05 专项 E2E |
| 8 | 人日估算偏差（并行任务间依赖未就绪、真实工程环境差异） | 排期漂移 | 里程碑出口硬性、入口软性；M 间设集成缓冲任务（M3-15、M4-14、M5-05/11）吸收偏差 |
| 9 | 需求演进（R15「尽可能完整」可能带来新诉求） | 范围蔓延 | 新诉求先回 requirements.md 变更记录，再进下一轮路线图；本版冻结在 R1-R17 |
| 10 | 备份体积膨胀（大仓库 bundle/产物归档占磁盘） | 磁盘压力 | 大文件不进 git 数据仓库；备份目录可配（`AppConfig.backup.dir`）；管理页展示磁盘占用 + 手动删除；自动清理策略入 M7 一并评估 |
| 11 | 零依赖 tar/清单在 Windows 长路径/中文名/大文件下出错 | 备份失败或损坏 | M6-02 pax 扩展头覆盖长路径与中文；流式哈希避免内存峰值；M6-08 fixture 覆盖中文路径与二进制文件 |

---

## 9. 需求 → 任务追溯矩阵（R1–R19）

| 需求 | 内容 | 覆盖任务 |
|---|---|---|
| R1 | 客户端形态（本地 Web / PWA 可选） | M2-17（本地服务进程）、M3-01/02（Web 前端）、M5-01（PWA 运行时开关）、M5-09（生产形态验证） |
| R2 | 项目→仓库两级管理 | M1-17（配置存储）、M2-08/M2-09、M3-10（Projects 管理页） |
| R3 | 本地路径 + Git 地址两种接入 | M1-07（校验/克隆）、M2-09、M3-10（接入弹窗两 Tab） |
| R4 | 查看仓库目录结构与文件 | M1-08（文件树）、M2-10、M3-11（RepoTree 懒加载） |
| R5 | 仓库级版本与日志管理 | M1-12/16/23/25（版本与日志引擎）、M4 全链（向导）、M3-12（历史查看） |
| R6 | 项目级版本与日志 | M1-23/25（项目发布记录）、M4-04/07/11（项目版本与日志步骤） |
| R7 | 日志双轨 internal/external | M1-13/14/16（双轨生成与状态机）、M4-05/06/07（双轨编辑确认）、M3-12（双轨查看） |
| R8 | 版本号方案可配（semver/hybrid/timestamp） | M1-09/10/11/12（三方案计算）、M4-04（版本步骤展示与手调） |
| R9 | 自动化（版本/日志/检测尽量自动） | M1-21（轮询检测）、M1-23（计划自动生成）、M1-14（日志草稿）、M5-04（自动刷新体验） |
| R10 | 纯本地 + 远程 tag/release 双模式 | M1-19（数据仓库远程）、M1-25（push --tags 降级）、M2-14（手动同步）、M4-08/10（dry-run 与执行）、M5-05（离线边界） |
| R11 | 现有 6 工程入一个项目 | M5-03（「主产品线」初始数据导入） |
| R12 | 版本联动（仓库随基版、统一版本变动、未变动同步基版） | M1-23（changed/syncedOnly 计算）、M1-25（同步基版 version.json） |
| R13 | 改动点可见（提交与影响文件聚合） | M1-05/21（提交收集与检测）、M2-13（overview 聚合）、M3-09（Dashboard 展示）、M4-03（检测步骤） |
| R14 | 日志自动生成 + 人工编辑确认 | M1-15/16（草稿/编辑/确认状态机）、M4-05/06/07（编辑器 + 状态强制 confirmed） |
| R15 | 完整性、无历史包袱 | M1 全量（新设计落地）、M5-05（边界回归）、M5-11（全量回归） |
| R16 | 好用 | M3-15（三页联调）、M4-14（向导端到端）、M5-07/08（键盘可达性/首次引导） |
| R17 | UI/UX 美观优雅精致 | M3-14（主题与暗色）、M4-13（命令面板）、M5-07/08（可达性与引导打磨） |
| R18 | 版本清单导出（下载/写仓库/本地目录/发布快照） | M4 相关任务（版本清单）、M6-00（契约扩展与清单复用） |
| R19 | 版本一致性对比与发布备份 | M6 全链（备份存储/打包/对比引擎/引擎集成/API/前端管理页）；恢复功能 M7 暂缓 |
| R26 | 仓库级构建流水线与 package.json 双格式 | M13（契约 `repoVersionFormat`/`manifestTarget`/`versionSource` 等 → 版本引擎双格式与 `commitVersionFiles` → 流水线 `version-sync/install/pre-build` → API 校验 → 前端 `RepoDetail`/`AddProjectDialog` → 发布后 `manifestTarget` 自动落盘）；详见 `docs/r26-build-pipeline.md` |

> 每条需求至少有一个里程碑任务覆盖；验收时以 M5-11 / M6-11 全量回归逐条核对本矩阵。

---

## 10. 变更记录

| 日期 | 变更 |
|---|---|
| 2026-08-13 | 首版：M1–M5 里程碑、任务分解、验收标准、风险清单、需求追溯矩阵 |
| 2026-08-13 | 新增 R19/M6：备份与一致性对比（备份范围= bundle + archive 快照，遵循 .gitignore；产物目录按仓库由用户选择 artifactDir；恢复功能 M7 低优先级暂缓）；风险清单补 #10/#11 |
| 2026-08-13 | M6 完成：core backup/compare 零依赖引擎 + 发布流程挂接 + 备份 API + 前端备份管理页；验收全过（core 单测 / API E2E：备份、下载、校验、产物与源码对比、删除） |
| 2026-08-13 | WIG 整改 + 四项目借鉴落地：realpath 加固、RuntimeStatus 服务状态 chip、发布向导提交级排除、seed/icons 脚本；文档同步补全（frontend.md / development.md / AGENTS.md / README.md） |
| 2026-08-13 | M5-01 完成：PWA 运行时注册（pwa/register.ts 动态 import 注册/注销，boot + 设置页双调用点）；缺陷修复：versions/export 增加盘符/UNC 绝对路径拦截（POSIX 下 path.isAbsolute 不识别 C:/），server 测试非 git 目录用例改为 mkdtemp 跨平台夹具（不再依赖 Windows TEMP） |
| 2026-08-17 | R21 AI 多供应商体系落地：6 预设供应商支持、write-only 凭据隔离存储、旧单表单配置自动迁移、对外日志 AI 润色适配生效供应商 |
| 2026-08-17 | R22 Git 面板与 AI 助手落地：仓库详情页新增 Git tab（分支/HEAD/ahead-behind/已暂存/未暂存/未追踪）、单文件与全部暂存/撤销、Conventional Commits 提交弹窗 + AI 生成标题/说明、单文件 Diff 侧栏 + AI 变更解读 |
| 2026-08-17 | v1.0.0 正式定稿：发布里程碑 Tag `v1.0.0`，全面覆盖 R1–R22 基础规格；启动 v2 架构重构，规划 M8–M12 进阶里程碑（分支协同巡检、AI场景特化路由、发版废弃纠偏、多项目治理、三栏沉浸式仪表盘） |
| 2026-08-21 | P1 优化收敛：`AppConfig.publish.concurrency` 仓库级并发（默认1，上限5，批量落盘竞态安全）、`openapi.json`/`validate.ts` 契约与运行时校验、`useBackup`/`usePublishPlan` 前端收敛、`BackupPanel` 复用、`enforceRetention`/`restore` 闭环 |
| 2026-08-24 | 新增 R26/M13：仓库级构建流水线与 package.json 双格式（`X.Y.Z`/`VYYMMDDHHmm` + `versionSource`/`packageManager`/`installCommand`/`preBuildCommand`/`buildTimeoutMs`/`versionSyncCommit` + `manifestTarget` 自动落盘），core 单测 15+8 项、engine 流水线、API/前端三处，发布后真实 fixture 验证通过 |

