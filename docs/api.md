# bxverse 服务端 API 设计

> 文档版本：v0.2（2026-08-13）
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
| 400 | 参数/请求体校验失败（`VALIDATION`、`REPO_INVALID`、`CLONE_FAILED`）；请求体超过 32MB 上限 |

> 请求体上限：32MB（JSON）。超限返回 400 `VALIDATION`（不会断开连接；发布执行可携带大体积日志内容，如首次发布的对内日志草稿可达数 MB）。
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
2. **token 下发**：免 token 端点 `GET /api/config` 在响应中直接返回 token；该端点与其他 GET 一样**绝不设置 CORS 头**，跨源页面无法读取响应体，故安全。
3. **携带方式**：除 `GET /api/config` 与 `GET /api/health`（§10.3）外的全部 `/api/*` 请求（含 GET）必须携带请求头 `X-BX-Token`，服务端用 `crypto.timingSafeEqual` 比对；失败返回 401。**token 只走 Header，绝不使用 Cookie**。
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
| GET | `/api/health` | 健康检查（免 token，CLI status / 前端 RuntimeStatus chip） | — | `apps/server/src/app.ts` |
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
| GET | `/api/projects/:id/versions` | 项目版本清单（实时采集，R18） | `RepoVersionItem[]` | `apps/server/src/api/versions.ts` |
| POST | `/api/projects/:id/versions/export` | 版本清单写入指定仓库（R18） | `RepoVersionItem[]` | `apps/server/src/api/versions.ts` |
| GET | `/api/projects/:id/releases` | 项目发布历史 | `ReleaseRecord[]` | `apps/server/src/api/history.ts` |
| GET | `/api/releases` | 按 scope+版本查发布记录（含日志内容） | `ReleaseRecord` | `apps/server/src/api/history.ts` |
| GET | `/api/releases/:id/versions` | 发布历史版本清单快照（R18） | `RepoVersionItem[]` | `apps/server/src/api/history.ts` |
| PATCH | `/api/releases/:id/log` | 编辑双轨日志（state 流转） | `ReleaseRecord` | `apps/server/src/api/history.ts` |
| POST | `/api/publish` | dry-run 预览 / 提交发布任务 | `PublishPlan` / `{taskId}` | `apps/server/src/api/publish.ts` |
| GET | `/api/events` | SSE 事件流 | `PublishEvent` | `apps/server/src/api/events.ts` |
| POST | `/api/sync` | 数据仓库 pull/push/commit/status | — | `apps/server/src/api/sync.ts` |
| POST | `/api/auth/rotate` | 轮换 token（可选） | — | `apps/server/src/http/auth.ts` |
| GET | `/api/publish/current` | 当前任务查询（可选，续跑 UI） | — | `apps/server/src/api/publish.ts` |
| POST | `/api/ai/polish` | AI 日志润色（多供应商；未启用/无生效供应商 400） | `{ok, content}` | `apps/server/src/api/ai.ts` |
| GET | `/api/ai/providers` | AI 供应商列表（key 脱敏：`hasKey` 布尔） | `AiProvider[]` | `apps/server/src/api/ai.ts` |
| POST | `/api/ai/providers` | 新增供应商（body 不含 key；key 走 credential 接口） | `AiProvider` | 同上 |
| PATCH | `/api/ai/providers/:id` | 修改 name/baseUrl/model/enabled/设为当前 | `AiProvider` | 同上 |
| DELETE | `/api/ai/providers/:id` | 删除供应商（删除当前生效时自动回退） | `{ok}` | 同上 |
| PUT | `/api/ai/providers/:id/credential` | 设置/更新 API key（write-only，不回显） | `{ok, hasKey: true}` | 同上 |
| POST | `/api/ai/test` | 测试连接 `{providerId}` → 最小 chat 请求 | `{ok, detail?}` | 同上 |
| POST | `/api/ai/commit-message` | 阶段二：AI 生成提交信息（conventional 草稿） | `{message}` | 同上 |
| POST | `/api/ai/explain-diff` | 阶段二：AI 变更解读（中文摘要） | `{summary}` | 同上 |
| GET | `/api/repos/:pid/:rid/git/status` | 阶段二：工作区状态（dirty 文件+增删改） | — | `apps/server/src/api/git.ts`（阶段二新增） |
| GET | `/api/repos/:pid/:rid/git/diff` | 阶段二：diff（工作区 vs HEAD / 两提交间） | — | 同上 |
| POST | `/api/repos/:pid/:rid/git/commit` | 阶段二：提交（files + message） | — | 同上 |
| POST | `/api/repos/:pid/:rid/git/stash` / `stash-pop` | 阶段二：暂存/恢复 | — | 同上 |
| POST | `/api/repos/:pid/:rid/git/push` | 阶段二：push 分支 / `--tags` | — | 同上 |
| POST | `/api/repos/:pid/:rid/git/pull` | 阶段二：pull（--ff-only） | — | 同上 |
| DELETE | `/api/repos/:pid/:rid/git/tags/:tag` | 阶段二：删除标签 | — | 同上 |
| GET | `/api/repos/:pid/:rid/backups` | 仓库历次发布备份列表（R19） | `RepoBackupRef[]` | `apps/server/src/api/backups.ts` |
| GET | `/api/backups/:releaseId/:repoId` | 备份元数据（R19） | `RepoBackupRef` | `apps/server/src/api/backups.ts` |
| GET | `/api/backups/download/:releaseId/:repoId/:kind` | 备份文件流式下载（R19） | — | `apps/server/src/api/backups.ts` |
| DELETE | `/api/backups/:releaseId/:repoId` | 删除备份文件与元数据（R19） | — | `apps/server/src/api/backups.ts` |
| POST | `/api/backups/compare` | 产物级对比（R19） | `CompareResult` | `apps/server/src/api/backups.ts` |
| POST | `/api/backups/verify` | 备份完整性校验（R19） | `CompareResult` | `apps/server/src/api/backups.ts` |
| GET | `/api/repos/:pid/:rid/diff` | 源码级对比（R19） | `CompareResult` | `apps/server/src/api/backups.ts` |
| GET | `/api/backups/usage` | 备份磁盘占用（按项目/仓库过滤） | `BackupUsage` | `apps/server/src/api/backups.ts` |
| POST | `/api/backups/cleanup` | 按保留策略清理（dryRun 预览） | `BackupCleanupResult` | `apps/server/src/api/backups.ts` |
| POST | `/api/backups/restore` | 恢复备份到目标目录（校验绝对路径+kind） | `{ok}` | `apps/server/src/api/backups.ts` |
| POST | `/api/releases/:id/publish-note` | 同步 external 日志至平台 Release（R27） | `ExternalReleaseProvider` | `apps/server/src/api/history.ts` |
| GET | `/api/openapi.json` | OpenAPI 3.0 契约（免 token） | — | `apps/server/src/api/openapi.ts` |
| GET | `/api/metrics` | 进程指标（免 token） | — | `apps/server/src/api/metrics.ts` |
| GET | `/api/matrix` | 多项目跨工程版本矩阵（R31，0 入侵纯聚合） | `VersionMatrix` | `apps/server/src/api/matrix.ts` |

