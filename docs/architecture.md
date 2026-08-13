# bxverse 总体架构设计

> 文档版本：v0.2（2026-08-13）
> 依据：`docs/requirements.md`（唯一需求依据）、`packages/shared/src/types.ts`（定稿共享类型）、`packages/shared/src/constants.ts`（定稿常量）、根 `package.json` 与 `pnpm-workspace.yaml`。
> 读者：后续开发 agent 与维护者。本文中出现的所有领域类型字段名与 `types.ts` 一字不差；未实现的内容在文件清单中以 `[待建]` 标注。

### 变更记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v0.1 | 2026-08-13 | 初稿 |
| v0.2 | 2026-08-13 | 明确 `AppConfig.dataDir` 语义与默认值；修正 §7 home.ts 目录描述（`home/`→`data/`）；docs/data-model.md 标记 `[已有]`；修正指向 data-model.md 的章节引用（多机同步 §7→§9、buildStamp 撞名 §4→§6.3、日志状态机 §5→§7、版本联动 §4→§6.4）；§5.5 克隆目录细化到 `{projectId}/{repoId}/` |

---

## 1. 设计目标与原则

### 1.1 设计目标

在用户本机运行一个**本地 Web 管理台**（绑定 127.0.0.1），以可视化方式统一管理「项目 → 代码仓库」两级结构的版本号与更新日志，覆盖：仓库接入、变动检测、版本草拟、双轨日志生成与人工确认、发布执行（本地 tag / 远程联动）、发布记录审计与多机同步。对应需求 R1、R2、R5、R6、R9、R10、R13。

### 1.2 设计原则

**原则一：数据权威，工具无痕（Non-invasive）**
- 业务仓库（被管理的 git 仓库）是数据权威。本工具**永不改写业务仓库的 git 历史**：不自动 commit、不 amend、不 force-push、不移动分支。
- 对业务仓库的全部写入只有三类，且都可关闭/跳过：① 打标签（milestone `vX.Y.Z` 与 build `build/vX.Y.Z.YYMMDDHH`）；② 按配置写入 `version.json` / `version-history.json`（`RepoDef.writeVersionFile` 默认 `true`，可关闭实现零侵入）；③ 远程联动时推送标签（`PublishRequest.offline=true` 可跳过）。
- 发布数据（记录、日志、审计）全部落在工具自己的数据仓库（`AppConfig.dataDir`，默认 `~/.bxverse/data`），不写入业务仓库。

**原则二：自动为先，人审为终（Automation first, human final）**
- 检测、版本建议、日志草稿、dry-run 预览全部自动化（R9、R14）。
- 但「执行发布」这个动作**永远由人发起并确认**：向导中双轨日志必须达到 `confirmed` 状态才能执行；执行前必须看到 dry-run 预览。自动生成的草稿通过 `autoDraft` 留底，人工修订永不丢失对比基准。

**原则三：优雅可用（Elegant & usable，R16/R17）**
- UI 以 Naive UI 组件体系 + UnoCSS 原子样式实现；亮/暗主题（`AppConfig.theme`）、键盘可达、命令面板、克制动效、空状态引导。
- 全部操作可逆或可审计：发布记录不可变（git 历史即审计），误操作通过版本管理可见。

### 1.3 非功能底线（对应需求 §5）

| 类别 | 底线 |
|---|---|
| 安全 | 默认绑定 127.0.0.1；`X-BX-Token` 请求头 + Origin 校验防 CSRF；凭据独立存储不进数据仓库 |
| 可靠性 | 发布 journal 落盘可续跑；预检阻塞项；失败隔离不污染已完成仓库；tag 幂等 |
| 性能 | 文件树懒加载（`TreeNode.truncated`）；git 调用带缓存；发布任务单队列 |
| 兼容 | 纯本地（无 origin/离线）与远程联动自动降级，降级仅警告不报错 |

---

## 2. Monorepo 结构与职责边界

### 2.1 结构总览

```
G:\vibecoding\
├── package.json                 根：scripts（dev/build/typecheck/test/start）
├── pnpm-workspace.yaml          packages: [packages/*, apps/*]
├── tsconfig.base.json           strict 共享 TS 基线
├── docs/
│   ├── requirements.md          原始需求（唯一需求依据）
│   ├── architecture.md          本文档
│   └── data-model.md            数据模型与存储设计
├── packages/
│   ├── shared/                  @bxverse/shared —— 共享类型与常量（已定稿，唯一跨包契约）
│   └── core/                    @bxverse/core —— 核心引擎（零运行时依赖）
└── apps/
    ├── server/                  @bxverse/server —— HTTP/API/SSE/静态托管
    ├── web/                     @bxverse/web —— Vue3 前端管理台
    └── cli/                     @bxverse/cli —— 命令薄壳
```

