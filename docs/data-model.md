# bxverse 数据模型与存储设计

> 文档版本：v0.1（2026-08-13）
> 依据：`docs/requirements.md`（唯一需求依据）、`docs/architecture.md`、`packages/shared/src/types.ts`（定稿共享类型）、`packages/shared/src/constants.ts`（定稿常量）。
> 读者：后续开发 agent 与维护者。**本文中出现的所有领域字段名与 `types.ts` 一字不差；本文不新增任何共享类型字段**，需要扩展的能力一律列入 §11「待扩展」，且注明扩展方式与「不影响现有类型」。
> 与 `architecture.md` 的关系：architecture 定义进程/接口/可靠性，本文定义「数据落在哪里、长什么样、何时写、怎么读」。

---

## 1. 概述与设计约束

### 1.1 数据分类

| 类别 | 位置 | 持久化方式 | 权威性 |
|---|---|---|---|
| 应用配置（含项目/仓库定义） | `~/.bxverse/app.json` | 单文件 JSON，原子写 | 本机配置权威 |
| 凭据 | `~/.bxverse/credentials.json` | 单文件 JSON，原子写，0600 | 本机秘密，永不进 git |
| 发布记录与双轨日志 | `~/.bxverse/data/`（数据仓库） | git 仓库，每发布一次一条 commit | git 历史即审计 |
| 克隆的仓库 | `~/.bxverse/repos/{projectId}/{repoId}/` | git clone 工作树 | 业务仓库副本 |
| 发布 journal | `~/.bxverse/journal/{taskId}.json` | 单文件 JSON，原子写 | 断点续跑凭据 |
| 运行日志 | `~/.bxverse/logs/` | 追加文本 | 排障 |
| 临时文件 | `~/.bxverse/tmp/` | 原子写中转 | 一次性 |

### 1.2 根目录定位（BX_HOME）

```
home = process.env.BX_HOME || path.join(os.homedir(), '.bxverse')   // APP_DATA_DIR_NAME
```

- `BX_HOME` 存在时**优先**使用（可为相对路径，解析为绝对路径后使用）；否则取用户主目录下的 `.bxverse`（常量 `APP_DATA_DIR_NAME`）。
- `AppConfig.dataDir` 是**数据仓库**的路径，默认 `{home}/data`，可被用户改到任意磁盘位置（如 `D:\bxverse-data`）；`home` 本身不可配置（由 `BX_HOME` 决定）。
- 所有目录在启动时自动 `mkdir -p` 确保存在。

### 1.3 全局读写规则

1. **原子写**：任何 JSON/Markdown 文件的完整重写都遵循「同目录（或 `tmp/`）写临时文件 `{name}.tmp-{pid}-{rand}` → `fs.renameSync` 覆盖目标」两步；`rename` 在同一磁盘卷上原子，崩溃时目标文件要么是旧内容要么是新内容，绝无半截文件。
2. **记录不可变**：发布记录（`releases/` 下）一经落盘不可改写、不可删除（工具内不提供删除 API）；修改仅能通过「再次发布」产生新记录。数据仓库 git 历史是第二道保险。
3. **凭据分离**：token、远程凭据、AI `apiKey` 等秘密永不写入 `data/` 与 `app.json`（`AppConfig.ai.apiKey` 例外，见 §3.1），数据仓库 `.gitignore` 兜底。
4. **字段一字不差**：所有 JSON 文件中的领域字段序列化即 `types.ts` 中同名类型的 JSON 形态（camelCase，可选字段缺省时不输出）。

---

## 2. 实体关系

```
AppConfig ─── 1:N ─── ProjectDef ─── 1:N ─── RepoDef
   (app.json)              │                    │
                           │                    │ path 指向
                           │ 1:N                ▼
                           │           业务 git 仓库（磁盘，数据权威）
                           │
                           ▼
                    ReleaseRecord (kind='project')
                        │  repos[]: RepoReleaseRef[]
                        └── 1:N 快照引用 ──► ReleaseRecord (kind='repo')
                                                 │
                                                 ▼
                                            RepoDef（同一仓库，多版本记录）

数据仓库 data/（git）：持久化全部 ReleaseRecord（releases/ 目录树 + index.json）
```

关系要点：

- `ProjectDef.repos` **内嵌** `RepoDef[]`，随项目一起存于 `app.json`（`AppConfig.projects`）。仓库不是独立文件。
- 一个 `RepoDef` 对应一个磁盘 git 仓库（本地路径 `path`，或克隆目录）。同一仓库生命周期内产生多条 `kind='repo'` 的 `ReleaseRecord`（每次发布一条）。
- 一个 `ProjectDef` 每次统一发布产生一条 `kind='project'` 的 `ReleaseRecord`，其 `repos[]` 为 `RepoReleaseRef[]` 快照（防止事后仓库改名/删除影响历史记录展示）。
- `ReleaseRecord` 是**落盘即冻结**的不可变快照；`ProjectDef`/`RepoDef` 是**可变**的当前定义。

---

## 3. 字段语义（与 types.ts 逐字对齐）

> 类型一律以 `packages/shared/src/types.ts` 为准；本节逐项解释语义与运行时规则，字段名一字不差。

### 3.1 `AppConfig`（app.json 顶层）