---

## 3. 配置与引导

### 3.1 GET /api/config（免 token）

用途：应用引导（拿 token）+ 读取配置 + 项目概要。**免 token 端点**（另一免 token 端点为 `GET /api/health`，见 §10.3）；响应不含 CORS 头。

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
- `ai.apiKey` **永不返回明文**（write-only）：响应中恒为空串；供应商 key 状态以 `ai.providers[i].hasKey` 布尔呈现（`hasKey` 由 server 依据 `credentials.json.aiKeys` 计算，脱敏）。
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

携带 `items`（发布历史快照导出用，见 §7.3）时：

```json
{
  "repoId": "r_8k2m",
  "path": "versions.json",
  "items": [
    { "app": "l-pc-front", "name": "PC 前端", "version": "v1.2.0.26081315" },
    { "app": "l-data-v", "name": "数据可视化", "version": "v1.2.0.26081315" }
  ]
}
```

| 字段 | 说明 |
|---|---|
| `repoId` | 必填；必须属于该项目 |
| `path` | 必填；相对仓库根的路径，必须以 `.json` 结尾；禁止绝对路径（含 Windows 盘符 `C:/`、UNC）、`..` 越界（校验在 POSIX 与 Windows 上行为一致） |
| `items` | 可选；`RepoVersionItem[]`（`{app,name,version}`）——传入则**直接写入该内容**（发布历史快照导出用，通常取自 `GET /api/releases/:id/versions`）；缺省时实时采集当前版本（fresh 读取业务仓库 version.json）。非数组或元素缺 `app/name/version` 字符串 → 400 `VALIDATION` |

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
- 错误：404（项目/仓库不存在或不属于该项目）；400 `VALIDATION`（字段缺失、非 `.json`、路径越界、`items` 非 `{app,name,version}` 数组）；400 `REPO_INVALID`（仓库路径失效）。
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