> 注：仓库中的 `verse/` 目录是早期参考原型，**不在 pnpm workspace 范围内**（glob 只含 `packages/*` 与 `apps/*`），不参与构建，仅作 UI 风格参考，代码不复用。

### 2.2 依赖方向（单向，严禁反向）

```
apps/@bxverse/web ──────┐
apps/@bxverse/server ───┼──► @bxverse/core ──► @bxverse/shared
apps/@bxverse/cli ──────┘
```

| 包 | 职责 | 允许依赖 | 禁止 |
|---|---|---|---|
| `@bxverse/shared` | 类型（`types.ts`）与常量（`constants.ts`），零依赖、纯 ESM，tsup 打包 | 无（不依赖任何包） | 任何运行时依赖；导入 core/server/web |
| `@bxverse/core` | 领域引擎：git 封装、版本计算、日志流水线、发布编排、存储（app.json / 数据仓库 / journal / 凭据）。**零第三方运行时依赖**（仅 Node 内置 + `child_process` spawn git） | 仅 `@bxverse/shared` | 任何 Web/HTTP 依赖；导入 server/web/cli |
| `@bxverse/server` | 进程入口与 HTTP 层：路由、鉴权、SSE、静态托管、发布队列。**零依赖 node:http** | `@bxverse/core`、`@bxverse/shared` | 导入 web（仅按路径读其 `dist/` 静态文件）；业务逻辑应下沉 core |
| `@bxverse/web` | 纯前端：Vue3 + Vite + TS + Naive UI + UnoCSS + Pinia + Vue Router + vite-plugin-pwa | `@bxverse/shared`（仅类型/常量） | 导入 core/server（前后端仅通过 HTTP/SSE 通信） |
| `@bxverse/cli` | `bx-manager` 命令薄壳：解析 BX_HOME/端口，spawn server 进程，打开浏览器 | `@bxverse/core`（仅路径解析） | 复制业务逻辑 |

**跨包契约**：web 与 server 之间唯一的数据契约是 `@bxverse/shared` 的类型 + REST/SSE 协议；core 内部可以有自己的私有类型（如 Journal 结构），但任何跨进程交换的领域数据必须使用 shared 类型。

### 2.3 构建顺序

`pnpm build`（根 script）：shared → core → server → cli → web。web 构建产物输出至 `apps/web/dist`，供 server 生产托管。

---

## 3. 进程模型

### 3.1 单进程形态

- 整个管理台由 **1 个 server 进程**承载：HTTP 服务、发布队列、SSE 广播、轮询检测、数据仓库操作全部在该进程内完成。
- 技术约束：Node ≥ 20（根 `package.json` engines），HTTP 用 `node:http` 零依赖实现；git 操作一律 `child_process.spawn('git', ...)`（零 npm 依赖）。
- 启动序列（`apps/server/src/index.ts`）：
  1. 解析 home 目录：环境变量 `BX_HOME` 优先，否则 `os.homedir()\.bxverse`。
  2. 读取 `app.json`（`AppConfig`）；缺失则写默认值（默认 `port=8899`＝`APP_DEFAULT_PORT`，`host=127.0.0.1`，`dataDir={home}/data`，`pwa.enabled=false`）。
  3. 确保目录：`data/`、`repos/`、`journal/`、`logs/`、`tmp/`。
  4. 数据仓库 ensure：不存在则 `git init` + 写 `.gitignore` + 首次 commit；存在且配了远程则尝试 pull（详见 data-model.md §9）。
  5. 扫描 `journal/`：发现 `running` 状态的残留任务 → 标记 `interrupted`，向 SSE 客户端广播警告（详见 §7 可靠性）。
  6. 启动轮询检测定时器（周期 `AppConfig.pollInterval`，默认 30000ms）。
  7. `http.createServer` 监听 `host:port`；若 `host` 不是回环地址则打印安全警告（仍按配置启动）。
  8. 打印访问 URL（`http://127.0.0.1:8899`）。
- 优雅退出：SIGINT/SIGTERM → 停止接收新请求 → 等待当前发布步骤完成或落 journal 断点 → 关闭全部 SSE 连接 → 退出。

### 3.2 HTTP 层结构与路由（apps/server/src/http + api）

统一约定：