| 字段 | 类型 | 语义与规则 | 默认值 |
|---|---|---|---|
| `port` | `number` | HTTP 监听端口 | `8899`（`APP_DEFAULT_PORT`） |
| `host` | `string` | 监听地址；非回环地址时启动打印安全警告 | `127.0.0.1` |
| `theme` | `'light' \| 'dark' \| 'system'` | UI 主题 | `system` |
| `pwa` | `{ enabled: boolean }` | PWA 开关：`enabled=true` 时 web 动态注册 service worker（`vite-plugin-pwa` 产物），否则不注册 | `{ enabled: false }` |
| `dataDir` | `string` | 数据仓库绝对路径（`releases/` 所在 git 仓库根） | `{home}/data` |
| `pollInterval` | `number` | 轮询检测周期（毫秒） | `30000` |
| `ai` | `{ enabled, baseUrl, model, apiKey }` | 可选 AI 润色：`enabled=false` 时整条链路短路；`apiKey` 仅存本机 app.json，不进数据仓库、不出本机 | `{ enabled: false, baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', apiKey: '' }` |
| `projects` | `ProjectDef[]` | **全部项目定义内嵌于此**。项目/仓库 CRUD、`lastPublishCommit` 更新都改写本字段并整体原子写回 app.json | `[]`（首启后可引导创建「默认项目」并接入 R11 的 6 个工程） |

写入时机：首次启动（生成默认）、`PUT /api/config`、项目/仓库 CRUD、每次发布完成后更新 `RepoDef.lastPublishCommit`。发布任务运行中配置写入返回 409。

### 3.2 `ProjectDef`

| 字段 | 类型 | 语义与规则 | 默认值 |
|---|---|---|---|
| `id` | `string` | 项目唯一 ID，规则 `p_` + 6 位小写字母数字（如 `p_3f1a2b`），创建时生成、永不改变 | — |
| `name` | `string` | 项目名（必填，允许重名） | — |
| `description` | `string`（可选） | 项目描述 | 缺省不输出 |
| `version` | `string` | 当前统一版本，**规范形态恒带 `v` 前缀**（`v1.2.0`），与 `SEMVER_RE` 兼容；发布成功后前移 | `v0.1.0` |
| `bump` | `'auto' \| 'manual'` | 版本建议来源：`auto`=按提交语义推断（§6.2）；`manual`=建议恒为 `patch`，由用户在向导自选 | `auto` |
| `repoVersionScheme` | `'hybrid' \| 'timestamp'` | 仓库版本号方案（§6.1）：`hybrid`=vX.Y.Z.YYMMDDHH；`timestamp`=vYYMMDDHH | `hybrid` |
| `externalExclude` | `CommitType[]` | 对外日志排除的提交类型 | `DEFAULT_EXTERNAL_EXCLUDE`（`['chore','docs','test','style','ci','build','revert']`） |
| `repos` | `RepoDef[]` | 仓库列表，顺序即 UI 展示顺序 | `[]` |
| `createdAt` / `updatedAt` | `string`（可选） | ISO 8601 本地时区时间；`updatedAt` 每次 CRUD/发布触及时更新 | 创建/更新时写入 |

### 3.3 `RepoDef`

| 字段 | 类型 | 语义与规则 | 默认值 |
|---|---|---|---|
| `id` | `string` | 仓库唯一 ID，规则 `r_` + 6 位小写字母数字；也是克隆目录名 | — |
| `name` | `string` | 仓库名（默认取目录名/URL 仓库名） | — |
| `path` | `string` | 本地绝对路径：接入时校验存在且含 `.git`；URL 克隆成功后指向克隆目录 | — |
| `remote` | `string`（可选） | origin 远程地址（接入时从 git config 读取；克隆时为 `CloneRequest.url`） | 缺省不输出 |
| `buildCommand` | `string`（可选） | 发版前执行的构建命令（`shell` 语义，如 `npm run build`）；空/缺省 = 跳过构建 | 缺省不输出 |
| `outputDir` | `string`（可选） | `version.json`/`version-history.json` 输出目录（相对仓库根） | `public` |
| `writeVersionFile` | `boolean`（可选） | 是否在业务仓库内写版本文件；`false` 实现零侵入（只打 tag） | `true` |
| `lastPublishCommit` | `string \| null`（可选） | 上次统一发布时该仓库的 HEAD **fullHash**（40 hex）；变更检测基准，见 §8 | `null`（= 从未发布） |
| `createdAt` | `string`（可选） | ISO 8601 接入时间 | 接入时写入 |

### 3.4 `ReleaseRecord`（发布记录核心）

| 字段 | 类型 | 语义与规则 |
|---|---|---|
| `id` | `string` | 规则 `rel_{scopeId}_{versionSafeName}`（如 `rel_p_3f1a2b_v1.2.0`），唯一且全局可寻址（`GET /api/releases/:id`） |
| `kind` | `'project' \| 'repo'` | `project`=项目级统一发布记录；`repo`=单仓库发布记录（同一发布内两条都产生） |
| `scopeId` | `string` | 记录归属：`project` 时为项目 `id`；`repo` 时为仓库 `id`；同时是 `releases/{scopeId}/` 目录名 |
| `scopeName` | `string` | 落盘时刻的名称快照（`project` 时为项目 `name`，`repo` 时为仓库 `name`） |
| `version` | `string` | 本次发布版本：`project` 记录 = `vX.Y.Z`；`repo` 记录 = `vX.Y.Z.YYMMDDHH`（hybrid）或 `vYYMMDDHH`（timestamp） |
| `baseVersion` | `string` | 项目基版：`project` 记录 = 自身 `version`；`repo` 记录 = 所属项目 `ProjectDef.version`（同一次发布内全部一致） |
| `buildStamp` | `string` | `YYMMDDHH`（或撞名规避后的 `YYMMDDHHNN`，见 §6.3）；同一次发布内所有记录共享 |
| `bump` | `BumpType` | 项目基版本次实际采用的步长（`major`/`minor`/`patch`） |
| `date` | `string` | 发布完成时刻，ISO 8601 含时区偏移（如 `2026-08-13T15:30:00+08:00`） |
| `from` | `string \| null`（可选） | 变更检测起点 commit（fullHash）：`repo` 记录 = 该仓库 `lastPublishCommit`（首次发布为 `null`）；`project` 记录恒为 `null`（聚合无单一范围） |
| `to` | `string`（可选） | 变更检测终点 commit（fullHash）= 发布时刻 HEAD；`project` 记录缺省 |
| `commits` | `CommitInfo[]` | 本次发布包含的提交（`repo` 记录为该仓库范围；`project` 记录为全部参与仓库的聚合） |
| `stats` | `Stats` | 聚合统计（`commits`/`filesChanged`/`insertions`/`deletions`/`byType`），`byType` 恒含 12 个 `CommitType` 键（未出现为 0） |
| `logs` | `{ internal: ReleaseLog, external: ReleaseLog }` | 双轨日志，状态机见 §7 |
| `repos` | `RepoReleaseRef[]`（可选） | 仅 `kind='project'` 存在：各成功仓库快照（`repoId`/`repoName`/`version`/`commits`），**只含成功仓库**（失败仓库见 `PublishPlan.warnings` 与 `done` 事件 `failedRepos`） |
| `tags` | `{ build?: string; milestone?: string }` | 打下的标签名快照：`repo` 记录含 `build`（如 `build/v1.2.0.26081315`）与 `milestone`（如 `v1.2.0`）；`project` 记录仅 `milestone` |
| `pushed` | `boolean` | 本次发布完成后数据仓库远端推送是否成功（落盘时定值，不回溯改写）；`offline`/无 remote/推送失败 = `false` |
| `builtBy` | `string` | 发布人：`git config user.name <user.email>`；缺失时退化为 `bxverse <local>` |

