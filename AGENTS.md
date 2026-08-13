# AGENTS.md — bxverse 开发指引

> 面向后续开发 agent 的项目指引。任何实现任务开工前先读本文件，再按「开发流程」读设计文档。

## 1. 项目定位与技术栈

**一句话定位**：bxverse 是「项目/仓库两级版本与更新日志统一管理」的本地 Web 管理台——在 127.0.0.1 起一个 Node 服务，浏览器可视化管理本地 git 仓库的版本号、双轨更新日志与发布（纯本地或远程 tag 联动），发布数据存于 git 数据仓库（历史即审计）。

| 层 | 技术 | 说明 |
|---|---|---|
| 包管理 | pnpm monorepo（`pnpm@10.32.1`） | workspace：`packages/*`、`apps/*`；`verse/` 参考原型**不在 workspace**，仅风格参考不可复用代码 |
| 共享契约 | @bxverse/shared | 类型+常量，已定稿，唯一跨包契约 |
| 核心引擎 | @bxverse/core | 纯 Node 内置 + `spawn('git')`，**零第三方运行时依赖** |
| 服务端 | @bxverse/server | 零依赖 `node:http`，127.0.0.1:8899，SSE，生产托管 `apps/web/dist` |
| 前端 | @bxverse/web | Vue3 + Vite + TS + Naive UI + UnoCSS（presetIcons carbon）+ Pinia + Vue Router + vite-plugin-pwa（运行时开关） |
| 薄壳 | @bxverse/cli | `bx-manager` 命令，spawn server、打开浏览器，不承载业务逻辑 |
| 运行时 | Node ≥ 20，TS strict（tsconfig.base.json） | 数据目录 `~/.bxverse`（`BX_HOME` 覆盖） |

## 2. 硬性规则（违反即返工）

1. **必须用 pnpm**：不用 npm/yarn；安装/构建/测试一律 `pnpm ...`。
2. **TS strict，禁止 `any` 滥用**：`tsconfig.base.json` 已开 `strict`/`noUnusedLocals`/`noUnusedParameters`；`any` 仅在确有必要的窄场景（如 `PublishEvent.data?: unknown` 边界）出现，不得扩散到业务逻辑。
3. **组件规范**：Vue3 Composition API + `<script setup>`；组件文件 PascalCase；页面放 `apps/web/src/views/`，可复用组件放 `apps/web/src/components/`；状态放 Pinia store。
4. **图标规范**：字体图标一律 UnoCSS presetIcons（`@iconify-json/carbon`），如 `<div class="i-carbon-add" />`；禁止引入其他图标库、禁止 emoji 图标。
5. **零依赖约束**：
   - `@bxverse/core`、`@bxverse/server` **禁止新增任何第三方运行时依赖**（core 的 `dependencies` 仅 `@bxverse/shared`；server 仅 core/shared）。git 一律 `child_process.spawn('git')`，HTTP 一律 `node:http`。
   - `@bxverse/web` 允许按锁定技术栈添加依赖（vue/naive-ui/pinia/vue-router/vite-plugin-pwa/@iconify-json/carbon 等），新增依赖需先确认必要。
6. **实现必须对照 docs/ 设计文档**：先读文档再写代码；文档与代码冲突时以 `docs/requirements.md`（唯一需求依据）为准，其次是 `packages/shared/src/types.ts`（定稿契约）。
7. **禁止修改已定稿的 `shared/types.ts`**：字段与语义已定稿。确需扩展只能**新增字段**（全部可选、不破坏既有语义）并在字段上方标注 `// 扩展：` 原因；禁止删除、重命名、改语义任何既有字段。`shared/constants.ts` 同理（`APP_DATA_DIR_NAME='.bxverse'` 不可改）。
8. **依赖方向单向**：`web/server/cli → core → shared`；web 与 server 只通过 HTTP/SSE 通信，禁止 web 导入 core/server。
9. **对业务仓库零侵入**：不自动 commit/amend/force-push；只打标签、写 version.json（可关）、推送标签（可 offline 跳过）。

## 3. 开发流程

### 3.1 接到任务先读文档（按顺序）

1. `docs/requirements.md` —— 确认任务对应需求编号（R1–R17），不偏离原意。
2. `docs/roadmap.md` —— 定位任务所属里程碑与验收标准（M1–M5）。
3. `docs/architecture.md` —— 总体结构、进程模型、路由表、安全/可靠性设计（§7 文件清单即文件级蓝图）。
4. `docs/data-model.md` / `docs/core-engine.md` / `docs/api.md` / `docs/frontend.md` / `docs/development.md` —— 按任务层选读（见 §6 索引）。**若文件缺失（并行任务未完成），在代码注释与提交说明中标注「依赖待补」，并仍以 requirements + types.ts + architecture.md 为准。**
5. 相关包现有源码与 `packages/shared/src/types.ts` —— 字段名一字不差引用。

