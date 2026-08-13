# bxverse 服务端 API 设计

> 文档版本：v0.1（2026-08-13）
> 依据：`docs/requirements.md`（唯一需求依据）、`docs/architecture.md`（总体架构）、`packages/shared/src/types.ts`（定稿共享类型）、`packages/shared/src/constants.ts`（定稿常量）。
> 读者：后续开发 agent。本文中所有 JSON 字段名与 `types.ts` 一字不差；实现文件路径均为建议路径（`apps/server/src/...`）。
> 本文对 `architecture.md` §3.2 的路由表做了 4 处修订，见文末「§11 与 architecture.md 的差异」。

---

## 1. 通用约定

### 1.1 Base 与编码

| 项 | 约定 |
|---|---|
| Base | `http://127.0.0.1:8899/api`（生产）；开发时浏览器访问 `http://127.0.0.1:5173`，由 Vite 将 `/api` 代理到 8899（见 architecture.md §3.4） |
| 编码 | 请求/响应均为 UTF-8；响应 `Content-Type: application/json; charset=utf-8`；API 响应一律 `Cache-Control: no-store` |
| 静态托管 | 生产模式下非 `/api/` 前缀的路径由 server 托管 `apps/web/dist`（SPA fallback 到 `index.html`），实现于 `apps/server/src/http/static.ts` |
| 时间 | 全部时间字符串使用 ISO 8601 带时区（`2026-08-13T15:30:00+08:00`）；日期字段（`CommitInfo.date`、`ReleaseRecord.date`）为 `YYYY-MM-DD` |

### 1.2 错误格式

所有非 2xx 响应的 JSON 体统一为：

```json
{ "error": "人类可读信息", "code": "MACHINE_CODE" }
```

| 状态码 | 含义 |
|---|---|
| 400 | 参数/请求体校验失败（`VALIDATION`、`REPO_INVALID`、`CLONE_FAILED`） |
| 401 | token 缺失或错误（`UNAUTHORIZED`） |
| 403 | Origin / Content-Type 校验失败（`FORBIDDEN`） |
| 404 | 资源不存在（`NOT_FOUND`） |
| 409 | 冲突：发布进行中 / 队列忙 / 同步冲突（`PUBLISH_RUNNING`、`TASK_BUSY`、`SYNC_CONFLICT`） |
| 500 | 未预期内部错误（`INTERNAL`、`GIT_FAILED`） |

全局错误码表：

| code | 状态码 | 含义 |
|---|---|---|
| `UNAUTHORIZED` | 401 | 请求头 `X-BX-Token` 缺失或与 `credentials.json` 不符 |
| `FORBIDDEN` | 403 | 非 GET 请求的 `Origin` 不在白名单，或 `Content-Type` 非 `application/json` |
| `VALIDATION` | 400 | 参数/JSON 体非法（字段缺失、类型错误、枚举越界、路径越界） |
| `NOT_FOUND` | 404 | 项目/仓库/记录/任务不存在 |
| `REPO_INVALID` | 400 | 本地路径不是有效 git 仓库（无 `.git`）或不是目录 |
| `CLONE_FAILED` | 400 | 克隆失败（`error` 中含 git stderr 摘要） |
| `TASK_BUSY` | 409 | 发布队列非空（单队列已满） |
| `PUBLISH_RUNNING` | 409 | 目标项目正在发布中，禁止修改项目/仓库定义 |
| `SYNC_CONFLICT` | 409 | 数据仓库 pull 冲突（保留本地，人工解决） |
| `GIT_FAILED` | 500 | git 调用意外失败 |
| `INTERNAL` | 500 | 其他未预期错误 |

实现：`apps/server/src/http/json.ts`（`sendError(res, status, code, message)`、`readJsonBody(req)`）。

### 1.3 认证与 CSRF 规则（X-BX-Token）

1. **token 生成与存储**：server 启动时读取 `~/.bxverse/credentials.json`；不存在则 `crypto.randomBytes(32).toString('hex')` 生成并以 0600 权限原子写入。重启不换 token。实现：`apps/server/src/http/auth.ts`。
2. **token 下发**：唯一免 token 端点 `GET /api/config` 在响应中直接返回 token；该端点与其他 GET 一样**绝不设置 CORS 头**，跨源页面无法读取响应体，故安全。
3. **携带方式**：除 `GET /api/config` 外的全部 `/api/*` 请求（含 GET）必须携带请求头 `X-BX-Token`，服务端用 `crypto.timingSafeEqual` 比对；失败返回 401。**token 只走 Header，绝不使用 Cookie**。
4. **前端引导流程**：页面加载 → `GET /api/config`（无 token）→ 将 token 存入 `sessionStorage` → 后续请求统一注入头（`apps/web/src/api/http.ts`）；收到 401 时重新执行引导一次，仍失败则提示「会话失效」。
5. **非 GET 请求双重校验**（所有状态变更端点）：
   - `Origin` 头存在时，必须命中白名单 `http://127.0.0.1:*` 或 `http://localhost:*`（任意端口，覆盖 Vite dev 的 5173）；不命中 → 403。`Origin` 缺失（curl、同源导航）放行——跨站浏览器请求必然携带 Origin。
   - `Content-Type` 必须为 `application/json`，拒绝 form 载荷。
   - 结论：第三方站点既无法携带合法 token（自定义头触发预检），预检也不会被本服务响应（无 CORS 头），Origin 校验再加一道兜底。
6. **SSE 特例**：`GET /api/events` 接受两种订阅方式（见 §8.2）：fetch 流式订阅携带 `X-BX-Token` 头；原生 `EventSource` 无法带自定义头，服务端对无 token 的 SSE 请求仅在 `Origin` 缺失或命中白名单时放行（SSE 响应同样无 CORS 头，跨源不可读）。事件内容本身不含敏感凭据。

### 1.4 发布锁与并发约定