### 3.5 辅助类型速查（字段名同 types.ts，语义补充）

| 类型 | 关键字段语义 |
|---|---|
| `BumpType` | `'major' \| 'minor' \| 'patch'`，语义化版本步长 |
| `CommitType` | 12 值（`COMMIT_TYPES`）：`feat/fix/perf/refactor/style/chore/docs/test/build/ci/revert/other` |
| `LogState` | `'auto' \| 'edited' \| 'confirmed'`，见 §7 |
| `CommitInfo` | `hash`=短 hash（7 位）；`fullHash`=40 hex；`author`=提交者名；`date`=`YYYY-MM-DD`；`subject`=首行；`type`=解析自 `COMMIT_TYPES`（无法识别为 `other`）；`scope`=解析失败或缺失为 `null`；`breaking`=subject/body 含 `BREAKING CHANGE` 或 `!` 标记；`files`=该提交触及文件（`--name-only`，去重后相对仓库根路径列表） |
| `Stats` | `commits`/`filesChanged`/`insertions`/`deletions` + `byType: Record<CommitType, number>` |
| `DiffStat` | `filesChanged`/`insertions`/`deletions`（单文件粒度之上的短平快统计，用于总览卡片） |
| `ReleaseLog` | `state` + `content` + `autoDraft`，见 §7 |
| `RepoReleaseRef` | `repoId`/`repoName`/`version`/`commits`：项目记录对仓库发布结果的快照 |
| `PlannedRepo` | 计划内单仓库：`repoId`/`name`/`changed`/`version`/`from`/`to`/`commits`/`buildCommand`；`changed=true` 进 `PublishPlan.changed`，`false` 进 `PublishPlan.syncedOnly` |
| `PublishPlan` | `projectId`/`projectName`/`projectVersion`（目标 `vX.Y.Z`）/`buildStamp`/`bump`（最终采用）/`suggestedBump`（推断建议）/`changed`/`syncedOnly`/`milestoneTag`/`tags`（`{repoId,name,tag}[]` 干跑预览标签清单）/`externalDraft`/`internalDraft`（项目级双轨草稿）/`warnings`（非阻断警告，如「首次发布仅展示最近 500 条」） |
| `PublishRequest` | `projectId`/`bump`（`BumpType \| 'auto'`，`auto` 表示采用 `suggestedBump`）/`repoIds`（不传 = 全部有变动仓库）/`skipBuild`/`offline`/`dryRun`/`externalContent`/`internalContent`（向导人工定稿，覆盖草稿） |
| `PublishEvent` | `type` 7 值（architecture §3.3）+ `message` + `repoId`（可选）+ `data`（可选，`done` 时携带 `releaseId/version/failedRepos`） |
| `RepoStatus` | 实时状态：`id/name/path/branch/head/dirty/hasRemote/remoteUrl`（无 remote 为 `''`）/`versionFile`（`{version,build,buildTime} \| null`，读业务仓库内 version.json）/`buildTags`（build 前缀 tag 列表）/`milestoneTag`（最新 milestone tag 或 `null`）/`changed`（`commits.length>0 \|\| dirty>0`）/`lastPublishCommit`/`commits` |
| `FileEntry` | `name/type('dir'\|'file')/size`（字节，目录为 0） |
| `TreeNode` | `path`（相对仓库根）/`entries`/`truncated`（超过上限截断，提示前端请求子目录） |
| `FileContent` | `path/size/binary/truncated/content/lines`；二进制或超限时 `content` 截断且置对应标志 |
| `OverviewData` | 总览聚合：`projectCount/repoCount/changedRepoCount/projects[]/changedRepos[]` |
| `CloneRequest` | `url`（仅 https/ssh）/`name`（可选，仓库显示名）/`shallow`（浅克隆开关） |

**ID 生成约定（core 私有实现）**：`projectId = 'p_' + nanoid6`、`repoId = 'r_' + nanoid6`（`[a-z0-9]`）、`taskId = 't_' + YYYYMMDD + '_' + HHmmss + '_' + rand4`、`releaseId = 'rel_' + scopeId + '_' + versionSafeName`。

---

## 4. 目录布局（`~/.bxverse/`）