- 所有响应 JSON；错误响应形如 `{ "error": "人类可读信息", "code": "MACHINE_CODE" }`，状态码语义化（400/401/403/404/409/500）。
- 中间件链：`router → auth（X-BX-Token + Origin 校验）→ 路由 handler → core 服务 → JSON 序列化`。
- `PublishEvent` 序列化后通过 SSE 推送（`event: publish\ndata: {json}\n\n`），与 REST 完全解耦。

| 方法 | 路径 | 用途 | 关键 shared 类型 |
|---|---|---|---|
| GET | `/api/auth/init` | 首次引导：无凭据时生成并返回会话 token（受 Origin 白名单限制，见 §6） | — |
| POST | `/api/auth/rotate` | 轮换 token（需旧 token） | — |
| GET | `/api/config` | 读取配置 | `AppConfig` |
| PUT | `/api/config` | 保存配置（发布进行中返回 409） | `AppConfig` |
| GET | `/api/overview` | 首页聚合 | `OverviewData` |
| GET | `/api/projects` | 项目列表 | `ProjectDef[]` |
| POST | `/api/projects` | 新建项目 | `ProjectDef` |
| GET/PUT/DELETE | `/api/projects/:id` | 项目详情/更新/删除（发布中 409） | `ProjectDef` |
| POST | `/api/projects/:id/repos` | 接入仓库：body 为 `{ path: string }`（本地路径，校验 .git）或 `CloneRequest`（URL 克隆） | `RepoDef` |
| GET | `/api/projects/:id/repos/:repoId/status` | 仓库状态 + 相对上次发布的提交（`fresh=true` 时强制实时检测） | `RepoStatus` |
| GET | `/api/projects/:id/repos/:repoId/tree?path=` | 目录懒加载（默认空 path 为根；`entries` 有上限，超出置 `truncated=true`） | `TreeNode` |
| GET | `/api/projects/:id/repos/:repoId/file?path=` | 文件内容（超限/二进制置 `truncated`/`binary`） | `FileContent` |
| POST | `/api/projects/:id/plan` | 生成发布计划（含 dry-run 预览数据） | 请求 `PublishRequest` → 响应 `PublishPlan` |
| POST | `/api/projects/:id/publish` | 提交发布任务，返回 `{ "taskId": string }`；队列忙返回 409 | `PublishRequest` |
| GET | `/api/publish/stream` | SSE 通道（全局单通道，单队列所以无需 taskId 过滤） | `PublishEvent` |
| GET | `/api/projects/:id/releases` | 项目发布历史 | `ReleaseRecord[]` |
| GET | `/api/releases/:id` | 单条发布记录 | `ReleaseRecord` |
| POST | `/api/system/sync` | 手动触发数据仓库 pull/push | — |

### 3.3 发布任务单队列与 SSE 事件流

- `PublishQueue`（server 内）：**全局单 FIFO 队列**，同一时刻最多 1 个发布任务运行；其余请求排队或返回 409（含队列位置）。
- 事件流：任务执行中，engine 每完成一个动作即向 SSE 通道广播一个 `PublishEvent`。事件序列示例（六步向导的第 5 步实时呈现）：

```
{"type":"step",      "message":"预检通过：3 个仓库待发布"}
{"type":"repo-start","repoId":"r_8k2m","message":"开始处理 l-pc-front"}
{"type":"log",       "message":"$ npm run build  (8.2s)"}
{"type":"step",      "message":"创建标签 build/v1.2.0.26081315 @ l-pc-front"}
{"type":"repo-done", "repoId":"r_8k2m","message":"l-pc-front → v1.2.0.26081315"}
{"type":"repo-error","repoId":"r_x9","message":"im-web 构建失败：exit 1（不影响已完成仓库）"}
{"type":"step",      "message":"写入项目发布记录 rel_p_3f1_v1.2.0"}
{"type":"done",      "message":"发布完成","data":{"releaseId":"rel_p_3f1_v1.2.0","version":"v1.2.0","failedRepos":["r_x9"]}}
```

- SSE 细节：`Content-Type: text/event-stream`；每 15s 心跳注释 `: ping`；`retry: 3000`；断线客户端重连后补发「当前任务状态」快照事件。
- `PublishEvent.type` 取值与语义：`log`（过程输出）/ `step`（阶段推进）/ `repo-start` / `repo-done` / `repo-error` / `done`（整任务结束，`data` 携带汇总）/ `error`（整任务失败）。

### 3.4 Web 静态托管与开发代理