- 全局单 FIFO 发布队列（`apps/server/src/queue.ts`）：同时最多 1 个任务执行；新任务在队列忙时返回 409 `TASK_BUSY`。
- 任务执行期间，其 `projectId` 进入**项目锁**：对该项目的项目/仓库定义类变更（`/api/projects` 系列写操作）返回 409 `PUBLISH_RUNNING`。
- 轮询检测在发布执行期间暂停该项目（避免状态抖动）。

---

## 2. 端点总览

| 方法 | 路径 | 用途 | 关键 shared 类型 | 实现文件 |
|---|---|---|---|---|
| GET | `/api/config` | 引导 + 读配置（含 token） | `AppConfig` | `apps/server/src/api/config.ts` |
| POST | `/api/config` | 部分更新配置 | — | `apps/server/src/api/config.ts` |
| GET | `/api/overview` | 首页聚合 | `OverviewData` | `apps/server/src/api/overview.ts` |
| GET | `/api/projects` | 项目列表 | `ProjectDef[]` | `apps/server/src/api/projects.ts` |
| POST | `/api/projects` | 新建项目 | `ProjectDef` | `apps/server/src/api/projects.ts` |
| PATCH | `/api/projects/:id` | 更新项目 | `ProjectDef` | `apps/server/src/api/projects.ts` |
| DELETE | `/api/projects/:id` | 删除项目 | — | `apps/server/src/api/projects.ts` |
| POST | `/api/projects/:id/repos` | 接入仓库（本地路径 / 克隆） | `RepoDef` | `apps/server/src/api/repos.ts` |
| PATCH | `/api/projects/:id/repos/:rid` | 更新仓库定义 | `RepoDef` | `apps/server/src/api/repos.ts` |
| DELETE | `/api/projects/:id/repos/:rid` | 移除仓库 | — | `apps/server/src/api/repos.ts` |
| GET | `/api/repos/:pid/:rid/status` | 仓库状态（含相对上次发布的提交） | `RepoStatus` | `apps/server/src/api/repos.ts` |
| GET | `/api/repos/:pid/:rid/tree` | 目录懒加载 | `TreeNode` | `apps/server/src/api/files.ts` |
| GET | `/api/repos/:pid/:rid/file` | 文件内容 | `FileContent` | `apps/server/src/api/files.ts` |
| GET | `/api/projects/:id/releases` | 项目发布历史 | `ReleaseRecord[]` | `apps/server/src/api/history.ts` |
| GET | `/api/releases` | 按 scope+版本查发布记录（含日志内容） | `ReleaseRecord` | `apps/server/src/api/history.ts` |
| PATCH | `/api/releases/:id/log` | 编辑双轨日志（state 流转） | `ReleaseRecord` | `apps/server/src/api/history.ts` |
| POST | `/api/publish` | dry-run 预览 / 提交发布任务 | `PublishPlan` / `{taskId}` | `apps/server/src/api/publish.ts` |
| GET | `/api/events` | SSE 事件流 | `PublishEvent` | `apps/server/src/api/events.ts` |
| POST | `/api/sync` | 数据仓库 pull/push/commit/status | — | `apps/server/src/api/sync.ts` |
| POST | `/api/auth/rotate` | 轮换 token（可选） | — | `apps/server/src/http/auth.ts` |
| GET | `/api/publish/current` | 当前任务查询（可选，续跑 UI） | — | `apps/server/src/api/publish.ts` |

---

## 3. 配置与引导

### 3.1 GET /api/config（免 token）

用途：应用引导（拿 token）+ 读取配置 + 项目概要。**唯一免 token 端点**；响应不含 CORS 头。

查询参数：无。

响应 `200`：

```json
{
  "token": "9f2c8e41a3b06d75f04c92e1aa88d3c6b7f0e2d94158a0c3f6b1e7d2a90c45ef",
  "config": {
    "port": 8899,
    "host": "127.0.0.1",
    "theme": "system",
    "pwa": { "enabled": true },
    "dataDir": "C:\\Users\\me\\.bxverse",
    "pollInterval": 30000,
    "ai": { "enabled": false, "baseUrl": "", "model": "", "apiKey": "" },
    "projects": [
      { "id": "p_3f1", "name": "主产品线", "version": "v1.2.0", "repoCount": 6 }
    ]
  }
}
```

- `config` 各字段与 `AppConfig` 一致，**唯 `projects` 为概要数组**（`id/name/version/repoCount`），完整定义走 `GET /api/projects`。
- `ai.apiKey` 按原值返回（仅供同源页面回显编辑；GET 无 CORS 头，不会泄露到跨源上下文）。
- `dataDir` 由 `BX_HOME` 或 `~\.bxverse` 派生，只读。

### 3.2 POST /api/config

用途：部分更新配置。仅接受 `pwa/theme/pollInterval/ai` 四个顶层键；**port/host/dataDir/projects 不支持在线修改**。

请求体（字段均可选；`pwa`/`ai` 为整键替换语义）：

```json
{
  "theme": "dark",
  "pwa": { "enabled": false },
  "pollInterval": 15000,
  "ai": { "enabled": true, "baseUrl": "http://127.0.0.1:11434/v1", "model": "qwen2.5:7b", "apiKey": "" }
}
```

校验规则：
- `theme` ∈ `light|dark|system`；`pollInterval` 为整数，范围 `[5000, 3600000]`；`pwa.enabled` 布尔；`ai.*` 字符串/布尔。
- 出现 `port/host/dataDir/projects` 字段 → 400 `VALIDATION`（提示「该字段不支持在线修改」）。

响应 `200`：与 GET 相同的 `{ "config": { ... } }` 结构（**不含 token**）。

错误：400 `VALIDATION`（枚举越界/类型错误）。

实现：`apps/server/src/api/config.ts`；底层 `saveAppConfig`（原子写）在 `@bxverse/core` store.ts。

---

## 4. 总览

### 4.1 GET /api/overview用途：首页聚合（项目卡片 + 变动仓库列表，对应 R2/R13）。数据来自轮询检测缓存（TTL=`pollInterval`），不做实时 git 查询。