```
~/.bxverse/                         ← home（BX_HOME 或 用户主目录/.bxverse）
├── app.json                        AppConfig 完整序列化（含 projects 内嵌）
├── credentials.json                会话 token + 可选远程凭据（0600，不进 git）
├── data/                           数据仓库根 = AppConfig.dataDir（git 仓库）
│   ├── .git/
│   ├── .gitignore                  *.tmp-*（临时文件兜底）
│   ├── index.json                  全局发布索引（见 §5.3）
│   └── releases/
│       ├── {scopeId}/              scopeId = 项目 id 或仓库 id
│       │   ├── index.json          该 scope 的发布索引（见 §5.3）
│       │   └── {versionSafeName}/
│       │       ├── data.json       ReleaseRecord 完整序列化（权威）
│       │       ├── internal.md     对内日志 Markdown（人读副本）
│       │       └── external.md     对外日志 Markdown（人读副本）
│       └── ...
├── repos/
│   └── {projectId}/
│       └── {repoId}/               URL 克隆的仓库工作树
├── journal/
│   └── {taskId}.json               发布 journal（architecture §6.1，不进 git）
├── logs/
│   └── server-YYYY-MM-DD.log       服务运行日志（追加写，不进 git）
└── tmp/                            原子写中转（启动时清理遗留 *.tmp-*）
```

| 路径 | 用途 | 格式 | 写入时机 | 写入方式 |
|---|---|---|---|---|
| `app.json` | 应用配置 | `AppConfig` JSON（UTF-8，2 空格缩进） | 首启生成默认；`PUT /api/config`；项目/仓库 CRUD；发布完成后更新 `lastPublishCommit` | 原子写（tmp + rename） |
| `credentials.json` | 会话 token、可选 git 远程凭据 | `{ token: string, remoteCredentials?: {...} }`（core 私有 schema） | 首启生成 token；`POST /api/auth/rotate` 轮换 | 原子写；POSIX 0600 / Windows ACL 收紧 |
| `data/`（整个目录） | 发布记录仓库 | git 仓库 | 首启 `git init` + 首次 commit；每次发布一条 commit；`POST /api/system/sync` 触发 pull/push | git 命令 |
| `repos/{projectId}/{repoId}/` | 克隆仓库 | git clone 工作树 | `POST /api/projects/:id/repos`（URL 接入）成功后 | `git clone`（`shallow` 按请求） |
| `journal/{taskId}.json` | 发布断点 | 见 architecture §6.1 | 每个 step 完成后 | 原子写 |
| `logs/` | 运行日志 | 文本 | server 运行期间 | 追加 |
| `tmp/` | 原子写中转 | 任意 | 每次原子写前 | 临时文件 + rename |

删除规则：删除项目/仓库时**不删除** `data/releases/` 下已有记录（审计不可变），仅从 `app.json` 移除定义；克隆仓库随仓库移除可删除 `repos/{projectId}/{repoId}/` 目录。

---

## 5. releases 存储布局（精确 schema 与读写规则）

### 5.1 路径与命名

```
data/releases/{scopeId}/{versionSafeName}/
  ├── data.json        ReleaseRecord 完整 JSON（权威数据，唯一判据）
  ├── internal.md      logs.internal.content 的 Markdown 原文
  └── external.md      logs.external.content 的 Markdown 原文
```

- `scopeId`：`kind='project'` → 项目 `id`；`kind='repo'` → 仓库 `id`。
- `versionSafeName`：`version.replace(/[<>:"/\\|?*\s]/g, '_')`。例：`v1.2.0` → `v1.2.0`；`v1.2.0.2608131501` → `v1.2.0.2608131501`。
- `data.json` 是 `ReleaseRecord` 的**完整**序列化（`logs.internal.content`/`logs.external.content` 原样包含）；两个 `.md` 是同内容 Markdown 副本（人可读、git diff 友好）。**权威以 `data.json` 为准**，读取 API 返回 `data.json` 内容；md 供外部工具与历史页源码视图消费。

### 5.2 `data.json` 精确 schema

```json
{
  "id": "rel_p_3f1a2b_v1.2.0",
  "kind": "project",
  "scopeId": "p_3f1a2b",
  "scopeName": "主产品线",
  "version": "v1.2.0",
  "baseVersion": "v1.2.0",
  "buildStamp": "26081315",
  "bump": "minor",
  "date": "2026-08-13T15:30:00+08:00",
  "from": null,
  "commits": [],
  "stats": {
    "commits": 14,
    "filesChanged": 32,
    "insertions": 512,
    "deletions": 96,
    "byType": { "feat": 3, "fix": 6, "perf": 1, "refactor": 2, "style": 0, "chore": 1, "docs": 1, "test": 0, "build": 0, "ci": 0, "revert": 0, "other": 0 }
  },
  "logs": {
    "internal": { "state": "confirmed", "content": "# 内部发布日志 …", "autoDraft": "# 内部发布日志（草稿）…" },
    "external": { "state": "confirmed", "content": "# 更新日志 …", "autoDraft": "# 更新日志（草稿）…" }
  },
  "repos": [
    { "repoId": "r_8k2m1n", "repoName": "l-pc-front", "version": "v1.2.0.26081315", "commits": [] }
  ],
  "tags": { "milestone": "v1.2.0" },
  "pushed": true,
  "builtBy": "demo <demo@example.com>"
}
```

- `kind='repo'` 记录：`scopeId` 为仓库 id、无 `repos`、`tags` 含 `build` 与 `milestone`、`from`/`to` 有值（首次发布 `from=null`）。
- 序列化约定：可选字段缺省不输出；`byType` 恒输出全部 12 键。

### 5.3 两级 `index.json`

`data/index.json`（全局索引，倒序新→旧）：

```json
{
  "schemaVersion": 1,
  "releases": [
    { "id": "rel_p_3f1a2b_v1.2.0", "kind": "project", "scopeId": "p_3f1a2b", "version": "v1.2.0", "date": "2026-08-13T15:30:00+08:00" },
    { "id": "rel_r_8k2m1n_v1.2.0.26081315", "kind": "repo", "scopeId": "r_8k2m1n", "version": "v1.2.0.26081315", "date": "2026-08-13T15:30:00+08:00" }
  ]
}
```