- **生产**：server 托管 `apps/web/dist`。`/api/*` 走 API；其余路径查静态文件，非文件路径 SPA fallback 到 `index.html`（`vue-router` history 模式）。缓存策略：`index.html` 与 `manifest.webmanifest` 不缓存，带 hash 的产物 `Cache-Control: immutable`。
- **开发**：`pnpm dev` 并行启动 server(8899) 与 Vite dev server(5173)。`apps/web/vite.config.ts` 配置：

```ts
server: {
  proxy: {
    '/api': { target: 'http://127.0.0.1:8899', changeOrigin: false, ws: false }
  }
}
```

Vite 代理原生支持流式转发，SSE 可直通，无需 ws。开发时浏览器访问 `http://127.0.0.1:5173`。

### 3.5 CLI 薄壳

`bx-manager` 命令：`bx-manager start`（生产启动 server 并打开浏览器）、`bx-manager dev`（调起根 `pnpm dev`）、`bx-manager data-dir`（打印并打开数据目录）、`bx-manager status`（检查端口占用/数据仓库状态）。CLI 不承载业务逻辑。

---

## 4. 数据流（端到端）

从「代码有提交」到「发布记录落盘 + 多机同步」的完整链路：

```
业务仓库 HEAD 前进
   │
   ▼
[1] 轮询检测（server 定时器，pollInterval）
   git rev-list {lastPublishCommit}..HEAD → CommitInfo[] / Stats / DiffStat
   缓存 RepoStatus（changed = commits>0 || dirty>0）
   │
   ▼
[2] 前端总览（OverviewData）：首页卡片显示变动仓库/提交数/影响文件（R13）
   用户点击「发布」进入向导（六步）
   │
   ▼
[3] 向导六步（apps/web Publish.vue + stores/publish.ts）
   ① 检测变更：实时 status 聚合展示（提交列表、diff stat）
   ② 版本号：POST /api/projects/:id/plan → PublishPlan
       suggestedBump（feat→minor / breaking→major / fix→patch）
       projectVersion（vX.Y.Z 目标）、buildStamp（YYMMDDHH）、milestoneTag
       每仓库版本 v{projectVersion}.{buildStamp}（hybrid）或 vYYMMDDHH（timestamp）
   ③ 日志编辑：internalDraft / externalDraft 载入 LogEditor
       状态机 auto → edited → confirmed（两侧各自独立）
   ④ dry-run 预览：计划渲染为「将执行的命令清单」（build 命令/标签/文件写入/记录/推送）
   ⑤ 执行：POST /api/projects/:id/publish（携带 externalContent/internalContent）
       → 订阅 /api/publish/stream → 实时控制台
   ⑥ 完成：done 事件 → 展示发布卡片 + 跳转 History
   │
   ▼
[4] 发布执行（@bxverse/core publish/engine.ts，单队列内串行）
   每仓库（changed）：preflight → [buildCommand] → tag milestone → tag build
     → 写 version.json / version-history.json → 写仓库发布记录 → 更新 lastPublishCommit
   syncedOnly 仓库：仅同步基版 version.json（不建标签）
   项目：写项目发布记录（聚合 repos: RepoReleaseRef[]）
   远程联动：!offline 且 hasRemote → push --tags（失败仅警告降级）
   │
   ▼
[5] 记录落盘（@bxverse/core store/records.ts）
   releases/{scopeId}/{versionSafeName}/{data.json, internal.md, external.md}
   data/index.json、releases/{scopeId}/index.json 更新
   数据仓库 git add + commit（每发布一条 commit，message: "release({kind}:{scopeId}): {version}"）
   │
   ▼
[6] 多机同步（@bxverse/core store/dataRepo.ts）
   数据仓库 push（若配置远程且 !offline）；失败 → pushed=false + 警告
   启动时 pull --ff-only；冲突 → 保留本地 + 警告（人工解决）
```

轮询与发布的并发约束：发布执行期间暂停该项目的轮询检测，避免状态抖动。

---

## 5. 安全模型

### 5.1 网络边界

- 默认绑定 `127.0.0.1`（`AppConfig.host` 可改，改为非回环地址时启动打印高亮警告：无 TLS、建议仅在可信网络使用）。
- 无 TLS：本工具定位为单机工具，不内置 HTTPS；远程访问场景由用户自行套反向代理。

### 5.2 会话 token（X-BX-Token）