查询参数：无。

响应 `200`（`OverviewData`）：

```json
{
  "projectCount": 2,
  "repoCount": 8,
  "changedRepoCount": 3,
  "projects": [
    {
      "id": "p_3f1",
      "name": "主产品线",
      "version": "v1.2.0",
      "repoCount": 6,
      "changedRepoCount": 3,
      "lastRelease": { "version": "v1.1.0", "date": "2026-08-01" }
    }
  ],
  "changedRepos": [
    {
      "projectId": "p_3f1",
      "projectName": "主产品线",
      "repoId": "r_8k2m",
      "repoName": "l-pc-front",
      "head": "9d4f2a1",
      "commits": 12
    }
  ]
}
```

- `changedRepos` 仅包含 `RepoStatus.changed === true` 的仓库（`commits>0`），按项目分组排序。
- `lastRelease` 来自数据仓库 `data/releases/{scopeId}/index.json` 最新一条；无发布则为 `null`。

实现：`apps/server/src/api/overview.ts`；底层 `@bxverse/core` engine.detectChanged + DataStore。

---

### 4.2 GET /api/projects/:id/versions（R18，MVP）

用途：导出项目下**所有仓库的版本清单**，JSON 数组，字段 `app`（仓库英文名）/ `name`（仓库中文名）/ `version`（版本号）。中文名缺省时回退英文名；版本号取业务仓库 `version.json` 的当前版本，未生成时回退项目统一版本。

响应 `200`（`RepoVersionItem[]`）：

```json
[
  { "app": "l-pc-front", "name": "PC 前端", "version": "v1.2.0.26081315" },
  { "app": "l-data-v", "name": "数据可视化", "version": "v1.2.0.26081315" }
]
```

- `RepoDef.displayName` 承载中文名（仓库 PATCH 可写，接入弹窗/设置页可填）。
- 该端点实时读取（fresh），不依赖轮询缓存。

错误：404 `NOT_FOUND`（项目不存在）。

实现：`apps/server/src/api/versions.ts`；前端「导出版本清单」按钮下载 `{项目名}-versions.json`。

### 4.3 POST /api/projects/:id/versions/export（R18：写入指定仓库）

用途：把生成的版本清单 JSON **写入项目下某个仓库的指定相对路径**（工作树文件，工具不 commit，由用户自行提交）。

请求体：

```json
{ "repoId": "r_8k2m", "path": "versions.json" }
```

| 字段 | 说明 |
|---|---|
| `repoId` | 必填；必须属于该项目 |
| `path` | 必填；相对仓库根的路径，必须以 `.json` 结尾；禁止绝对路径与 `..` 越界 |

响应 `200`：

```json
{
  "ok": true,
  "repoId": "r_8k2m",
  "path": "versions.json",
  "fullPath": "E:\\bx-gitee\\l-pc-front\\versions.json",
  "count": 6,
  "items": [ { "app": "l-pc-front", "name": "PC 前端", "version": "v1.2.0.26081315" } ]
}
```

- 写入前自动创建父目录；内容为格式化 JSON 数组 + 末尾换行。
- 错误：404（项目/仓库不存在或不属于该项目）；400 `VALIDATION`（字段缺失、非 `.json`、路径越界）；400 `REPO_INVALID`（仓库路径失效）。
- 前端交互（File System Access API）：「另存为文件」走原生 `showSaveFilePicker`（不支持时回退浏览器下载）；「写入项目仓库」弹窗内**树形目录选择器点选目标目录**（不手填路径，记住上次选择）；「导出到本地目录」走原生 `showDirectoryPicker` 选择任意本地目录后经句柄直接写入。注：浏览器安全限制下系统选择器不返回绝对路径，因此仓库内写入由后端路径 + 树选择器承担。

实现：`apps/server/src/api/versions.ts`；前端导出按钮下拉「写入指定仓库」弹窗（目标仓库 + 路径，记住上次选择）。

---

## 5. 项目

### 5.1 GET /api/projects

响应 `200`：`ProjectDef[]`（完整定义，含 `repos`）：

```json
[
  {
    "id": "p_3f1",
    "name": "主产品线",
    "description": "PC/小程序前端矩阵",
    "version": "v1.2.0",
    "bump": "auto",
    "repoVersionScheme": "hybrid",
    "externalExclude": ["chore", "docs", "test", "style", "ci", "build", "revert"],
    "repos": [
      {
        "id": "r_8k2m",
        "name": "l-pc-front",
        "path": "E:\\bx-gitee\\l-pc-front",
        "remote": "git@gitee.com:bx/l-pc-front.git",
        "buildCommand": "pnpm build",
        "outputDir": "public",
        "writeVersionFile": true,
        "lastPublishCommit": "8c3e9f2a1b...",
        "createdAt": "2026-08-01T09:00:00+08:00"
      }
    ],
    "createdAt": "2026-08-01T09:00:00+08:00",
    "updatedAt": "2026-08-13T10:00:00+08:00"
  }
]
```

### 5.2 POST /api/projects

请求体（`id/version/repos` 由服务端生成，忽略传入值）：

```json
{ "name": "主产品线", "description": "PC/小程序前端矩阵" }
```

服务端默认值：`id = "p_" + base36(3位随机)`、`version = "v0.1.0"`、`bump = "auto"`、`repoVersionScheme = "hybrid"`、`externalExclude = DEFAULT_EXTERNAL_EXCLUDE`、`repos = []`。

响应 `201`：完整 `ProjectDef`（结构同 5.1）。

错误：400 `VALIDATION`（`name` 缺失/空/与现有项目重名）；409 `PUBLISH_RUNNING`（任一项目发布中时全局禁止新建，简化锁粒度）。

### 5.3 PATCH /api/projects/:id

请求体（全部可选，部分更新语义）：

```json
{
  "name": "主产品线（新）",
  "description": "...",
  "bump": "manual",
  "repoVersionScheme": "timestamp",
  "externalExclude": ["chore", "docs"]
}
```