`data/releases/{scopeId}/index.json`（单 scope 索引）：

```json
{
  "schemaVersion": 1,
  "scopeId": "p_3f1a2b",
  "releases": [
    { "id": "rel_p_3f1a2b_v1.2.0", "kind": "project", "version": "v1.2.0", "buildStamp": "26081315", "date": "2026-08-13T15:30:00+08:00" }
  ]
}
```

### 5.4 写入序列（一次发布的完整落盘步骤）

一次发布**所有记录共用一条数据仓库 commit**。按序执行：

1. 在 `data/tmp-*`（或系统 tmp）生成 `data.json`、`internal.md`、`external.md` 临时文件。
2. `mkdir -p releases/{scopeId}/{versionSafeName}`。
3. 依次 rename：`internal.md` → `external.md` → **`data.json` 最后**（`data.json` 存在即「记录落盘完成」的判据；崩溃时最多留两个 md 无 data.json，启动清理即可）。
4. 原子重写 `releases/{scopeId}/index.json` 与 `data/index.json`（临时文件 + rename）。
5. `git add -A && git commit -m "release({kind}:{scopeId}): {version}"`（例：`release(project:p_3f1a2b): v1.2.0`）。
6. 尝试推送远端（§9），结果写入各记录的 `pushed` 字段——**注意**：`pushed` 在 step 3 生成 data.json 之前就已确定，因此序列实际为：先推送（或先 commit 再 push），`pushed` 值在生成 data.json 前定稿。实现顺序：commit → push（记录结果）→ 若需 `pushed` 落盘修正则以「commit 之后改 data.json 会破坏不可变」为约束，采用：**先 push 再生成 data.json**（push 失败仍生成，`pushed=false`）。最终实现二选一均须保证 data.json 落盘后不再改动。

幂等规则：目标目录已存在 `data.json` → 视为重复落盘，报错中止（版本号与 buildStamp 规则应天然避免同目录重名）。

### 5.5 读取规则

- `GET /api/projects/:id/releases`：读 `releases/{projectId}/index.json`，按 id 逐条读 `data.json`，返回 `ReleaseRecord[]`（倒序）。
- `GET /api/releases/:id`：解析 id 中 `scopeId` 与 `versionSafeName`，直接定位目录读 `data.json`。
- 索引损坏/缺失时：扫描 `releases/*/*/data.json` 重建（启动时自愈）。
- 数据仓库 `pull` 后新增记录自动可见（下一次请求重读磁盘，不做跨请求缓存）。

---

## 6. 版本号体系

### 6.1 三种方案

| 方案 | 形态 | 使用对象 | 正则 | 示例 |
|---|---|---|---|---|
| semver | `vX.Y.Z` | 项目统一版本、milestone 标签 | `SEMVER_RE` | `v1.2.0` |
| hybrid | `vX.Y.Z.YYMMDDHH` | 仓库版本（`repoVersionScheme='hybrid'`，默认）、build 标签 | `HYBRID_VERSION_RE`（末段 8–10 位） | `v1.2.0.26081315` |
| timestamp | `vYYMMDDHH` | 仓库版本（`repoVersionScheme='timestamp'`） | `SEMVER_RE` 不匹配；按 `^v(\d{8,10})$` 校验（core 私有） | `v26081315` |

- 规范形态**一律带 `v` 前缀**；解析时 `SEMVER_RE` 兼容无前缀输入。
- `vX.Y.Z` 的 X/Y/Z 从 0 起：X/Y/Z 进位后低位清零（如 `v1.9.9` + minor = `v2.0.0`）。
- 里程碑标签名 = `milestoneTag` = `v{X.Y.Z}`；build 标签名 = `build/` + 仓库版本（如 `build/v1.2.0.26081315`，`BUILD_TAG_PREFIX='build'`）。

### 6.2 bump 推断规则（`suggestedBump`）

输入：本次参与的 changed 仓库的 `CommitInfo[]`（仅看 `breaking` 与 `type`）。

| 优先级 | 条件 | 结果 |
|---|---|---|
| 1 | 任一提交 `breaking === true` | `major` |
| 2 | 否则任一提交 `type === 'feat'` | `minor` |
| 3 | 否则任一提交 `type === 'fix'` | `patch` |
| 4 | 其他（仅 chore/docs/style 等） | `patch` |

- `ProjectDef.bump === 'manual'` 时：`suggestedBump` 恒为 `patch`，不做推断。
- `PublishPlan.suggestedBump` = 推断建议；`PublishPlan.bump` = 最终采用值（向导中用户可覆盖）；`PublishRequest.bump`：传 `'auto'` 时 engine 采用 `suggestedBump`，传具体值则采用该值。
- 项目新版本 = 当前 `ProjectDef.version` 按 `bump` 递增；`milestoneTag = 'v' + 新 X.Y.Z`。

### 6.3 buildStamp 生成与撞名规避

- `buildStamp` 初值 = 发布执行时刻本地时间 `YYMMDDHH`（如 `26081315`），**同一次发布内所有仓库与两条记录共享**。
- 撞名判定（生成计划与执行前各查一次）：存在任一「目标 build 标签名 = `build/` + 计划中的仓库版本」已存在于相应仓库、且指向不同 commit；或 `releases/{scopeId}/{versionSafeName}` 目录已被本次目标版本占用。
- 规避策略：`buildStamp` 追加两位序号 → `YYMMDDHHNN`（`26081315` → `2608131501`，10 位），重新查重，仍撞则递增 `02`、`03`…。`HYBRID_VERSION_RE` 末段允许 8–10 位、`SEMVER_RE` 第 4 组允许 6–10 位，10 位 stamp 合法。
- 同一次发布内若中途发现撞名，**整计划重算版本**（重新生成 `PublishPlan`），不混用两个 stamp。
- milestone tag 撞名（`vX.Y.Z` 已存在且指向不同 commit）**不规避**：预检阻断，要求 bump（architecture §6.2）。