### 3.2 实现后必跑验证命令

| 命令 | 位置 | 含义 |
|---|---|---|
| `pnpm install` | 根 | 安装依赖（新增依赖后必跑；`pnpm.onlyBuiltDependencies` 已列 esbuild/vue-demi，新装的构建脚本包需补列，见 §5） |
| `pnpm typecheck` | 根 | 全部包 `tsc --noEmit`（递归 `pnpm -r typecheck`）——提交前必过 |
| `pnpm build` | 根 | 全链构建 shared→core→server→cli→web——涉及产物/导出变化必过 |
| `pnpm test` | 根 | core 单测（`pnpm --filter @bxverse/core test`）；server 单测用 `pnpm --filter @bxverse/server test` |
| `pnpm dev` | 根 | 并行起 server(8899) + web(5173)，开发联调用 |
| `pnpm start` | 根 | 生产形态（先 `pnpm build`），浏览器访问 `http://127.0.0.1:8899` |

规则：改 core → 至少跑 `pnpm typecheck && pnpm test`；改 server/web → 至少 `pnpm typecheck && pnpm build`；发布类改动 → 用 fixture 临时仓库走一遍向导全流程。

## 4. 关键约定速查

### 4.1 目录结构（相对仓库根）

```
packages/shared/src/{types.ts,constants.ts,index.ts}  已定稿，勿动（见规则 7）
packages/core/src/{home.ts, git/*, version/*, logs/*, publish/*, store/*, detect/*, ai/*}
apps/server/src/{index.ts, http/*, api/*, queue.ts, sse.ts}
apps/web/src/{main.ts, App.vue, api/*, stores/*, router/, views/, components/, pwa/}
apps/cli/src/index.ts
docs/*.md   设计文档
verse/      参考原型，不在 workspace，不参与构建
```

### 4.2 包依赖方向

```
apps/@bxverse/web ──────┐
apps/@bxverse/server ───┼──► @bxverse/core ──► @bxverse/shared
apps/@bxverse/cli ──────┘
```

### 4.3 数据目录

- 默认 `~/.bxverse/`，环境变量 `BX_HOME` 覆盖（core `home.ts` 解析）。
- 布局：`app.json`（AppConfig）+ `credentials.json`（token，0600，不进数据仓库）+ `data/`（git 数据仓库）+ `repos/`（克隆目录，`{projectId}/`）+ `journal/` + `logs/` + `tmp/`。

### 4.4 端口与主机

- server 默认 `127.0.0.1:8899`（`APP_DEFAULT_PORT`）；非回环 host 启动必须打印安全警告。
- 开发形态 web 在 `5173`，`/api` 代理到 8899（`vite.config.ts`）。

### 4.5 版本与标签格式

- 项目版本：`vX.Y.Z`（semver）。
- 仓库版本：`vX.Y.Z.YYMMDDHH`（hybrid，默认）/ `vYYMMDDHH`（timestamp，可配 `repoVersionScheme`）。
- 标签：里程碑 `vX.Y.Z`、构建 `build/vX.Y.Z.YYMMDDHH`（撞名追加序号）；tag 创建幂等（同名同 commit 跳过）。
- bump 建议：breaking→major / feat→minor / fix→patch；`ProjectDef.bump='manual'` 时默认 patch。

### 4.6 日志双轨规则

- 每次发布产出 internal（对内全量：提交明细+文件+统计）与 external（对外分节，按 `EXTERNAL_SECTIONS`，默认排除 `DEFAULT_EXTERNAL_EXCLUDE`）两份。
- 状态机：`auto → edited → confirmed`，双轨各自独立；**发布执行前两侧必须 `confirmed`**；自动草稿存 `ReleaseLog.autoDraft` 留底供 diff。

### 4.7 SSE 事件格式

- 通道：`GET /api/publish/stream`（需 `X-BX-Token`；前端用 fetch+ReadableStream，EventSource 无法带自定义头）。
- 帧：`event: publish\ndata: {json}\n\n`；每 15s 心跳 `: ping`；`retry: 3000`。
- `PublishEvent.type`：`log`/`step`/`repo-start`/`repo-done`/`repo-error`/`done`（data 带 `{releaseId,version,failedRepos}`）/`error`。

### 4.8 发布六步向导