服务端默认值：`id = "p_" + base36(3位随机)`、`version = "v0.1.0"`、`bump = "auto"`、`repoVersionScheme = "hybrid"`、`repoVersionFormat = "X.Y.Z"`（R26，双格式 `X.Y.Z`/`VYYMMDDHHmm`，优先于 `repoVersionScheme`）、`externalExclude = DEFAULT_EXTERNAL_EXCLUDE`、`repos = []`。

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

- 允许字段：`name / description / bump / repoVersionScheme / repoVersionFormat / manifestTarget / externalExclude`。**`version` 不可直接改**（只随发布 bump）；`repos` 的增删改走 §6。`repoVersionFormat` 枚举 `X.Y.Z`/`VYYMMDDHHmm`；`manifestTarget` 为 `{ repoId, path }`（仓库内相对 `.json` 路径）。
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
  "versionSource": "packageJson",
  "packageManager": "pnpm",
  "installCommand": "pnpm install --frozen-lockfile",
  "preBuildCommand": "pnpm update",
  "buildTimeoutMs": 600000,
  "versionSyncCommit": "package",
  "path": "E:\\bx-gitee\\l-pc-front-v2"
}
```

- 允许字段：`name / displayName / buildCommand / outputDir / writeVersionFile / path / artifactDir / versionSource / packageManager / installCommand / preBuildCommand / buildTimeoutMs / versionSyncCommit`（R26 新增后 6 字段）。`path` 变更时重新校验 `.git`；`id/remote/lastPublishCommit` 不可改。

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
    { "repoId": "r_8k2m", "repoName": "l-pc-front", "displayName": "PC 前端", "version": "v1.2.0.26081315", "commits": [ { "hash": "9d4f2a1", "fullHash": "9d4f2a1c...", "author": "张三", "date": "2026-08-12", "subject": "feat: 支持暗色主题", "type": "feat", "scope": null, "breaking": false, "files": ["src/theme/index.ts"] } ] }
  ],
  "tags": { "milestone": "v1.2.0" },
  "pushed": true,
  "builtBy": "BX 版本管理台"
}
```

- 仓库级记录（`kind: "repo"`）的 `tags` 为 `{ "build": "build/v1.2.0.26081315", "milestone": "v1.2.0" }`，且无 `repos` 字段。
- 项目级记录的 `repos` **快照项目下全部仓库**（导出清单不缺项）：发布成功仓库 = 发布版本（`commits` 非空）；未变动仓库 = 本次同步基版（`projectVersion`，`commits: []`）；发布失败仓库 = 仓库当前 `version.json` 版本（旧版本，`commits: []`）。

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

## 7.5 AI 供应商管理与能力（多供应商，OpenAI 兼容）

> 设计目标：多供应商并存、可切换当前生效；凭据 write-only（与 deepseek-harness 一致）；热更新（改配置下次请求生效，无需重启）。

### 7.5.1 数据与凭据

- 供应商定义存 `AppConfig.ai.providers[]`（`AiProvider{ id, name, kind, baseUrl, model, enabled }`），`kind` 当前仅 `'openai-compatible'`（预留扩展位）。
- `activeProviderId` 指定当前生效供应商；同一时刻仅允许一个 `enabled=true`（设为当前/新增时自动互斥）。
- API key 存 `credentials.json.aiKeys[providerId]`（0600）；**所有响应脱敏**——`GET /api/config` 与 `GET /api/ai/providers` 只返回 `hasKey: boolean`，永不回显明文。
- 迁移：旧单表单配置（`ai.baseUrl/model/apiKey`）首次读取时自动生成默认 provider（id `legacy`），key 迁入 credentials 后清空 app.json。

### 7.5.2 端点

| 方法/路径 | 请求体 | 响应/说明 |
|---|---|---|
| `GET /api/ai/providers` | — | `AiProvider[]`（每项含 `hasKey` 布尔，不含 key） |
| `POST /api/ai/providers` | `{ name, baseUrl, model, enabled? }` | `201` 完整 provider（含新 `id`）；设置 key 走 credential 端点 |
| `PATCH /api/ai/providers/:id` | `{ name?, baseUrl?, model?, enabled? }`（`enabled:true` 即设为当前） | 更新后 provider |
| `DELETE /api/ai/providers/:id` | — | `{ok}`；删除当前生效 → 回退为无生效供应商（`enabled=false`） |
| `PUT /api/ai/providers/:id/credential` | `{ apiKey }` | `{ok, hasKey: true}`；**write-only**，响应不含 key |
| `POST /api/ai/test` | `{ providerId }` | `{ok, detail?}`；向该供应商发最小 chat 请求验证 key/模型 |
| `POST /api/ai/polish` | `{ text }` | 现有接口升级：读 active provider + credentials key 润色；`{ok, content}` |