- 允许字段：`name / description / bump / repoVersionScheme / externalExclude`。**`version` 不可直接改**（只随发布 bump）；`repos` 的增删改走 §6。
- `externalExclude` 必须为 `CommitType` 子集。

响应 `200`：更新后的完整 `ProjectDef`。

错误：404 `NOT_FOUND`；400 `VALIDATION`（重名/枚举非法）；409 `PUBLISH_RUNNING`（该项目正在发布）。

### 5.4 DELETE /api/projects/:id

查询参数：`purge`（可选，布尔，默认 `false`）。`purge=true` 时连带删除克隆目录 `~/.bxverse/repos/{projectId}/`；**本地路径接入的业务仓库绝不触碰**。

响应 `200`：

```json
{ "ok": true, "purged": false }
```

错误：404 `NOT_FOUND`；409 `PUBLISH_RUNNING`（该项目正在发布）。

---

## 6. 仓库

### 6.1 POST /api/projects/:id/repos

用途：两种接入方式（R3），二选一：

**方式 A：本地路径**（校验 `.git`）：

```json
{ "path": "E:\\bx-gitee\\l-pc-front" }
```

- 校验：路径存在、为目录、含 `.git`（`isRepo`）；`name` 默认取目录 basename；`remote` 自动读取 origin（可无）。
- 幂等：同项目内已存在同 `path` 的仓库 → 返回 200 已有 `RepoDef`（幂等接入），避免误重复。

**方式 B：Git 地址克隆**（`CloneRequest`）：

```json
{ "url": "git@gitee.com:me/l-pc-front.git", "name": "l-pc-front", "shallow": false }
```

- `url` 仅允许 `https://`、`ssh://` 或 `git@`（scp-like）前缀；克隆目标固定 `~/.bxverse/repos/{projectId}/{safeName}`（`safeName` 取 `name` 或 URL basename，过滤 `..` 与路径分隔符）。
- `shallow=true` → `git clone --depth 1`。
- 克隆为同步请求，服务端超时 120s（大仓库建议 shallow）。

响应 `201`：完整 `RepoDef`：

```json
{
  "id": "r_8k2m",
  "name": "l-pc-front",
  "path": "E:\\bx-gitee\\l-pc-front",
  "remote": "git@gitee.com:bx/l-pc-front.git",
  "buildCommand": "pnpm build",
  "outputDir": "public",
  "writeVersionFile": true,
  "lastPublishCommit": null,
  "createdAt": "2026-08-13T10:00:00+08:00"
}
```

默认值：`buildCommand` 不填（无构建）；`outputDir = "public"`；`writeVersionFile = true`；`lastPublishCommit = null`（首次纳入即全量基线，发布一次后更新）。

错误：404 `NOT_FOUND`（项目）；400 `VALIDATION`（`path` 与 `url` 同时/均未提供、URL 协议非法、`name` 含非法字符）；400 `REPO_INVALID`（本地路径非 git 仓库）；400 `CLONE_FAILED`（克隆失败，`error` 含 stderr 摘要）；409 `PUBLISH_RUNNING`。

### 6.2 PATCH /api/projects/:id/repos/:rid

请求体（可选字段，部分更新）：

```json
{
  "name": "l-pc-front",
  "buildCommand": "pnpm build",
  "outputDir": "public",
  "writeVersionFile": false,
  "path": "E:\\bx-gitee\\l-pc-front-v2"
}
```

- 允许字段：`name / buildCommand / outputDir / writeVersionFile / path`。`path` 变更时重新校验 `.git`；`id/remote/lastPublishCommit` 不可改。

响应 `200`：更新后的 `RepoDef`。

错误：404；400 `VALIDATION` / `REPO_INVALID`；409 `PUBLISH_RUNNING`。

### 6.3 DELETE /api/projects/:id/repos/:rid

查询参数：`purge`（可选，默认 `false`）。`purge=true` 且该仓库为克隆接入（路径位于 `~/.bxverse/repos/` 内）时删除克隆目录；本地路径仓库只移除管理记录。

响应 `200`：`{ "ok": true, "purged": false }`

错误：404；409 `PUBLISH_RUNNING`。

### 6.4 GET /api/repos/:pid/:rid/status

查询参数：`fresh`（可选，布尔，默认 `false`）。`fresh=true` 强制实时 git 查询（向导第①步用）；默认读轮询缓存（TTL=`pollInterval`）。

响应 `200`（`RepoStatus`）：

```json
{
  "id": "r_8k2m",
  "name": "l-pc-front",
  "path": "E:\\bx-gitee\\l-pc-front",
  "branch": "develop",
  "head": "9d4f2a1c3b5e7f8a9d0b1c2d3e4f5a6b7c8d9e0f",
  "dirty": 0,
  "hasRemote": true,
  "remoteUrl": "git@gitee.com:bx/l-pc-front.git",
  "versionFile": { "version": "v1.1.0.26080110", "build": "26080110", "buildTime": "2026-08-01T10:00:00+08:00" },
  "buildTags": ["build/v1.1.0.26080110"],
  "milestoneTag": "v1.1.0",
  "changed": true,
  "lastPublishCommit": "8c3e9f2a1b...",
  "commits": [
    {
      "hash": "9d4f2a1",
      "fullHash": "9d4f2a1c3b5e7f8a9d0b1c2d3e4f5a6b7c8d9e0f",
      "author": "张三",
      "date": "2026-08-12",
      "subject": "feat: 支持暗色主题",
      "type": "feat",
      "scope": null,
      "breaking": false,
      "files": ["src/theme/index.ts", "src/theme/vars.css"]
    }
  ]
}
```

- `versionFile` 读自 `{outputDir}/version.json`，不存在为 `null`。
- `buildTags` 为 `build/` 前缀标签列表（`listTags("build/*")`）；`milestoneTag` 为匹配 `vX.Y.Z` 的最近里程碑标签（无则 `null`）。
- `commits` 为 `lastPublishCommit..HEAD`（`null` 基线时按首次发布全量收集，见 core-engine.md）。