检测 → 版本 → 日志（双轨确认）→ dry-run → 执行（SSE）→ 完成。执行永远由人发起；执行中该项目暂停轮询；单 FIFO 队列，忙返回 409。

## 5. 常见坑（Windows + 本栈专属）

1. **Windows 路径**：git spawn 参数一律数组、不拼 shell 字符串；路径使用正斜杠归一（`path.replaceAll('\\','/')`）再传 git；盘符（`E:\`）在 `path.isAbsolute` 下正常，但 URL/JSON 序列化注意转义。用户路径可能含中文/空格——所有 shell 命令用 `spawn(..., [args])` 而非字符串拼接。
2. **execFileSync/spawn 必须数组参数**：`execFileSync('git', ['log', '--format=%H|%s', range])`；禁止 `exec('git log ...')`（shell 注入 + 空格路径双重风险）。超时必设。
3. **pnpm onlyBuiltDependencies**：根 package.json 已列 `esbuild`、`vue-demi`；若新增带 install 脚本的依赖（如 esbuild 类）导致 postinstall 被跳过，须在根 `pnpm.onlyBuiltDependencies` 补列后 `pnpm install`。
4. **Naive UI 主题**：组件主题用 `n-config-provider` 的 `themeOverrides`，与 UnoCSS 变量分开管理；亮/暗切换时两者必须同步（UnoCSS 用 `darkMode:'class'` 策略，html 上切 `dark` class）。
5. **UnoCSS dark 模式**：`dark:` 变体默认走媒体查询，须在 `uno.config.ts` 配 `darkMode: 'class'`，否则跟随系统而非应用内主题开关。
6. **PWA dev 不注册**：vite-plugin-pwa 在 dev 默认不注册 SW；且本项目 PWA 是**运行时开关**——不要依赖插件自动注册，统一由 `apps/web/src/pwa/register.ts` 按 `AppConfig.pwa.enabled` 动态 import 注册 / `unregister`，否则「关闭 PWA」形同虚设。
7. **SSE 用 fetch 流**：`EventSource` 不能带 `X-BX-Token` 头，必须用 `fetch` + `ReadableStream` 手动解析 SSE；注意处理跨 chunk 的帧分片（按 `\n\n` 缓冲）。
8. **git 输出解析**：git 输出用 `--format` 分隔符（如 `%x1f`）配合 `-z` 解析，避免提交信息中的换行/`|` 破坏解析。
9. **路径穿越**：文件树/文件接口对 `path` 参数必须 `path.normalize` 后校验仍在仓库根内，拒绝 `..`。
10. **历史路由刷新**：`vue-router` history 模式依赖 server 的 SPA fallback（非 `/api/*` 且非文件 → `index.html`）；dev 下靠 Vite fallback。改路由后两形态都要验证深链刷新。

## 6. 文档索引表

| 文档 | 用途 | 阅读时机 |
|---|---|---|
| `docs/requirements.md` | 原始需求 + 澄清结论（R1–R17，唯一需求依据） | 任何任务开工前；需求有疑问时 |
| `docs/architecture.md` | 总体架构：进程模型、路由表、SSE、安全/可靠性、§7 文件级蓝图 | 任何跨包/结构性任务开工前 |
| `docs/roadmap.md` | 里程碑 M1–M5 任务分解、验收标准、风险、需求追溯矩阵 | 领取任务、做验收时 |
| `docs/data-model.md` | 数据模型与存储（app.json、数据仓库、records、journal、version.json） | 写 core store/publish 相关代码前 |
| `docs/core-engine.md` | core 引擎细节（git 封装、版本计算、日志流水线、发布编排） | 写 core 模块前 |
| `docs/api.md` | REST/SSE 协议细节 | 写 server 路由或 web api 层前 |
| `docs/frontend.md` | 前端页面/组件/状态/交互设计 | 写 web 页面组件前 |
| `docs/development.md` | 开发环境、调试、故障排查 | 环境搭建与排障时 |

> 注：除 requirements.md、architecture.md、roadmap.md 外，其余文档由并行任务撰写，可能暂缺——缺失时以 requirements + shared/types.ts + architecture.md 为准，并在实现注释中标注「依赖待补：docs/xxx.md」。

## 7. 提交与协作约定

- 任务完成后跑完 §3.2 验证命令再交付；提交信息遵循仓库既有风格（常规前缀）。
- 不 commit 未要求提交的内容；不推送到远端（数据仓库的 git 操作属产品功能，勿与开发仓库混淆）。
- 修改任何 `docs/*.md` 设计文档前，先确认对应实现已同步；文档与代码不一致时优先改代码（除非需求变更，需求变更必须回写 requirements.md 变更记录）。