校验与错误：provider 不存在 404 `NOT_FOUND`；未启用 / 无生效供应商 / 无 key 400 `AI_CONFIG`；上游失败 502（`error` 含上游状态与截断响应体）。

### 7.5.3 阶段二：AI Git 助手与仓库内 Git 面板（R22 已实现）

| 方法/路径 | 请求体 | 响应与说明 |
|---|---|---|
| `POST /api/ai/commit-message` | `{ fileSummary: string, diff: string }` | `{ ok, subject, body, type, provider }`：分析已暂存 diff → Conventional Commits 建议 |
| `POST /api/ai/explain-diff` | `{ filePath: string, diff: string }` | `{ ok, intent, keyChanges: string[], risks: string[], provider }`：单文件 diff 解读 |
| `GET /api/repos/:pid/:rid/git/status` | — | `GitStatus`：分支、HEAD、ahead/behind、文件清单（`indexStatus`/`workStatus`/`staged`/`untracked`）与 summary |
| `GET /api/repos/:pid/:rid/git/diff?path=&range=` | — | `GitFileDiff`：单文件 diff（`range` 为 `staged`/`unstaged`/`untracked`），截断保护 |
| `POST /api/repos/:pid/:rid/git/stage` | `{ all?: boolean, paths?: string[] }` | `{ ok: true }`：单文件或一键全部暂存 |
| `POST /api/repos/:pid/:rid/git/unstage` | `{ all?: boolean, paths?: string[] }` | `{ ok: true }`：单文件或一键全部撤销暂存 |
| `POST /api/repos/:pid/:rid/git/commit` | `{ subject: string, body?: string, allowEmpty?: boolean }` | `{ ok: true, hash: string }`：提交（严格校验单行标题，防注入） |
| `POST /api/repos/:pid/:rid/git/push` | — | `{ ok: true, output: string }`：push 分支到 origin |
| `POST /api/repos/:pid/:rid/git/pull` | — | `{ ok: true, output: string }`：pull（`--ff-only` 安全快进） |
> Git 写操作全部**用户显式发起**：服务端不自动 commit/stash/push/tag 删除；AI 输出仅为草稿/建议。

---

## 8. 发布

### 8.1 POST /api/publish

请求体（`PublishRequest`）：