### 6.4 版本联动（R12）

- changed 仓库：新版本 = `v{新基版}.{buildStamp}`（hybrid）或 `v{buildStamp}`（timestamp）；打 milestone tag + build tag；写 version.json（§10）。
- `syncedOnly` 仓库（未变动、不在 `repoIds`）：不建 tag、不产生 `kind='repo'` 记录、不动 `lastPublishCommit`；仅在其 `writeVersionFile !== false` 时把 version.json 的 `version` 更新为 `v{新基版}`（不带 stamp），`build`/`buildTime` 保持上次值——保证全局基版一致（下次该仓库发布时基版已是新的）。
- 项目 `ProjectDef.version` 在项目记录落盘成功后前移为 `v{新基版}`（写 app.json）。

---

## 7. 日志状态机（auto / edited / confirmed）

### 7.1 状态流转

```
auto ──(用户编辑 content)──► edited ──(用户点击「确认」)──► confirmed
 ▲                              │                              │
 └────────(继续修改)────────────┘◄─────(再修改，回退)───────────┘
```

- `ReleaseLog` 三字段：`state: LogState`、`content`、`autoDraft`。
- `auto`：`content === autoDraft`（自动草稿，未人工改动）。
- `edited`：`content !== autoDraft`。
- `confirmed`：人工点击确认后置位；此后**再修改 `content` 立即回退为 `edited`**，必须重新确认。
- 两侧（`logs.internal` 与 `logs.external`）状态**独立**流转。
- 执行发布的前置条件：**项目级 internal 与 external 均为 `confirmed`**（向导第 4 步 gate）；仓库级日志当前仅自动生成（编辑通道见 §11 待扩展）。
- 需求澄清表中的「已发布」**不是** `LogState` 值：以 `ReleaseRecord` 的存在表达。记录落盘后 `logs` 冻结不再变化。

### 7.2 autoDraft 留底

- 草稿生成时机：`POST /api/projects/:id/plan` 时生成项目级 `PublishPlan.externalDraft`/`internalDraft`；`PublishRequest.externalContent`/`internalContent` 提交的定稿覆盖草稿。
- 落盘时：`autoDraft` = 该次计划的原始草稿（**永不修改**，即使向导多轮重新生成计划，以最终执行那次计划为准）；`content` = `PublishRequest.externalContent ?? externalDraft`（internal 同理）；`state` = `confirmed`（执行前提已满足）。
- 仓库级记录：`autoDraft` = `content` = 自动生成稿，`state = 'auto'`。

### 7.3 修订 diff 规则

- 对比对象：`autoDraft` vs `content`，**行级 LCS（最长公共子序列）diff**（core `logs/diff.ts`），前端 `DiffView.vue` 渲染增/删/不变三类行。
- 用途：向导内审阅与历史页「草稿 vs 定稿」对比视图；diff 本身不落盘（`autoDraft` 与 `content` 双存已足够随时重算）。
- 生成稿结构：internal 按「统计 → 提交明细（按 `CommitType` 分组，含 `hash`/`author`/`date`/`subject`/`files`）→ 影响文件 → 构建信息」分节；external 按 `EXTERNAL_SECTIONS` 的 `title` 分节（新增/优化/修复/其他），先排除 `ProjectDef.externalExclude` 类型再映射入节；无内容的节不输出。

---

## 8. 变更检测基准（`RepoDef.lastPublishCommit`）

### 8.1 语义与更新时机

- `lastPublishCommit` = 该仓库**上次成功参与统一发布时的 HEAD fullHash**。
- 更新时机：该仓库发布步骤全部完成（build 成功、tag 落定、version.json 写入、`kind='repo'` 记录落盘）后，将 `RepoDef.lastPublishCommit` 设为当时 HEAD，随 app.json 原子写；**发布失败或未参与发布的仓库不更新**。
- 项目级发布部分失败时：成功仓库已更新基准（与失败隔离原则一致，architecture §6.3），失败仓库下次仍显示「有变动」。

### 8.2 变更检测命令

- 常态：`git rev-list {lastPublishCommit}..HEAD`（空范围 = 无变动），解析为 `CommitInfo[]`；`changed = commits.length > 0 || dirty > 0`。
- **首次发布**（`lastPublishCommit == null`）：全量收集 `git rev-list HEAD`，**上限 500 条**（`--max-count=500`），超出截断并在 `PublishPlan.warnings` 提示「首次发布，仅展示最近 500 条提交」。
- `lastPublishCommit` 不可达（force-push / GC 后）：警告 + 按首次发布全量收集处理（architecture §6.2）。
- `dirty > 0`：状态可见，但预检阻断发布（要求先提交或 stash）。

### 8.3 基准的前移条件

- 只有「该仓库本次发布成功」才前移基准；`syncedOnly` 仓库、失败仓库、`dryRun` 任务均**不动** `lastPublishCommit`。
- 幂等续跑（journal 恢复）时：以「tag 已存在」判定步骤已 done，不会重复前移（architecture §6.4）。

---

## 9. 多机同步策略（数据仓库 git 语义）

### 9.1 git 语义

- `data/` 是普通 git 仓库：每发布一次 = 一条 commit（message 格式 `release({kind}:{scopeId}): {version}`，author = `builtBy` 对应的 git 身份）；历史即审计（谁、何时、发布了什么版本）。
- 除 `releases/` 与 `index.json` 外，`data/` 不落任何文件；`.gitignore` 至少含 `*.tmp-*`。

### 9.2 远端配置

- 远端 = `data/` 仓库自身的 `git remote`（设置页配置 → `git remote add origin <url>` / `git remote set-url` / `git remote remove`），URL 存于 `data/.git/config`，**不写入 `app.json`**。
- 认证：走系统 git credential helper 或 SSH agent；如需内嵌凭据（不推荐），存 `credentials.json` 的 `remoteCredentials`（不进数据仓库）。