- 首次启动：`crypto.randomBytes(32).toString('hex')` 生成 token，写入 `~/.bxverse/credentials.json`（POSIX 权限 0600，Windows 尽力 ACL 收紧）。
- 浏览器侧：`GET /api/auth/init` 仅在「凭据存在但客户端未持有」时可用，且受 Origin 白名单约束（见 5.3）；前端把 token 存入 `sessionStorage`，由 `apps/web/src/api/http.ts` 统一注入 `X-BX-Token` 请求头。
- 服务端：除 `/api/auth/init` 外的全部 `/api/*` 必须携带合法 token，用 `crypto.timingSafeEqual` 比对；失败返回 401。
- 轮换：`POST /api/auth/rotate`（携带旧 token）原子替换 credentials.json 中的 token，旧 token 立即失效。
- **token 只走 Header，绝不使用 Cookie**（防 CSRF 与 XSS 窃取面收窄）；SSE 连接建连时同样要求 `X-BX-Token`（EventSource 无法带自定义头 → 前端用 `fetch` + `ReadableStream` 手动实现 SSE 订阅，见 web `api/http.ts`）。

### 5.3 CSRF 防护（Origin + Content-Type 校验）

对**所有状态变更请求（非 GET）**执行双重校验：

1. `Origin` 头存在时，必须命中白名单：`http://127.0.0.1:{port}`、`http://localhost:{port}`（port 取当前监听端口）；不命中 → 403。`Origin` 缺失（curl、同源 GET）放行，因为攻击者浏览器发起的跨站请求必然携带 Origin。
2. `Content-Type` 必须为 `application/json`（拒绝 form 提交形态的 CSRF 载荷）。

结论：第三方站点无法在不知道 token 的情况下携带合法请求头；即使诱骗浏览器发请求，Origin 校验也会拦截。

### 5.4 凭据独立存储

| 凭据 | 存放位置 | 规则 |
|---|---|---|
| 会话 token | `~/.bxverse/credentials.json` | 0600；不进数据仓库 |
| git 远程凭据（可选：token/SSH 密钥路径引用） | 同 credentials.json | 永不写入 `data/`、永不写入 `app.json`；数据仓库 `.gitignore` 兜底忽略 |
| AI apiKey | `AppConfig.ai.apiKey`（app.json） | 本机配置，随 app.json 原子写；不出本机、不进数据仓库 |

### 5.5 其余

- 路径穿越：文件树/文件内容接口对 `path` 参数做规范化校验，禁止 `..` 逃逸仓库根。
- 克隆校验：`CloneRequest.url` 仅允许 https/ssh 协议前缀；克隆目标固定 `~/.bxverse/repos/{projectId}/{repoId}/`。
- 错误信息不泄露本地绝对路径给非本机客户端（非回环绑定时脱敏）。

---

## 6. 可靠性设计

### 6.1 发布 journal（落盘 + 中断续跑）

- 位置：`~/.bxverse/journal/{taskId}.json`（不进数据仓库）。
- 结构（core 私有类型）：

```json
{
  "taskId": "t_20260813_1530_a1b2",
  "projectId": "p_3f1",
  "startedAt": "2026-08-13T15:30:00+08:00",
  "status": "running",
  "request": { "projectId": "p_3f1", "bump": "minor", "repoIds": ["r_8k2m", "r_x9"] },
  "steps": [
    { "seq": 0, "repoId": "r_8k2m", "phase": "tag-build", "state": "done",  "detail": "build/v1.2.0.26081315" },
    { "seq": 1, "repoId": "r_8k2m", "phase": "record",   "state": "running" }
  ]
}
```

- 写入时机：**每个 step 完成后原子写（tmp + rename）**。进程崩溃最多丢失最后一个未落盘 step。
- 恢复：启动时扫描 journal，`running` → 标记 `interrupted` 并向 SSE 广播警告；用户在 UI 重新发起同一发布 → engine 读取 journal，**幂等跳过 `done` 步骤**，从断点继续。所有 step 均设计为幂等（见 6.4）。

### 6.2 预检阻塞项（preflight，硬阻断）

发布执行前逐仓库检查，任一硬阻断则**整任务中止**并返回明确原因（SSE `error` 事件 + 提示）：

| 检查项 | 结果 | 处理 |
|---|---|---|
| 仓库路径存在且为有效 git 仓库（含 `.git`） | 否 | 阻断 |
| HEAD 非 detached | detached | 阻断 |
| 工作树 `dirty == 0` | dirty > 0 | 阻断（提示先提交或 stash） |
| `lastPublishCommit` 在当前历史中可达 | 不可达（force-push/GC 后） | 警告 + 按首次发布全量收集处理 |
| `buildCommand` 配置存在 | 执行失败 | 该仓库 `repo-error`，其余仓库继续（隔离） |
| milestone tag `vX.Y.Z` 已存在 | 存在且指向不同 commit | 阻断（要求 bump 版本） |
| build tag 同名 | 存在且指向不同 commit | 自动规避（buildStamp 追加序号，见 data-model.md §6.3） |
| 远程可达性（`!offline` 且有 remote） | 不可达 | 警告（降级纯本地，不阻断） |