错误：404（项目/仓库不存在）；400 `REPO_INVALID`（路径失效）。

### 6.5 GET /api/repos/:pid/:rid/tree?path=

查询参数：`path`（可选，相对仓库根的目录路径，默认空 = 根）。

响应 `200`（`TreeNode`）：

```json
{
  "path": "src",
  "entries": [
    { "name": "api", "type": "dir", "size": 0 },
    { "name": "components", "type": "dir", "size": 0 },
    { "name": "main.ts", "type": "file", "size": 1234 }
  ],
  "truncated": false
}
```

- 排序：目录在前，各自按名称字典序；目录 `size` 恒为 0。
- 忽略 `DEFAULT_IGNORE_DIRS`（`.git/node_modules/dist/...`）。
- `entries` 上限 200 条，超出置 `truncated: true`（前端展示「…」并提示目录过大）。
- 路径规范化：拒绝 `..`、绝对路径、`~` 逃逸，否则 400 `VALIDATION`。

错误：404（仓库/路径不存在）；400 `VALIDATION`（路径越界）；400 `REPO_INVALID`。

### 6.6 GET /api/repos/:pid/:rid/file?path=

查询参数：`path`（必填，相对仓库根的文件路径）。

响应 `200`（`FileContent`）：

```json
{
  "path": "src/main.ts",
  "size": 1234,
  "binary": false,
  "truncated": false,
  "content": "import { createApp } from 'vue'\n// ...",
  "lines": 42
}
```

- `binary`：前 8KB 含 NUL 字节判为二进制，此时 `content = ""`。
- `truncated`：超过 256KB 截断（`content` 为前 256KB，`lines` 为截断部分行数）。
- 路径校验同 6.5。

错误：404（文件不存在或为目录）；400 `VALIDATION`；400 `REPO_INVALID`。

---

## 7. 发布历史与日志编辑

### 7.1 GET /api/projects/:id/releases?n=

查询参数：`n`（可选，整数，默认 20，上限 100；按日期倒序取前 n 条）。

响应 `200`：`ReleaseRecord[]`（含完整日志内容，单条结构见 7.2 示例）。

错误：404（项目不存在）。

### 7.2 GET /api/releases?scopeId=&version=

查询参数：
- `scopeId`：必填（项目 `p_xxx` 或仓库 `r_xxx`）。
- `version`：可选。给出时精确匹配该 scope 的该版本，命中返回**单条** `ReleaseRecord`，未命中 404；缺省时返回该 scope 全部记录数组（倒序）。

响应 `200`（单条 `ReleaseRecord` 示例，含日志内容）：

```json
{
  "id": "rel_p_3f1_v1.2.0",
  "kind": "project",
  "scopeId": "p_3f1",
  "scopeName": "主产品线",
  "version": "v1.2.0",
  "baseVersion": "v1.1.0",
  "buildStamp": "26081315",
  "bump": "minor",
  "date": "2026-08-13",
  "from": null,
  "to": null,
  "commits": [
    { "hash": "9d4f2a1", "fullHash": "9d4f2a1c...", "author": "张三", "date": "2026-08-12", "subject": "feat: 支持暗色主题", "type": "feat", "scope": null, "breaking": false, "files": ["src/theme/index.ts"] }
  ],
  "stats": {
    "commits": 12,
    "filesChanged": 34,
    "insertions": 1204,
    "deletions": 98,
    "byType": { "feat": 5, "fix": 4, "perf": 1, "refactor": 0, "style": 0, "chore": 0, "docs": 1, "test": 0, "build": 0, "ci": 1, "revert": 0, "other": 0 }
  },
  "logs": {
    "internal": { "state": "confirmed", "content": "# v1.2.0 发布记录（内部）\n...", "autoDraft": "# v1.2.0 发布记录（内部）\n...（自动草稿）" },
    "external": { "state": "confirmed", "content": "# 主产品线 v1.2.0 更新日志\n...", "autoDraft": "# 主产品线 v1.2.0 更新日志\n...（自动草稿）" }
  },
  "repos": [
    { "repoId": "r_8k2m", "repoName": "l-pc-front", "version": "v1.2.0.26081315", "commits": [ { "hash": "9d4f2a1", "fullHash": "9d4f2a1c...", "author": "张三", "date": "2026-08-12", "subject": "feat: 支持暗色主题", "type": "feat", "scope": null, "breaking": false, "files": ["src/theme/index.ts"] } ] }
  ],
  "tags": { "milestone": "v1.2.0" },
  "pushed": true,
  "builtBy": "BX 版本管理台"
}
```

- 仓库级记录（`kind: "repo"`）的 `tags` 为 `{ "build": "build/v1.2.0.26081315", "milestone": "v1.2.0" }`，且无 `repos` 字段。

错误：400 `VALIDATION`（`scopeId` 缺失）；404 `NOT_FOUND`（记录不存在）。

### 7.3 GET /api/releases/:id/versions（R18：发布历史版本清单）

用途：导出**某次发布当时的项目版本清单快照**（`[{app,name,version}]`，与 §4.2 结构一致）。数据来自发布记录落盘时的 `repos` 快照（含中文名 `displayName`），不依赖仓库当前状态。

响应 `200`（`RepoVersionItem[]`）：

```json
[
  { "app": "l-pc-front", "name": "PC 前端", "version": "v1.2.0.26081315" },
  { "app": "l-data-v", "name": "数据可视化", "version": "v1.2.0.26081315" }
]
```

- 仅项目级记录（`kind='project'`）支持；仓库级记录返回 400 `VALIDATION`。
- 前端入口：项目页发布历史每行「版本清单」按钮 + 发布向导完成页「导出版本清单」按钮（原生另存为）。
- 旧记录无 `displayName` 快照时回退英文名 `repoName`。

错误：404 `NOT_FOUND`；400 `VALIDATION`。