### 9.3 同步时机与降级

| 时机 | 操作 | 失败处理 |
|---|---|---|
| server 启动 | `git pull --ff-only`（无 remote / 离线则跳过） | 警告，不阻断启动 |
| 每次发布落盘后 | `git push`（`PublishRequest.offline=true` 或无 remote 则跳过） | 该记录 `pushed=false` + SSE 警告（降级纯本地） |
| 手动 | `POST /api/system/sync`：pull → push | 返回错误详情供 UI 展示 |

### 9.4 冲突应对

- 原则：**本地永不强制改写**。`pull --ff-only` 因分叉失败 → 保留本地提交，UI 提示「数据仓库与远端分叉」。
- 人工解决（在 `bx-manager data-dir` 打开的目录内）：
  1. `git pull --rebase origin <branch>`（本地记录为重放基准，远端新记录按时间后置）；
  2. 若 rebase 冲突：`git rebase --continue` 手动保留两侧的 `releases/**`（不同目录天然不冲突，仅 `index.json` 需合并——保留两侧条目按 `date` 排序）；
  3. `git push` 完成收敛。
- 冲突期间本地功能**不受影响**：发布照常落盘（新目录），只是暂未推送。

---

## 10. 业务仓库内的写入物（version.json / version-history.json）

受 `RepoDef.writeVersionFile`（默认 `true`）与 `RepoDef.outputDir`（默认 `public`）控制，写入业务仓库工作树（**仅文件，无 commit**）：

```json
// {outputDir}/version.json
{ "version": "v1.2.0.26081315", "build": "26081315", "buildTime": "2026-08-13T15:30:00+08:00" }
```

- 字段与 `RepoStatus.versionFile` 逐字一致：`version`（hybrid/timestamp 完整版本或 syncedOnly 时的 `v{X.Y.Z}`）、`build`（buildStamp）、`buildTime`（ISO 时间）。
- `{outputDir}/version-history.json`：数组追加一条同构对象（`[ {version,build,buildTime}, … ]`），历史审计用。
- 幂等：文件已存在且内容一致 → 跳过；不一致 → 报错（architecture §6.4）。
- 这些文件由业务仓库自行决定是否 commit/推送（工具不 commit），后续可被业务仓库 gitignore。

---

## 11. 待扩展（不改变现有 types.ts）

| 编号 | 扩展 | 方式 | 影响 |
|---|---|---|---|
| X1 | 仓库级日志人工编辑确认（R14 全量覆盖） | `PublishRequest` 增加可选 `repoLogs?: { repoId: string; internalContent: string; externalContent: string }[]` | 新可选字段，旧客户端不传即现有行为；**待共享类型正式定稿后再加，此前仓库级记录恒 `state='auto'`** |
| X2 | 纯时间戳项目级方案 | `ProjectDef.bump`/版本语义扩展为三态方案枚举 | 需新增联合类型，不提前落地 |
| X3 | 发布附件/制品归档 | `ReleaseRecord` 增加可选 `artifacts?: …` | 可选字段，不影响旧记录读取 |
| X4 | AI 润色草稿缓存 | 数据仓库增加 `drafts/` 目录（非 releases） | 纯存储扩展，不触碰类型 |
| X5 | Tauri 桌面壳 | 独立应用包 | 无类型影响 |
| X6 | 多会话 token / 权限分级 | `credentials.json` 结构扩展 | core 私有 schema，无共享类型影响 |

---

## 12. 完整示例

### 12.1 `app.json` 示例

```json
{
  "port": 8899,
  "host": "127.0.0.1",
  "theme": "system",
  "pwa": { "enabled": false },
  "dataDir": "C:\\Users\\demo\\.bxverse\\data",
  "pollInterval": 30000,
  "ai": { "enabled": false, "baseUrl": "https://api.openai.com/v1", "model": "gpt-4o-mini", "apiKey": "" },
  "projects": [
    {
      "id": "p_3f1a2b",
      "name": "主产品线",
      "description": "R11 的 6 个现有工程",
      "version": "v1.2.0",
      "bump": "auto",
      "repoVersionScheme": "hybrid",
      "externalExclude": ["chore", "docs", "test", "style", "ci", "build", "revert"],
      "repos": [
        {
          "id": "r_8k2m1n",
          "name": "l-pc-front",
          "path": "E:\\bx-gitee\\l-pc-front",
          "remote": "https://gitee.com/bx/l-pc-front.git",
          "buildCommand": "npm run build",
          "outputDir": "public",
          "writeVersionFile": true,
          "lastPublishCommit": "9f2c8a1b3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a",
          "createdAt": "2026-08-13T10:00:00+08:00"
        },
        {
          "id": "r_x9y2z3",
          "name": "im-web",
          "path": "C:\\Users\\demo\\.bxverse\\repos\\p_3f1a2b\\r_x9y2z3",
          "remote": "https://gitee.com/bx/im-web.git",
          "writeVersionFile": true,
          "lastPublishCommit": null,
          "createdAt": "2026-08-13T10:05:00+08:00"
        }
      ],
      "createdAt": "2026-08-13T10:00:00+08:00",
      "updatedAt": "2026-08-13T15:30:00+08:00"
    }
  ]
}
```

### 12.2 仓库级记录 `data.json` 示例（`releases/r_8k2m1n/v1.2.0.26081315/data.json`）