```json
{
  "projectId": "p_3f1",
  "bump": "auto",
  "prerelease": "beta.1",
  "repoIds": ["r_8k2m", "r_x9"],
  "excludeCommits": { "r_8k2m": ["9d4f2a1c3b5e7f8a9d0b1c2d3e4f5a6b7c8d9e0f"] },
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
| `prerelease` | 可选（扩展 R30，灰度标识 `beta.1`/`rc.1` 等）；`PRERELEASE_RE=/^[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*$/` 校验，空串/缺省 = 正式版；同标识递增（`beta.1→beta.2`、`beta→beta.2`），异标识覆盖（`beta.1` 请求 `rc.1` → `rc.1`）；非法 → 400 `VALIDATION`（`非法 prerelease: ${req}`） |
| `repoIds` | 可选；缺省 = 自动选择所有有变动的仓库 |
| `skipBuild` | 跳过 buildCommand 执行 |
| `offline` | 纯本地模式：跳过 tag 推送与数据仓库 push |
| `dryRun` | `true` → 同步返回 `PublishPlan`；不落任务、不写 journal |
| `externalContent` / `internalContent` | 向导中人工编辑后的定稿；缺省 = 自动草稿 |
| `excludeCommits` | 可选；`Record<repoId, fullHash[]>`——提交级人工排除（向导人工甄别），被排除的提交不参与本次发布：引擎过滤后**重算 changed**；某仓库全部提交被排除且无 dirty 时自动降级为 `syncedOnly`；排除数记入 `PublishPlan.warnings`（如「r_8k2m 排除 2 个提交，参与本次发布 1 个」）。非对象或值非字符串数组 → 400 `VALIDATION`（`excludeCommits 必须为 { repoId: string[] }`） |

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
- `changed.version` 按项目 `repoVersionFormat` 生成（优先于 `repoVersionScheme`）：`X.Y.Z` → `1.2.0`；`VYYMMDDHHmm` → `V2608241530`；旧 `hybrid` → `v1.2.0.26081315`、`timestamp` → `v26081315` 保留兼容；prerelease 时 `X.Y.Z` 渲染为 `1.2.0-beta.1`，hybrid 为 `v1.2.0-beta.1.26081315`。
- `PublishPlan.prerelease?`（扩展 R30）：灰度标识快照，同标识递增（`beta.1→beta.2`），异标识覆盖；prerelease 时 `projectVersion: "v1.2.0-beta.1"`、`milestoneTag: "v1.2.0-beta.1"`、`tags[].tag: "build/v1.2.0-beta.1"`（`X.Y.Z` 格式下为 `build/1.2.0-beta.1`）；缺省为正式版。
- `prerelease` 校验失败 → 400 `VALIDATION`（`非法 prerelease: ${value}`，`PRERELEASE_RE` 未通过）；`bump`/`repoIds`/`excludeCommits` 校验同前。
- dry-run 可能耗时数秒（含 git 查询），无副作用（不建任务、不写 journal、不打标签）。

**模式二：执行（`dryRun` 缺省或 `false`）** —— 立即创建任务并入队，响应 `202`：

```json
{ "taskId": "t_20260813_1530_a1b2", "queued": true }
```

- 服务端在入队前同步创建 journal（`running` 状态，见 core-engine.md §6），保证崩溃可续跑。
- 执行过程通过 SSE 订阅 `GET /api/events?task={taskId}` 呈现（§8.2）。
- **执行时以服务端实时重算的 plan 为准**：执行引擎会重新执行 `planPublish` 并对版本做锁存（写入 journal），避免 preview 与执行之间仓库发生新提交导致版本漂移。

错误：
- 400 `VALIDATION`（`bump` 非法、`repoIds` 非字符串数组或含非本项目仓库、`excludeCommits` 非 `{ repoId: string[] }`）；
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

### 10.3 GET /api/health（免 token）

用途：健康检查——**免 token**（与 `GET /api/config` 同为免 token 白名单端点），供 CLI `status` 命令与前端顶栏 RuntimeStatus chip 使用。实现于 `apps/server/src/app.ts`（路由组装处内联注册，非独立 API 模块）；版本号读取 `process.cwd()` 下 `package.json` 的 `version` 字段，读取失败回退 `0.0.0`。

查询参数：无。请求体：无。

响应 `200`：

```json
{ "ok": true, "version": "0.2.0", "home": "C:/Users/x/.bxverse" }
```

- `version` 为 server 包版本（`package.json`），非项目/仓库版本。
- `home`（2026-08-25 扩展）为 BX_HOME 根路径，供前端拼白名单内默认路径（如恢复向导默认目录）。
- 认证豁免：`(pathname === '/api/health') && method === 'GET'` 跳过 token 校验（见 app.ts）；响应同样无 CORS 头。
- 不做任何 git/配置读取，用于探测服务存活与版本。

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

### 10.6 契约与可观测性

- `GET /api/openapi.json`（免 token）：返回 `openApiSpec`（`apps/server/src/openapi.ts` 从 `shared/types` 派生，运行时经 `validate.ts` 校验备份 `retention`/`restore` 入参）。
- `GET /api/metrics`（免 token）：进程指标与 `logger.ts` JSON 行日志（`logs/server-YYYY-MM-DD.log`）配套排查。

### 10.7 发布废弃与标签清理（R24）

#### POST /api/releases/:id/deprecate

用途：将已发布记录标为废弃（`deprecated=true`，写入 `deprecateReason`/`deprecatedAt` 并进数据仓库审计），可选清理业务仓库标签（`cleanupTags=true` 时纠偏撤销）。

请求体：

```json
{ "reason": "存在严重回归，废弃此版本", "cleanupTags": true }
```

| 字段 | 说明 |
|---|---|
| `reason` | 可选，废弃原因（trim 后空串回退 `人为标为废弃`） |
| `cleanupTags` | 可选，`true` 时清理关联仓库标签；`false`/缺省仅标记废弃 |

标签清理逻辑（已修复 F3 死逻辑）：

- **不再**只读 `project` 记录的 `tags`（仅 `milestone`，导致 `build` 标签永不清理）；
- 改为：遍历 `projectRecord.repos`，对每个 `repoId` 反查该仓最新 `ReleaseRecord`（`listRecords(repoId, 20)` 优先精确匹配 `r.version`，fallback 最新一条；必要时 `nextReleaseId+readRecord` 兜底），取其 `tags.build` 与 `tags.milestone` 组装待删清单（去重）；
- 逐仓调用 `deleteTag(repoPath, tag, { remote: true })`，单仓/单标签失败不中断整体；
- 聚合返回 `{ removed: string[], failed: { repoId, tag, reason }[] }`，`failed` 非空时 HTTP 仍 `200`，并附加 `warnings: string[]`（部分成功语义）。

响应 `200`（成功或部分成功）：

```json
{
  "id": "rel_p_3f1_v1.2.0",
  "kind": "project",
  "version": "v1.2.0",
  "deprecated": true,
  "deprecateReason": "存在严重回归",
  "deprecatedAt": "2026-08-24T10:00:00.000Z",
  "removed": ["build/v1.2.0.26082410", "v1.2.0"],
  "failed": [],
  "warnings": ["r_xxx 清理标签 build/... 失败: ..."]
}
```

- `cleanupTags=false` 或无需清理时 `removed: []`、`failed: []` 且 `warnings` 缺省；
- `failed` 非空时响应仍为 `200`，但携带 `warnings`（`failed.map(f => \`\${f.repoId} 清理标签 \${f.tag} 失败: \${f.reason}\`)`）提示调用方部分成功（前端可 toast 黄条）；
- 仓库级记录（`kind='repo'`）的清理逻辑同理：直接取该记录 `tags.build`/`tags.milestone` 逐一删除；
- 状态码 `404 NOT_FOUND`（记录不存在）。

实现：`apps/server/src/api/history.ts`；底层 `DataStore.deprecateRecord` + `git.deleteTag`。

### 10.8 备份增强端点

- `GET /api/backups/usage?projectId=&repoId=`：`BackupUsage` 聚合（`getBackupUsage`）。
- `POST /api/backups/cleanup`：`{ projectId?, repoId?, retention?, dryRun }` → `enforceRetention`；缺 `retention` 时取 `AppConfig.backup.retention`，三项全空 400 `VALIDATION`；`assertBackupCleanupBody` 校验 `keepLast>=1/maxBytes>=0/keepDays>=1`。
- `POST /api/backups/restore`：`{ releaseId, repoId, kind, targetDir, overwrite? }` → `restoreBundle/restoreArchive`；`assertRestoreBody` 校验绝对路径且非根 + BX_HOME 白名单，`kind` ∈ `source-bundle/source-archive/artifact`；`overwrite`（仅快照/产物生效）允许目标目录非空并覆盖同名文件，bundle（git clone）恒要求空目录；成功后向备份元数据追加 `restores[]` 审计记录并 `commitRecords` 入数据仓库，响应 `{ ok, targetDir, restores }`。

### 10.9 发布说明分发至平台 Release（R27）

#### POST /api/releases/:id/publish-note

用途：将项目级/仓库级发布记录的 `external` 日志一键同步为对应仓库在 GitHub/Gitee 的 Release 备注（tag 已打好，Release API 幂等：同 `tag_name` 存在则 PATCH `body`）。

请求体：

```json
{ "repoId": "r_8k2m", "provider": "github", "body": "# v1.2.0 更新日志\n..." }
```

| 字段 | 说明 |
|---|---|
| `repoId` | 必填；必须属于该发布记录所属项目（`ReleaseRecord.scopeId` 对应的 `ProjectDef.repos`） |
| `provider` | `github` \| `gitee`（大小写不敏感，前端下拉直供；缺省按 remoteUrl 自动推断，推断失败 400） |
| `body` | 必填；Release 备注 Markdown（取 `ReleaseRecord.logs.external.content` 时后端不再二次校验节选，直接透传） |

服务端步骤：

1. `readRecord(id)` → 取项目定义与 `repoDef.path`/`remote`；无记录 404 `NOT_FOUND`。
2. 参数校验：`repoId` 非法 / `body` 空 400 `VALIDATION`；`provider` 非法 400。
3. 凭据：`credentials.json` 的 `releaseTokens[provider]`（兼容旧 `githubToken`/`giteeToken` 字段）；缺失 → 400 `VALIDATION`（`未配置 ${provider} token，请在 credentials.json 配置 releaseTokens.${provider}`）。
4. 远程解析：`remote` 或 `git remoteUrl(repoPath)` → `parseRemoteUrl` 得 `owner/repo`；无法解析 400 `VALIDATION`。
5. 标签：`tag_name = ReleaseRecord.version`（如 `v1.2.0` / `1.2.0` / `V2608241530`），`name = tag_name`；同 tag 已存在则 PATCH，仅更新 `body`（与 `name`），幂等。
6. 调用 `core/release.publishReleaseNote`（`node:https`，`Authorization: token <token>`，Gitee 走 `?access_token=`），超时 15s；失败 502 上游错误（`error` 含 HTTP 状态与截断响应体）。

响应 `200`：

```json
{ "ok": true, "provider": "github", "tag": "v1.2.0", "action": "created", "url": "https://github.com/owner/repo/releases/tag/v1.2.0" }
{ "ok": true, "provider": "github", "tag": "v1.2.0", "action": "updated" }
```

离线：发布时 `offline=true` 且本次 `hasRemote=false` 的仓库仍可同步（Release 与 tag 推送独立）；前端据 `navigator.onLine` / `hasRemote` 禁用按钮并提示「离线环境或未配置远程，无法同步」。

实现：`apps/server/src/api/history.ts`（新增路由）；底层 `@bxverse/core/release`（`parseRemoteUrl` 复用 git 远程解析逻辑，`publishReleaseNote` 处理 GitHub/Gitee 双协议与幂等 GET+POST/PATCH）。

### 10.10 多项目跨工程版本矩阵（R31）

> 设计动机：多项目常共用同一批前端工程（如 `l-pc-front` 在主产品线 / 灰度项目 / 演示项目里都接入），需要「按项目管理工程版本」的可视化矩阵。**端到端 0 入侵**——纯聚合展示，不改任何业务仓库，0 写入。

#### GET /api/matrix

用途：聚合所有项目×所有仓库的版本矩阵，对角线单元格高亮「跨项目版本不齐」。

响应 `200`（`VersionMatrix`，见 `packages/shared/src/types.ts`）：

```json
{
  "generatedAt": "2026-08-31T10:00:00.000Z",
  "columns": [
    { "app": "l-pc-front", "name": "PC 前台", "occurrences": 3, "displayName": "l-pc-front · 3 项目" },
    { "app": "l-data-v",   "name": "数据可视化", "occurrences": 2, "displayName": "l-data-v · 2 项目" }
  ],
  "projects": [
    {
      "id": "p_main",
      "name": "主产品线",
      "version": "1.2.0",
      "lastRelease": { "version": "1.2.0", "date": "2026-08-29", "daysAgo": 2 },
      "changedCount": 3,
      "cells": {
        "r_pc_front": {
          "absent": false,
          "version": "1.2.0",
          "lastRelease": { "version": "1.2.0", "date": "2026-08-29", "daysAgo": 2 },
          "changed": true,
          "commits": 4,
          "repoKind": "nodejs"
        },
        "r_data_v": {
          "absent": false,
          "version": "1.0.5",
          "lastRelease": { "version": "1.0.5", "date": "2026-08-20", "daysAgo": 11 },
          "changed": false,
          "commits": 0,
          "repoKind": "nodejs"
        }
      }
    }
  ],
  "driftColumns": ["l-data-v"]
}
```

字段语义：

| 字段 | 说明 |
|---|---|
| `generatedAt` | 矩阵生成时间（ISO 8601） |
| `columns[]` | 矩阵列（仓库）；按 `occurrences desc, app asc` 排序——出现项目多→少→无；`displayName` = `app + · N 项目`（仅 N>1 时） |
| `projects[]` | 矩阵行（项目）；按配置顺序输出；`changedCount` = 该项目下 `changed=true` 的仓库数 |
| `projects[].cells[repoId]` | 单元格；`absent=true` 表示该项目未接入该仓库；`version` 来自仓库 `versionFile` 或 fallback 项目 `version`；`lastRelease` 来自该仓库 `dataStore.listRecords(repoId, {full:false,limit:1})` |
| `driftColumns[]` | 「跨项目版本不齐」的列（`app`）—— 同一 `app` 在不同项目里 `version` 不一致时列入；前端据此给该列加视觉强调（暖色描边/感叹号） |

**核心不变性**：①本端点只读（仅 `services.poll.get` + `dataStore.listRecords`），不调用任何 git 写操作、不写 `app.json`、不写数据仓库 → 业务仓 0 入侵；②单仓 `poll.get` 失败时容错（视为 `absent=false, version='-', commits=0`，不阻断其他仓）；③`runWithPool` limit 6 并行收集（与 `overview.ts` 同源）；④响应大小估计：N 项目 × M 仓 ≤ 2000 单元格的轻量 JSON，gzip < 50KB。

实现：`apps/server/src/api/matrix.ts`（新增路由）；底层 `packages/core/src/matrix.ts` `buildMatrix()` 纯函数（输入 `(cfg, pollCache, dataStore, runWithPool)`，输出 `VersionMatrix`）。性能：所有 `dataStore.listRecords` 走 `{full:false}` 索引摘要快速路径（与 `overview.ts` A3 同源），单端点 P99 < 500ms（实测 ~80-150ms / 50 仓）。

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
| §10.10 Version Matrix | R31 | 多项目跨工程版本矩阵；0 入侵纯聚合 |

---

## 13. 变更记录

| 日期 | 变更 |
|---|---|
| 2026-08-13 | 初版（v0.1）：与 requirements.md / architecture.md / types.ts 对齐的全量 API 设计 |
| 2026-08-13 | §8.1 补 `excludeCommits`（`Record<repoId, fullHash[]>`，提交级人工排除；引擎过滤后重算 `changed`，全部排除且无 dirty 的仓库自动降级 `syncedOnly`；warnings 记录排除数；非对象或值非字符串数组 → 400 `VALIDATION`） |
| 2026-08-13 | §4.3 补 `items?: RepoVersionItem[]`（传入则直接写入该内容——发布历史快照导出用；缺省实时采集当前版本）；§7.2 示例 `repos` 补 `displayName` |
| 2026-08-13 | 新增 §10.3 `GET /api/health`（免 token，响应 `{ok:true, version}`，实现于 `apps/server/src/app.ts`；§1.3/§3.1「唯一免 token 端点」表述同步修正） |
| 2026-08-21 | §2 新增 `usage/cleanup/restore/openapi.json/metrics` 5 端点；§3.2 `POST /api/config` 校验 `backup.retention`；§10.6/10.7 契约与可观测性 + 备份增强（`retention` 零依赖校验+绝对路径校验） |
| 2026-08-13 | §2 端点总览补齐：`/api/health`、`/api/projects/:id/versions`、`/api/projects/:id/versions/export`、`/api/releases/:id/versions`、`/api/repos/:pid/:rid/backups`、`/api/backups/*`（元数据/下载/删除/compare/verify）、`/api/repos/:pid/:rid/diff`；实现文件栏按实际源码路径填写 |
| 2026-08-17 | 新增 §7.5 AI 供应商管理与能力：providers CRUD / credential（write-only）/ test / polish 升级多供应商；§7.5.3 阶段二 AI Git 助手与 `/api/repos/:pid/:rid/git/*` 路由（设计预留）；§3.1 `ai.apiKey` 语义改为永不回显（`hasKey` 布尔）；§3.2 `POST /api/config` 兼容旧 `ai.apiKey`（迁移到 credentials 后置空） |
| 2026-08-17 | §7.5.3 阶段二落地：实现 `/api/repos/:pid/:rid/git/*`（status/diff/stage/unstage/commit/push/pull）与 `/api/ai/commit-message`、`/api/ai/explain-diff` 路由，更新请求/响应参数契约 |
| 2026-08-25 | M7 恢复收口：§10.8 restore 补 overwrite 冲突策略 + restores 审计；§10.3 health 响应扩展 home 字段 |
| 2026-08-26 | §10.x OverviewData 扩展：顶层 + 项目级 dirtyRepoCount、lastRelease.daysAgo |
| 2026-08-26 | 新增 GET /api/ops/doctor：调 core/doctor.runDoctor 返回 DoctorReport（home/at/counts/overall/projects[repos[hints]]），同源 CLI 端 scripts/doctor.mjs；需 X-BX-Token |
| 2026-08-26 | §10.x 新增 GET /api/publish/:taskId/failure（结构化失败诊断：failedRepos[] + reports[] FailedRepoReport）；POST /api/publish/:taskId/rollback body {repoIds?}（仅删自产 build 标签 + 标 deprecate + 写 R24 审计） |
| 2026-08-26 | 新增 GET /api/ops/process（自举版本/内存 RSS/uptime/BX_HOME/nodeVersion/platform/startedAt）+ GET /api/ops/logs?level=all|info|warn|error（30 天滚动 JSON 日志流，最多 500 行倒序） |
| 2026-08-26 | 新增 GET /api/overview/weekly（近 8 周发布次数 + 跨项目数，按 ISO 周分组，0 周也展示空柱） |