实现：`apps/server/src/api/history.ts`；`RepoReleaseRef.displayName` 由发布引擎在落盘时快照。

### 7.4 PATCH /api/releases/:id/log

用途：人工编辑/确认/重置双轨日志（R14），state 流转。**这是已落盘记录唯一的修改通道**：每次保存生成一条新的数据仓库 commit（git 审计可见；「发布记录不可变」仅约束发布引擎的写入路径）。

请求体：

```json
{ "track": "external", "action": "edit", "content": "# 主产品线 v1.2.0 更新日志\n\n## 新增\n- ..." }
```

| 字段 | 取值 | 说明 |
|---|---|---|
| `track` | `internal` / `external` | 哪一条轨道 |
| `action` | `edit` / `confirm` / `reset` | `edit`：覆盖内容；`confirm`：确认当前内容（`content` 可选）；`reset`：还原为 `autoDraft`（`content` 忽略） |
| `content` | string | `edit` 时必填 |

state 状态机（`auto → edited → confirmed`）：

| 当前 state | action | 结果 state | 说明 |
|---|---|---|---|
| `auto` | `edit` | `edited` | 人工修改留痕 |
| `edited` | `edit` | `edited` | 继续修改 |
| `edited` | `confirm` | `confirmed` | 定稿 |
| `confirmed` | `edit` | `edited` | 再次修改 → 确认失效，需重新确认 |
| 任意 | `reset` | `auto` | `content` 还原为 `autoDraft` |

响应 `200`：更新后的完整 `ReleaseRecord`（前端可整体刷新视图）。

错误：404 `NOT_FOUND`（记录不存在）；400 `VALIDATION`（`track`/`action` 非法、`edit` 缺 `content`）；409 `PUBLISH_RUNNING`（该记录所属 scope 正在发布中）。

> 发布前的日志编辑不经过本端点：向导第③步在前端编辑器完成，最终通过 `PublishRequest.externalContent/internalContent` 提交（见 8.1）；服务端落盘时推断初始 state（与 autoDraft 相同 → `auto`，不同 → `edited`）。

---

## 8. 发布

### 8.1 POST /api/publish

请求体（`PublishRequest`）：

```json
{
  "projectId": "p_3f1",
  "bump": "auto",
  "repoIds": ["r_8k2m", "r_x9"],
  "skipBuild": false,
  "offline": false,
  "dryRun": false,
  "externalContent": "# 主产品线 v1.2.0 更新日志\n\n## 新增\n- 支持暗色主题\n",
  "internalContent": null
}
```

| 字段 | 说明 |
|---|---|
| `projectId` | 必填 |
| `bump` | `major/minor/patch/auto`；`auto` = 按提交语义推断 |
| `repoIds` | 可选；缺省 = 自动选择所有有变动的仓库 |
| `skipBuild` | 跳过 buildCommand 执行 |
| `offline` | 纯本地模式：跳过 tag 推送与数据仓库 push |
| `dryRun` | `true` → 同步返回 `PublishPlan`；不落任务、不写 journal |
| `externalContent` / `internalContent` | 向导中人工编辑后的定稿；缺省 = 自动草稿 |

**模式一：dry-run（`dryRun: true`）** —— 同步执行 `planPublish`，响应 `200`（`PublishPlan`）：

```json
{
  "projectId": "p_3f1",
  "projectName": "主产品线",
  "projectVersion": "v1.2.0",
  "buildStamp": "26081315",
  "bump": "minor",
  "suggestedBump": "minor",
  "changed": [
    {
      "repoId": "r_8k2m",
      "name": "l-pc-front",
      "changed": true,
      "version": "v1.2.0.26081315",
      "from": "8c3e9f2a1b...",
      "to": "9d4f2a1c3b...",
      "commits": [ { "hash": "9d4f2a1", "fullHash": "9d4f2a1c...", "author": "张三", "date": "2026-08-12", "subject": "feat: 支持暗色主题", "type": "feat", "scope": null, "breaking": false, "files": ["src/theme/index.ts"] } ],
      "buildCommand": "pnpm build"
    }
  ],
  "syncedOnly": [
    { "repoId": "r_z2p", "name": "saas", "changed": false, "version": "v1.2.0", "from": null, "to": null, "commits": [] }
  ],
  "milestoneTag": "v1.2.0",
  "tags": [ { "repoId": "r_8k2m", "name": "l-pc-front", "tag": "build/v1.2.0.26081315" } ],
  "externalDraft": "# 主产品线 v1.2.0 更新日志\n\n## 新增\n- 支持暗色主题\n",
  "internalDraft": "# v1.2.0 发布记录（内部）\n...",
  "warnings": ["数据仓库未配置远程，发布后将仅保存在本地"]
}
```

- `changed` 只含有变动的仓库（提交或版本需要推进）；`syncedOnly` 为未变动、仅同步基版 version.json 的仓库。
- `changed.version` 按项目 `repoVersionScheme` 生成：`hybrid` → `v1.2.0.26081315`；`timestamp` → `v26081315`。
- dry-run 可能耗时数秒（含 git 查询），无副作用（不建任务、不写 journal、不打标签）。

**模式二：执行（`dryRun` 缺省或 `false`）** —— 立即创建任务并入队，响应 `202`：

```json
{ "taskId": "t_20260813_1530_a1b2", "queued": true }
```

- 服务端在入队前同步创建 journal（`running` 状态，见 core-engine.md §6），保证崩溃可续跑。
- 执行过程通过 SSE 订阅 `GET /api/events?task={taskId}` 呈现（§8.2）。
- **执行时以服务端实时重算的 plan 为准**：执行引擎会重新执行 `planPublish` 并对版本做锁存（写入 journal），避免 preview 与执行之间仓库发生新提交导致版本漂移。

错误：
- 400 `VALIDATION`（`bump` 非法、`repoIds` 含非本项目仓库）；
- 404 `NOT_FOUND`（项目不存在）；
- 409 `TASK_BUSY`（队列忙）：
  ```json
  { "error": "已有发布任务在执行或排队", "code": "TASK_BUSY", "queueLength": 1 }
  ```