```json
{
  "id": "rel_r_8k2m1n_v1.2.0.26081315",
  "kind": "repo",
  "scopeId": "r_8k2m1n",
  "scopeName": "l-pc-front",
  "version": "v1.2.0.26081315",
  "baseVersion": "v1.2.0",
  "buildStamp": "26081315",
  "bump": "minor",
  "date": "2026-08-13T15:30:00+08:00",
  "from": "9f2c8a1b3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a",
  "to": "e8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9",
  "commits": [
    {
      "hash": "9f2c8a1",
      "fullHash": "9f2c8a1b3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a",
      "author": "demo",
      "date": "2026-08-12",
      "subject": "feat: 新增订单列表导出",
      "type": "feat",
      "scope": null,
      "breaking": false,
      "files": ["src/views/order/List.vue", "src/api/order.ts"]
    }
  ],
  "stats": {
    "commits": 3,
    "filesChanged": 7,
    "insertions": 120,
    "deletions": 18,
    "byType": { "feat": 2, "fix": 1, "perf": 0, "refactor": 0, "style": 0, "chore": 0, "docs": 0, "test": 0, "build": 0, "ci": 0, "revert": 0, "other": 0 }
  },
  "logs": {
    "internal": { "state": "auto", "content": "# 内部发布日志 l-pc-front v1.2.0.26081315\n\n## 统计\n- 提交 3 条 · 文件 7 个 · +120 / -18\n\n## 提交明细\n### feat\n- 9f2c8a1 (demo, 2026-08-12) 新增订单列表导出\n\n## 影响文件\n- src/views/order/List.vue\n- src/api/order.ts\n\n## 构建\n- npm run build 成功（8.2s）", "autoDraft": "# 内部发布日志 l-pc-front v1.2.0.26081315\n\n## 统计\n- 提交 3 条 · 文件 7 个 · +120 / -18\n\n## 提交明细\n### feat\n- 9f2c8a1 (demo, 2026-08-12) 新增订单列表导出\n\n## 影响文件\n- src/views/order/List.vue\n- src/api/order.ts\n\n## 构建\n- npm run build 成功（8.2s）" },
    "external": { "state": "auto", "content": "# 更新日志 v1.2.0.26081315\n\n发布日期：2026-08-13\n\n## 新增\n- 新增订单列表导出\n\n## 修复\n- 修复导出分页丢失问题", "autoDraft": "# 更新日志 v1.2.0.26081315\n\n发布日期：2026-08-13\n\n## 新增\n- 新增订单列表导出\n\n## 修复\n- 修复导出分页丢失问题" }
  },
  "tags": { "build": "build/v1.2.0.26081315", "milestone": "v1.2.0" },
  "pushed": true,
  "builtBy": "demo <demo@example.com>"
}
```

### 12.3 数据目录树示例（发布 `v1.2.0` 之后）

```
~/.bxverse/
├── app.json
├── credentials.json
├── data/
│   ├── .gitignore
│   ├── index.json
│   └── releases/
│       ├── p_3f1a2b/
│       │   ├── index.json
│       │   ├── v1.1.0/
│       │   │   ├── data.json
│       │   │   ├── internal.md
│       │   │   └── external.md
│       │   └── v1.2.0/
│       │       ├── data.json
│       │       ├── internal.md
│       │       └── external.md
│       └── r_8k2m1n/
│           ├── index.json
│           └── v1.2.0.26081315/
│               ├── data.json
│               ├── internal.md
│               └── external.md
├── repos/
│   └── p_3f1a2b/
│       └── r_x9y2z3/            ← 克隆的 im-web
├── journal/
├── logs/
│   └── server-2026-08-13.log
└── tmp/
```

---

## 13. 与需求文档的对应关系

| 需求编号 | 需求 | 本文章节 |
|---|---|---|
| R1 | 客户端形态（本地 Web/PWA） | §3.1 `AppConfig.pwa.enabled` 运行时开关；架构 §3.4 |
| R2 | 两级管理模型 | §2 实体关系、§3.2 `ProjectDef.repos` |
| R3 | 仓库接入（本地路径 + URL 克隆） | §3.3 `RepoDef.path`、§3.5 `CloneRequest`、§4 `repos/` 克隆目录 |
| R4 | 仓库目录结构与文件查看 | §3.5 `TreeNode`/`FileEntry`/`FileContent`（懒加载/截断） |
| R5 | 仓库级版本与日志 | §5 releases 布局、§6.1 hybrid/timestamp、§7 |
| R6 | 项目级版本与日志 | §3.2 `ProjectDef.version`、§6.2 bump、§5 `kind='project'` 记录 |
| R7 | 日志双轨（对内/对外） | §3.4 `ReleaseRecord.logs`、§7 状态机 |
| R8 | 版本号方案（X.Y.Z 或时间戳，可配） | §6.1 三方案、§3.2 `repoVersionScheme`、X2 纯时间戳项目级待扩展 |
| R9 | 版本/日志自动化 | §6.2 bump 推断、§7.2 草稿生成、`autoDraft` 留底 |
| R10 | 纯本地与远程联动双模式 | §9 同步与降级、§3.4 `ReleaseRecord.pushed`、`PublishRequest.offline` |
| R11 | 现有 6 工程入一个项目 | §3.1 `AppConfig.projects` 首启引导接入「默认项目」 |
| R12 | 版本联动 | §6.4 基版同步与 `syncedOnly` |
| R13 | 改动点可见 | §8 变更检测、§3.5 `RepoStatus.commits`/`changed` |
| R14 | 日志人工编辑确认 | §7 状态机与执行 gate；仓库级编辑通道见 §11 X1 |
| R15 | 完整性、无历史包袱 | §11 待扩展清单（新设计为准，不迁就旧实现） |
| R16 | 好用 | §5.5 索引快速读取、§4 启动自愈 |
| R17 | UI/UX | 本文档为数据层设计；UI 承接见架构 §1.2 原则三 |
| 非功能·安全 | 凭据独立、token 走 Header | §1.3 规则 3、§4 `credentials.json` |
| 非功能·可靠性 | 可中断续跑、失败隔离 | §4 journal、§5.4 落盘判据、架构 §6 |
| 非功能·兼容 | 离线/无 origin 自动降级 | §9.3 降级表 |