### 6.3 失败隔离（不污染已完成仓库）

- 执行按仓库逐个串行，单仓库内 `try/catch`：失败 → 广播 `repo-error` → **跳过该仓库，继续下一仓库**。
- 已完成仓库保持已发布状态（标签、记录、`lastPublishCommit` 均已落定），绝不回滚污染。
- 任务结束时：≥1 个仓库成功 → 创建项目发布记录（`repos[]` 只含成功仓库，`PublishPlan.warnings` 记失败仓库，`done` 事件 `data` 携带 `failedRepos`）；0 个成功 → `error` 事件，不落任何记录。
- 失败仓库因 `lastPublishCommit` 未更新，下次轮询自动重新检测为「有变动」，可再次发布。

### 6.4 幂等与 tag 一致性

- 创建标签：先查询目标 commit 上是否已有同名 tag → 有且指向同一 commit → 跳过（幂等续跑安全）；指向不同 commit → build tag 走 buildStamp 序号规避，milestone tag 走预检阻断。
- 写 `version.json` / 发布记录：目标文件已存在 → 内容一致则跳过，不一致则报错（发布记录一经落盘不可变）。
- 更新 `lastPublishCommit`：以「标签已存在」为判定条件，重复执行不会前移基准。

---

## 7. 目录级文件清单