### 8.2 GET /api/events?task=（SSE）

用途：订阅发布任务事件流（六步向导第⑤步实时控制台）。实现：`apps/server/src/api/events.ts` + `apps/server/src/sse.ts`。

查询参数：`task`（可选）。给出时只接收该任务的事件；缺省时接收全部发布事件（全局控制台）。

请求头：`Accept: text/event-stream`；认证按 §1.3 第 6 条（fetch 流携带 `X-BX-Token`；原生 EventSource 无 token 时仅同源放行）。

响应头：

```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Accel-Buffering: no
```

**SSE 帧格式**（`PublishEvent` 序列化后逐帧推送）：

```
retry: 3000
event: publish
data: {"type":"step","message":"预检通过：3 个仓库待发布"}

: ping
```

规则：
- `data` 为**单行 JSON**（`JSON.stringify` 不换行）；事件名固定 `publish`。
- 每 15s 心跳注释帧 `: ping`；首帧 `retry: 3000`（断线 3s 后重连）。
- **连接建立即发快照**：若任务正在运行，先发一条 `{"type":"step","message":"任务 t_... 进行中：已完成 2/3 仓库（l-pc-front、l-data-v）"}`；若任务已结束，补发最终 `done`/`error` 帧后 2s 内关闭连接。
- 任务结束后：广播 `done`（或 `error`）帧 → 服务端 2s 后关闭该任务的全部订阅连接。客户端重连后只会拿到最终快照，可安全停止重试。

`PublishEvent.type` 取值与语义（与 types.ts 一致）：`log`（过程输出）/ `step`（阶段推进）/ `repo-start` / `repo-done` / `repo-error`（单仓失败，其余继续）/ `done`（整任务结束，`data` 携带汇总）/ `error`（整任务失败）。

完整事件序列示例（对应六步向导第⑤步）：

```
data: {"type":"step","message":"预检通过：3 个仓库待发布"}
data: {"type":"repo-start","repoId":"r_8k2m","message":"开始处理 l-pc-front"}
data: {"type":"log","message":"$ pnpm build  (8.2s)"}
data: {"type":"step","message":"创建标签 build/v1.2.0.26081315 @ l-pc-front"}
data: {"type":"repo-done","repoId":"r_8k2m","message":"l-pc-front → v1.2.0.26081315"}
data: {"type":"repo-error","repoId":"r_x9","message":"im-web 构建失败：exit 1（不影响已完成仓库）"}
data: {"type":"step","message":"写入项目发布记录 rel_p_3f1_v1.2.0"}
data: {"type":"done","message":"发布完成","data":{"releaseId":"rel_p_3f1_v1.2.0","version":"v1.2.0","failedRepos":["r_x9"]}}
```

错误：404（`task` 不存在）；401（token 非法且非同源）；403（Origin 非法）。

---

## 9. 数据仓库同步

### 9.1 POST /api/sync

用途：数据仓库（`~/.bxverse/data`）的 pull/push/commit/status 与远程地址配置（R10 双模式）。实现：`apps/server/src/api/sync.ts`；底层 `@bxverse/core` DataStore.syncDataRepo。

请求体（`action` 决定其余字段）：

| action | 附加字段 | 说明 |
|---|---|---|
| `pull` | — | `git pull --ff-only`；冲突返回 409 `SYNC_CONFLICT` |
| `push` | — | `git push`；无远程 → 降级仅本地（200，`pushed:false` + `warning`） |
| `commit` | `message`? | 暂存全部 + 提交（缺省 message 用 `chore: manual commit`） |
| `status` | — | 汇总仓库状态 |
| `set-remote` | `url`（string \| null） | 配置数据仓库远程地址，存于 `credentials.json`（不进数据仓库）；`null` 清除 |

示例与响应：

```json
// 请求
{ "action": "push" }

// 响应 200
{ "ok": true, "action": "push", "pushed": true, "message": "已推送到 git@gitee.com:me/bxverse-data.git" }

// 无远程时的降级响应 200
{ "ok": true, "action": "push", "pushed": false, "warning": "数据仓库未配置远程，仅保存在本地" }

// status 响应 200
{
  "ok": true,
  "action": "status",
  "remote": "git@gitee.com:me/bxverse-data.git",
  "branch": "master",
  "ahead": 1,
  "behind": 0,
  "dirty": false,
  "lastCommit": "a1b2c3d",
  "lastCommitDate": "2026-08-13T10:00:00+08:00"
}

// pull 冲突 409
{ "error": "拉取冲突：请人工解决 ~/.bxverse/data 的冲突后重试", "code": "SYNC_CONFLICT" }
```

错误：400 `VALIDATION`（action 非法、`set-remote` 的 `url` 协议非法）；409 `SYNC_CONFLICT`；500 `GIT_FAILED`（`error` 含 git stderr 摘要）。

---

## 10. 辅助端点（可选，v1 建议实现）

### 10.1 GET /api/publish/current

用途：页面刷新后恢复发布控制台/续跑 UI（journal 续跑语义，见 core-engine.md §6.5）。

响应 `200`：

```json
{ "taskId": "t_20260813_1530_a1b2", "status": "running", "projectId": "p_3f1" }
```

无任务时：`{ "taskId": null }`。

### 10.2 POST /api/auth/rotate

用途：轮换会话 token（需携带当前有效 token，`crypto.timingSafeEqual` 校验）。原子替换 `credentials.json` 中的 token，旧 token 立即失效；服务端随后断开全部 SSE 连接。

响应 `200`：

```json
{ "token": "新token" }
```

错误：401 `UNAUTHORIZED`。

> 前端处理：收到新 token 后更新 `sessionStorage` 并重新引导；SSE 客户端按 `retry` 自动重连（重建连接时需重新执行引导拿新 token）。

---

## 10.5 备份与一致性对比（R19/M6）

> 存储布局见 data-model.md §12：大文件在 `backups/{projectId}/{repoId}/{versionSafe}/`，元数据 `data/backups/{releaseId}-{repoId}.json`（进 git 审计）。

### 10.5.1 GET /api/repos/:pid/:rid/backups

用途：某仓库历次发布备份列表（倒序，n 默认 20 上限 100）。

响应 `200`：

```json
{ "items": [ { "releaseId": "rel_p_…", "repoId": "r_…", "version": "v1.2.0.26081315", "commit": "…", "tag": "build/v1.2.0.26081315", "date": "…", "items": [ { "kind": "source-bundle", "file": "source.bundle", "sha256": "…", "size": 123456 }, { "kind": "artifact", "file": "artifact.tar.gz", "sha256": "…", "size": 45678, "files": 42 } ] } ] }
```

### 10.5.2 GET /api/backups/download/:releaseId/:repoId/:kind

用途：下载备份文件（`source-bundle` / `source-archive` / `artifact` / `artifact-manifest`），`Content-Type: application/octet-stream` + `Content-Disposition` 附件；服务端按元数据哈希校验后流式响应。错误：404 `NOT_FOUND`。

### 10.5.3 DELETE /api/backups/:releaseId/:repoId

用途：删除一次备份的全部文件与元数据（审计元数据文件随下次数据仓库 commit 移除）。响应 `200 { ok: true }`。

### 10.5.4 POST /api/backups/compare

用途：产物级对比（两份发布清单）或校验级（清单 vs 实际文件）。

请求：

```json
{ "kind": "artifact", "left": { "releaseId": "…", "repoId": "r_…" }, "right": { "releaseId": "…", "repoId": "r_…" } }
{ "kind": "verify", "releaseId": "…", "repoId": "r_…" }
```

响应 `200`（`CompareResult`，data-model.md §12.4）：

```json
{ "kind": "artifact", "files": [ { "path": "index.html", "status": "modified", "left": { "sha256": "…", "size": 1 }, "right": { "sha256": "…", "size": 2 } } ], "totals": { "added": 0, "removed": 0, "modified": 1, "same": 41 } }
```

错误：404 `NOT_FOUND`（清单缺失）、422 `COMPARE_UNSUPPORTED`。

### 10.5.5 GET /api/repos/:pid/:rid/diff?from=&to=

用途：源码级对比——同仓库两个 commit/tag（`build/vX.Y.Z.YYMMDDHH`、`vX.Y.Z` 或 hash）间 `git diff --name-status --numstat`。

响应 `200`：

```json
{ "files": [ { "path": "src/index.ts", "status": "modified", "insertions": 12, "deletions": 3 } ], "stats": { "files": 1, "insertions": 12, "deletions": 3 } }
```

错误：400 `VALIDATION`（ref 非法或不可达）。

### 10.5.6 发布请求扩展

`POST /api/publish` 请求新增可选字段：`backupSource?: boolean`（默认 true）、`backupArtifacts?: boolean`（默认 true，仓库未配置 `artifactDir` 时自动跳过并 warning）；`PATCH /api/projects/:id/repos/:rid` 新增可选 `artifactDir?: string | null`（相对仓库根，前端树选择器点选）。

---

## 11. 与 architecture.md §3.2 路由表的差异

| # | architecture.md 原设计 | 本设计 | 原因 |
|---|---|---|---|
| 1 | `GET /api/auth/init` 引导拿 token | 由 `GET /api/config` 承担（唯一免 token 端点，返回 `token` 字段） | 锁定决策：token 经 GET /api/config 下发同源页面；GET 无 CORS 头保证跨源不可读 |
| 2 | `PUT /api/config`（全量保存，发布中 409） | `POST /api/config`（**部分更新** pwa/theme/pollInterval/ai） | 锁定决策；项目类数据改走 /api/projects 系列，无需再对 config 加发布锁 |
| 3 | `POST /api/projects/:id/plan` 生成计划 | 并入 `POST /api/publish`（`dryRun:true` 同步返回 `PublishPlan`） | 锁定决策：plan 与 publish 同一入口，避免两处维护请求模型 |
| 4 | `GET /api/publish/stream`（全局单通道） | `GET /api/events?task=`（按任务过滤） | 锁定决策；配合 `{taskId}` 立即返回模型，多标签页互不串扰 |

其余与 architecture.md 一致的约定（单队列、journal 续跑、SSE 心跳、SPA 托管、Vite 代理）不变。

---

## 12. 与需求文档的对应关系

| 本文档章节 | 对应需求编号 | 说明 |
|---|---|---|
| §1.3 X-BX-Token / Origin 校验 | 非功能·安全（R15） | 127.0.0.1、防 CSRF、token 走 Header、凭据独立 |
| §1.4 发布锁与单队列 | 非功能·可靠性（R15） | 发布任务单队列、项目锁防状态抖动 |
| §3 配置（pwa/theme/ai） | R1、R17、R14 | PWA 可选安装、亮/暗主题、AI 润色配置 |
| §4 总览 | R2、R13 | 两级模型聚合、改动点可见 |
| §5 项目 CRUD | R2、R6、R11 | 项目两级管理、初始 6 工程入「默认项目」（由 server 首次引导/CLI 初始化完成） |
| §6.1 仓库接入（path/url 克隆） | R3 | 两种接入方式均支持 |
| §6.4/6.5/6.6 状态/树/文件 | R4、R13 | 目录结构查看、相对上次发布的提交 |
| §7 发布历史与日志编辑 | R5、R6、R7、R14 | 双轨日志、人工编辑确认（state 流转） |
| §8 发布（dry-run/执行/SSE） | R9、R10、R12、R14 | 自动化生成、六步向导、本地/远程双模式、执行前预览 |
| §9 数据仓库同步 | R10、R15 | tag/release 远程联动与多机同步、自动降级 |
| §10 辅助端点 | 非功能·可靠性 | 中断续跑恢复 UI、token 轮换 |