> 标注：`[已有]` 已存在；`[待建]` 规划中尚未创建。路径均相对 `G:\vibecoding\`。

```
G:\vibecoding\
├── package.json                       [已有] 根脚本 dev/build/typecheck/test/start
├── pnpm-workspace.yaml                [已有] packages/* 与 apps/*
├── tsconfig.base.json                 [已有] strict 基线
├── README.md                          [已有]
├── docs/
│   ├── requirements.md                [已有] 原始需求
│   ├── architecture.md                [已有] 本文档
│   └── data-model.md                  [已有] 数据模型与存储设计
├── packages/
│   ├── shared/                        [已有] 已定稿，不再增加字段（新增仅走 data-model.md「待扩展」）
│   │   ├── package.json               [已有] name=@bxverse/shared，tsup 打包
│   │   ├── tsconfig.json              [已有]
│   │   ├── tsup.config.ts             [已有]
│   │   └── src/
│   │       ├── index.ts               [已有] 汇总导出
│   │       ├── types.ts               [已有] 全部共享类型
│   │       └── constants.ts           [已有] SEMVER_RE/HYBRID_VERSION_RE/COMMIT_TYPES 等
│   └── core/                          [待建] 零运行时依赖引擎
│       ├── package.json               [待建] name=@bxverse/core；dep: @bxverse/shared；无第三方依赖
│       ├── tsconfig.json              [待建]
│       ├── tsup.config.ts             [待建]
│       └── src/
│           ├── index.ts               [待建] 汇总导出
│           ├── home.ts                [待建] BX_HOME 解析、目录确保（data/repos/journal/logs/tmp）
│           ├── git/
│           │   ├── client.ts          [待建] spawn git 封装（超时/错误归一）
│           │   ├── status.ts          [待建] branch/head/dirty/remote → RepoStatus
│           │   ├── commits.ts         [待建] range 提交解析 → CommitInfo[]/Stats/DiffStat
│           │   ├── tags.ts            [待建] tag 列表/创建（幂等）/校验
│           │   ├── clone.ts           [待建] 本地路径校验 .git、URL 克隆（https/ssh）
│           │   └── files.ts           [待建] 懒加载文件树（TreeNode/FileEntry/FileContent，DEFAULT_IGNORE_DIRS）
│           ├── version/
│           │   ├── index.ts           [待建] 三方案版本计算（semver/hybrid/timestamp）
│           │   ├── bump.ts            [待建] BumpType 推断（breaking→major/feat→minor/fix→patch）
│           │   ├── stamp.ts           [待建] buildStamp 生成与撞名规避（YYMMDDHH + 序号）
│           │   └── parse.ts           [待建] SEMVER_RE/HYBRID_VERSION_RE 校验
│           ├── logs/
│           │   ├── index.ts           [待建] 日志流水线入口（生成/编辑/确认）
│           │   ├── internal.ts        [待建] 对内日志模板（全量：提交/文件/统计）
│           │   ├── external.ts        [待建] 对外日志模板（EXTERNAL_SECTIONS + externalExclude）
│           │   └── diff.ts            [待建] autoDraft vs content 行级 LCS diff
│           ├── publish/
│           │   ├── plan.ts            [待建] 变更检测→版本→日志草稿→PublishPlan（含 warnings）
│           │   ├── engine.ts          [待建] 发布执行编排（串行、事件回调、幂等 step）
│           │   ├── preflight.ts       [待建] §6.2 预检阻塞项
│           │   └── journal.ts         [待建] journal 落盘/扫描/恢复
│           ├── backup/（R19/M6 扩展）
│           │   ├── index.ts           [待建] 备份编排 backupRepo()（幂等、失败策略 warn/fail、元数据落 data/backups/）
│           │   ├── source.ts          [待建] git bundle + git archive 源码备份（遵循 .gitignore）
│           │   ├── artifact.ts        [待建] 产物目录归档 + manifest（RepoDef.artifactDir）
│           │   ├── manifest.ts        [待建] 目录→哈希清单（流式 sha256 + totals）
│           │   └── tar.ts             [待建] 零依赖 ustar tar.gz（pax 长路径/中文头）
│           ├── compare/（R19/M6 扩展）
│           │   └── index.ts           [待建] 三层对比：git diff / 清单对比 / manifest 校验 → CompareResult
│           ├── store/
│           │   ├── config.ts          [待建] app.json 读写（原子写、默认值、BX_HOME）
│           │   ├── records.ts         [待建] releases/{scopeId}/{versionSafeName}/ 读写
│           │   ├── dataRepo.ts        [待建] 数据仓库 git init/commit/pull/push/remote
│           │   └── credentials.ts     [待建] credentials.json 读写（0600）
│           ├── detect/
│           │   └── poll.ts            [待建] 轮询检测 + RepoStatus 缓存（TTL=pollInterval）
│           └── ai/
│               └── client.ts          [待建] 可选 AI 日志润色（读 AppConfig.ai，未启用时短路）
├── apps/
│   ├── server/                        [待建]
│   │   ├── package.json               [待建] name=@bxverse/server；dep: @bxverse/core、@bxverse/shared；engines node>=20
│   │   ├── tsconfig.json              [待建]
│   │   └── src/
│   │       ├── index.ts               [待建] 启动序列/信号处理（§3.1）
│   │       ├── http/
│   │       │   ├── router.ts          [待建] 路由表 + 中间件链
│   │       │   ├── auth.ts            [待建] X-BX-Token + Origin/Content-Type 校验
│   │       │   ├── json.ts            [待建] 请求体解析/错误响应封装
│   │       │   └── static.ts          [待建] web/dist 静态托管 + SPA fallback
│   │       ├── api/
│   │       │   ├── config.ts          [待建] GET/PUT /api/config
│   │       │   ├── auth.ts            [待建] /api/auth/init、/api/auth/rotate
│   │       │   ├── projects.ts        [待建] 项目 CRUD
│   │       │   ├── repos.ts           [待建] 仓库接入/状态/移除
│   │       │   ├── files.ts           [待建] 文件树/文件内容
│   │       │   ├── publish.ts         [待建] plan/publish
│   │       │   ├── history.ts         [待建] 发布历史
│   │       │   ├── overview.ts        [待建] 首页聚合
│   │       │   ├── sync.ts            [待建] /api/system/sync
│   │       │   └── backups.ts         [待建] R19/M6 备份列表/下载/删除/对比/校验（api.md §10.5）
│   │       │   └── sync.ts            [待建] /api/system/sync
│   │       ├── queue.ts               [待建] PublishQueue 单队列
│   │       └── sse.ts                 [待建] SSE 连接管理/心跳/广播（fetch-流兼容）
│   ├── web/                           [待建]（verse/web 仅作风格参考，不复用）
│   │   ├── package.json               [待建] dep: vue/naive-ui/pinia/vue-router/vite-plugin-pwa；
│   │   │                              devDep: vite/@vitejs/plugin-vue/typescript/unocss 等
│   │   ├── vite.config.ts             [待建] §3.4 代理 + PWA 插件（registerType: 'autoUpdate'）
│   │   ├── uno.config.ts              [待建] presetUno + presetIcons（@iconify-json/carbon）
│   │   ├── tsconfig.json              [待建]
│   │   ├── index.html                 [待建]
│   │   ├── public/                    [待建] PWA 图标/robots（本地工具可无）
│   │   └── src/
│   │       ├── main.ts                [待建] createApp + pinia + router + naive + uno.css
│   │       ├── App.vue                [待建] 布局壳：主题切换/命令面板挂载/全局消息
│   │       ├── env.d.ts               [待建]
│   │       ├── api/
│   │       │   ├── http.ts            [待建] fetch 封装：X-BX-Token 注入、错误归一、
│   │       │   │                      fetch-流式 SSE 订阅（§5.2）
│   │       │   └── index.ts           [待建] §3.2 各资源 API
│   │       ├── stores/
│   │       │   ├── config.ts          [待建] AppConfig + pwa.enabled 运行时开关
│   │       │   ├── projects.ts        [待建] 项目/仓库列表与状态
│   │       │   ├── publish.ts         [待建] 六步向导状态机（step/repoIds/日志状态）
│   │       │   └── ui.ts              [待建] 主题/命令面板显隐
│   │       ├── router/index.ts        [待建] 路由：/ /projects /publish /history /settings
│   │       ├── views/
│   │       │   ├── Dashboard.vue      [待建] 总览（R2/R13 变动仓库聚合）
│   │       │   ├── Projects.vue       [待建] 项目/仓库管理（接入两种方式，R2/R3）
│   │       │   ├── Publish.vue        [待建] 六步发布向导（R9/R14）
│   │       │   ├── History.vue        [待建] 发布历史（R5/R6/R7 双轨日志查看）
│   │       │   └── Settings.vue       [待建] 配置（PWA/R10 双模式/AI/数据仓库同步）
│   │       ├── components/
│   │       │   ├── RepoTree.vue       [待建] 懒加载文件树（R4）
│   │       │   ├── LogEditor.vue      [待建] 双轨日志编辑器（状态徽标 + 草稿 diff，R14）
│   │       │   ├── DiffView.vue       [待建] autoDraft vs content 对比
│   │       │   ├── PublishConsole.vue [待建] SSE 实时控制台
│   │       │   ├── CommandPalette.vue [待建] ⌘K 命令面板
│   │       │   └── EmptyState.vue     [待建] 空状态引导
│   │       └── pwa/register.ts        [待建] 按 AppConfig.pwa.enabled 动态注册（main.ts 加载配置后 import）
│   └── cli/                           [待建]
│       ├── package.json               [待建] name=@bxverse/cli，bin: { "bx-manager": "./dist/index.js" }
│       ├── tsconfig.json              [待建]
│       └── src/index.ts               [待建] §3.5 四个子命令
└── verse/                             [已有] 参考原型，不在 workspace，不参与构建
```

---

## 8. 与需求文档的对应关系

| 本文章节 | 对应需求编号 | 说明 |
|---|---|---|
| §1.2 原则一「数据权威工具无痕」 | R15、R10 | 不迁就旧实现；纯本地/远程双模式互不污染 |
| §1.2 原则二「自动为先人审为终」 | R9、R14 | 自动生成 + 人工编辑确认 |
| §1.2 原则三「优雅可用」 | R16、R17 | 好用、UIUX 精致 |
| §2 Monorepo 结构 | R1（客户端形态：本地 Web） | web/server/cli 三端 + shared/core 两包 |
| §3.3 发布单队列与 SSE | R9、可靠性·单队列 | 发布任务串行、实时日志 |
| §3.4 静态托管/PWA | R1 | 本地 Web + 可选 PWA 替代桌面壳 |
| §4 数据流（六步向导） | R5、R6、R9、R13、R14 | 版本/日志/改动点全流程 |
| §4 仓库接入（本地路径+URL 克隆） | R3、R4 | 两种接入方式、文件树查看 |
| §5 安全模型 | 非功能·安全 | 127.0.0.1、防 CSRF、凭据独立、token 走 Header |
| §6 可靠性设计 | 非功能·可靠性/自动化 | journal 续跑、预检、失败隔离、tag 幂等 |
| §7 文件清单 | R15、R16 | 完整落地蓝图 |
| 双轨日志（internal/external） | R7、R14 | 对外分节、对内全量，状态机见 data-model.md §7 |
| 版本联动（R12） | 见 data-model.md §6.4 | 仓库随项目基版、未变动仓库同步基版 |

> R8（版本号方案可配）、R11（初始 6 工程入「默认项目」）、R12（版本联动细节）在 `docs/data-model.md` 中展开。
