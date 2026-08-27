# bxverse（BX 版本管理台）重新开发完整需求规格

> 本文档是「把 bxverse 交给 AI 从零重新开发」的**唯一输入规格**：自包含、可直接开工，
> 覆盖原始需求、产品形态、架构、数据契约（字段级）、核心引擎（函数级）、服务端（端点级）、
> 前端（页面/交互级）、边界情况与验收标准。
>
> 规格来源：项目既有 `docs/` 设计文档（requirements/architecture/core-engine/data-model/api/frontend/development）
> 与已定稿实现（`packages/shared` 类型与常量、core/server/web 源码）的逐项提取。
> 文档内所有领域字段名、常量值、路由路径、错误码均与定稿契约**一字不差**，可直接作为实现基线。

---

## 0. 使用说明（给重建 AI）

- **目标**：从零重建一个功能等价、契约等价、体验达标的 bxverse。允许技术栈内部实现方式不同，但**对外契约（shared 类型、REST/SSE 端点、版本/标签/文件格式、数据目录布局）必须一致**，否则迁移既有数据会失败。
- **实现顺序建议**：按 §15 里程碑 M1→M7 串行推进；每个里程碑交付前必须通过 §14 对应验收。
- **硬性底线**：`@bxverse/core` 与 `@bxverse/server` **零第三方运行时依赖**（仅 Node 内置 + `child_process.spawn('git')`）；git 参数一律数组形式传参（禁 shell 字符串拼接）；`@bxverse/web` 按锁定技术栈添加依赖。
- **跨包通信**：web 与 server 只通过 HTTP/SSE 交换数据（一律 shared 类型）；web 禁止导入 core/server。
- **数据权威**：被管理的业务仓库是数据权威，工具**永不自动 commit/amend/force-push/移动分支**；对业务仓库的全部写入仅三类且可关闭（打标签、写 version.json、推送标签）。
- **人工为终**：发布执行永远由人发起；双轨日志未全部「确认」禁止执行；AI 只产草稿。

---

## 1. 背景与原始需求

### 1.1 背景与痛点

现有多个业务工程散落在本机不同目录（`E:\bx-gitee\l-pc-front`、`E:\bx-gitee\l-data-v`、`E:\bx-gitee\l-mp-weixin-reface`、`E:\bx_pc_main\saas`、`E:\project\box-im\im-web`、`E:\bx-gitee\vr-fornt`，后续还会增加），各自有独立的版本与更新日志生成脚本（曾由 bx-version-cli 统一管理）。

痛点：仓库散乱、版本不统一、日志分散、跨仓库联动困难、缺少可视化管理界面。

目标：**一个统一管理入口**，在本地以可视化方式管理「项目 → 代码仓库」两级结构，自动化生成版本号与更新日志，支持纯本地与远程（tag / release）两种模式。

### 1.2 原始需求清单（R1–R21，逐条保留原意）

| 编号 | 需求 | 原话要点 / 澄清结论 |
|---|---|---|
| R1 | 客户端形态 | 「web 端或者 tauri 打包的客户端」——**本地 Web 服务 + 浏览器**（127.0.0.1），PWA 可选安装；Tauri 壳远期备选 |
| R2 | 两级管理模型 | 「管理项目，每个项目底下有很多代码仓库，统一管理」 |
| R3 | 仓库接入方式 | 「输入 git 地址或选择本地位置」——**两种都支持**：本地路径（校验 .git）＋ Git 地址克隆（https/ssh，白名单协议） |
| R4 | 仓库内容查看 | 「查看到仓库的目录结构和文件」——懒加载文件树 + 文件查看器 |
| R5 | 仓库级版本与日志 | 项目内方便管理每个仓库的版本与更新日志 |
| R6 | 项目级版本与日志 | 项目也有统一版本和更新日志 |
| R7 | 日志双轨 | 仓库与项目的版本日志**都分对内（internal）和对外（external）** |
| R8 | 版本号方案 | 「按时间戳还是按通用的 X.Y.Z 版本号」——**可配置**：项目级 `vX.Y.Z` + 仓库级 `vX.Y.Z.YYMMDDHH`（混合，默认）/ `vYYMMDDHH`（时间戳） |
| R9 | 自动化 | 「所有生成版本号或日志尽量自动化」——检测、版本建议、日志草稿、dry-run 全自动；执行由人确认 |
| R10 | 双模式 | 「纯本地操作，也可结合远程仓库的 tag/release 功能」——有 remote 且非 offline 时推送标签；失败仅警告降级 |
| R11 | 现有工程托管 | 上述 6 个工程初期放在一个项目（如「主产品线」）中管理；模型支持任意多项目 |
| R12 | 版本联动 | 仓库变动 → 仓库版本随项目基版更新 → 项目统一版本 bump；**未变动仓库同步基版**保证全局一致 |
| R13 | 改动点可见 | 统一工具中能看到每个仓库相对上次发布的提交与影响文件（聚合展示） |
| R14 | 日志人工可控 | 内/外日志**可自动生成也可人工编辑确认**，状态可追踪 |
| R15 | 完整性 | 「不需要有历史包袱」——以新设计为准，不迁就旧实现 |
| R16 | 好用 | 「满足需求的前提下足够好用」 |
| R17 | UI/UX | 「美观优雅精致大方，体验足够好」 |
| R18 | 版本清单导出 | 生成 JSON 数组 `[{app, name, version}]`；可下载、可写入项目下指定仓库的指定相对路径（树选目录）；与发布绑定（完成页导出当次清单、历史记录导出当时快照）；版本号格式可选「完整 / 仅日期（V+8 位时间戳）」；默认文件名 `version.json` |
| R19 | 版本一致性对比与发布备份 | 每次发布自动备份：①源码 = git bundle（全历史+标签）+ git archive 快照（遵循 .gitignore）；②产物 = 按仓库 `artifactDir` 打包 + 哈希清单；③三层一致性对比（源码 git diff / 产物清单对比 / manifest 校验）→ 新增/删除/修改/一致四类清单 + 报告导出；④备份元数据入数据仓库审计、大文件本地 `backups/`；⑤恢复功能远期低优先级 |
| R20 | 主题体系（实现期需求） | 双主题套件：Indigo 精密仪器套件（翠绿主色、亮/暗/跟随系统）+ WenXi 深色玻璃拟态套件（仅深色），设置页一键切换即时预览 |
| R21 | AI 能力（多供应商 + 阶段二 Git 助手） | ① AI 多供应商（OpenAI 兼容：DeepSeek/Kimi/通义/智谱/MiniMax/豆包/小米 MiMo/阶跃/百川/硅基流动/OpenRouter/AiHubMix/OpenAI/Groq/Mistral/Gemini/Ollama/LM Studio/vLLM/自定义），可切换当前生效；凭据 **write-only**（存 credentials.json，永不回显）；② 向导日志「AI 润色」多供应商；③ 阶段二：仓库 Git 面板（状态/diff/提交/stash/push/pull/标签）+ AI 生成提交信息（conventional 草稿）+ AI 变更解读 + 预检失败 AI 分析——**AI 只产草稿，写操作永远用户确认** |

### 1.3 发布默认值（2026-08-17 补充）

发布向导**默认离线发布（offline=true）、跳过构建命令（skipBuild=true）、不备份源码与产物（backupSource=false / backupArtifacts=false）**，均可手动开启。

---

## 2. 产品形态与技术约束

### 2.1 形态

- **本地 Web 管理台**：本机运行一个 Node 服务（默认 `127.0.0.1:8899`），浏览器访问管理；生产形态 server 托管前端静态产物，`pnpm start` 一键启动（CLI 薄壳打开浏览器）。
- **单进程**：HTTP、发布队列、SSE、轮询检测、数据仓库操作全部在 1 个 server 进程内。
- **可选 PWA**：`AppConfig.pwa.enabled` 运行时开关（true 注册 Service Worker、false 注销并清缓存），不依赖插件自动注册。
- **跨平台**：Windows 为主（含中文/空格路径、盘符），macOS/Linux 兼容；git 一律 `spawn` 数组参数、`-c core.quotepath=false` 保证中文路径 UTF-8。

### 2.2 Monorepo 结构与依赖方向（严禁反向）

```
packages/shared   @bxverse/shared   类型+常量，零依赖，唯一跨包契约（已定稿语义：只允许新增可选字段）
packages/core     @bxverse/core     领域引擎，零第三方运行时依赖，仅依赖 shared
apps/server       @bxverse/server   HTTP/API/SSE/静态托管，零依赖 node:http，依赖 core+shared
apps/web          @bxverse/web      Vue3+Vite+TS+Naive UI+UnoCSS+Pinia+Vue Router+vite-plugin-pwa，仅类型引用 shared
apps/cli          @bxverse/cli      bx-manager 命令薄壳（start/dev/data-dir/status），不承载业务逻辑

依赖：web/server/cli → core → shared（单向）；web 与 server 仅通过 HTTP/SSE 通信
构建顺序：shared → core → server → cli → web（web 产物 apps/web/dist 由 server 生产托管）
包管理：pnpm monorepo（pnpm@10.x，workspace packages/* 与 apps/*）
```

### 2.3 技术栈锁定

| 层 | 技术 | 约束 |
|---|---|---
| 前端 | Vue3 + Vite + TypeScript（strict）+ Naive UI + UnoCSS（presetIcons `@iconify-json/carbon`）+ Pinia + Vue Router（history 模式）+ vite-plugin-pwa | `<script setup>` Composition API；组件 PascalCase；页面 `views/`、组件 `components/`、状态 `stores/`；**图标一律 UnoCSS 字体图标（carbon），禁 emoji 与其它图标库** |
| 服务端 | `node:http` 手写路由 + 中间件链 | 零第三方运行时依赖；非 GET 请求 CSRF 双校验；`X-BX-Token` Header 鉴权 |
| 核心引擎 | Node 内置 + `child_process.spawn('git')` | 零第三方运行时依赖；公开 API 面固定（见 §5） |
| 共享契约 | TypeScript 类型 + 常量 | `shared/types.ts` 语义定稿，只允许新增可选字段并标注扩展原因 |
| 运行时 | Node ≥ 20，TS strict（noUnusedLocals/noUnusedParameters） | 全局 fetch 可用（Node 18+ 内置） |

### 2.4 设计原则（贯穿全部实现）

1. **数据权威，工具无痕**：业务仓库是权威；工具不改写其 git 历史；三类写入全部可关闭；发布数据落在工具自己的数据仓库（历史即审计）。
2. **自动为先，人审为终**：检测/版本建议/日志草稿/dry-run 全自动；「执行发布」永远由人发起并确认；草稿 `autoDraft` 留底，人工修订永不丢失对比基准。
3. **优雅可用**：Naive UI + 原子样式；亮/暗/双主题；键盘可达；命令面板；克制动效；空状态引导；操作可逆或可审计。

### 2.5 非功能需求

| 类别 | 要求 |
|---|---|
| 安全 | 默认绑定 127.0.0.1（非回环启动打印安全警告）；`X-BX-Token` Header + Origin/Content-Type 双重校验防 CSRF；凭据独立存储不进数据仓库；token 只走 Header 不走 Cookie；路径穿越与符号链接越界拦截；非回环绑定时错误信息不泄露本地绝对路径 |
| 可靠性 | 发布 journal 落盘断点续跑（每 step 原子写）；发布前预检硬阻断；单仓库失败隔离不污染已完成仓库；tag 创建幂等；版本/记录文件写幂等；单 FIFO 发布队列 |
| 性能 | 文件树懒加载 + `truncated` 截断；git 调用 TTL 缓存；提交解析上限 3000 条；diff 超时降级；发布队列单任务 |
| 自动化 | 轮询检测仓库变动（页面隐藏暂停、回前台刷新）；版本 bump 自动建议；双轨日志自动草稿 |
| 兼容 | 纯本地（无 origin/离线）与远程联动自动降级；Windows 盘符/中文/空格路径全链路可用 |
| 体验 | 六步向导 URL 状态同步（`?step=`）；页面 Tab URL 同步（`?tab=`）；未保存日志离开二次确认；进行中任务刷新可接管；空状态引导；亮/暗/双主题 |

---

## 3. 总体架构

### 3.1 进程模型与启动序列（server）

1. 解析 home：环境变量 `BX_HOME` 优先，否则 `os.homedir()/.bxverse`（`APP_DATA_DIR_NAME='.bxverse'`）。
2. 读取 `app.json`（`AppConfig`）；缺失写默认（`port=8899`=`APP_DEFAULT_PORT`、`host=127.0.0.1`、`dataDir={home}/data`、`pwa.enabled=true`、`pollInterval=30000`、`ai.enabled=false`、`projects=[]`）。
3. 确保目录：`data/`、`repos/`、`journal/`、`logs/`、`tmp/`。
4. 数据仓库 ensure：`git init` + `.gitignore`（`*.tmp-*`）+ 首次 commit；已配置远程则 `pull --ff-only`（失败仅警告）。
5. 扫描 `journal/`：`running` 残留 → 标 `interrupted` + 日志/SSE 广播警告。
6. 启动轮询定时器（周期 `pollInterval`，发布执行期间跳过锁定项目）。
7. `http.createServer` 监听；非回环 host 打印安全警告。
8. 优雅退出：SIGINT/SIGTERM → 停止接收 → 当前步骤落 journal → 关 SSE → 退出。

### 3.2 数据目录布局（`~/.bxverse/`，`BX_HOME` 可覆盖）

```
~/.bxverse/
├── app.json                 AppConfig 完整序列化（projects 内嵌；UTF-8 2 空格缩进；原子写 tmp+rename）
├── credentials.json         { token, remoteCredentials?, aiKeys? }（0600；不进数据仓库；aiKeys 为 AI 供应商 key，write-only 不回显）
├── data/                    数据仓库 = AppConfig.dataDir（git 仓库；.gitignore: *.tmp-*）
│   ├── index.json           全局发布索引（schemaVersion + releases[] 倒序）
│   └── releases/{scopeId}/{versionSafeName}/{data.json, internal.md, external.md}
│   └── backups/{releaseId}-{repoId}.json   备份元数据（随发布记录 commit 审计）
├── backups/{projectId}/{repoId}/{versionSafeName}/  备份大文件（不进 git；AppConfig.backup.dir 可覆盖）
│   ├── source.bundle         git bundle（全历史+标签，可 clone 恢复）
│   ├── source.tar.gz         git archive 快照（仅已跟踪文件）
│   ├── source.sha256         两文件 sha256
│   ├── artifact.tar.gz       产物归档（可缺省）
│   └── artifact-manifest.json 产物哈希清单
├── repos/{projectId}/{repoId}/    URL 克隆的工作树
├── journal/{taskId}.json     发布断点（每 step 原子写；保留最近 20 份，更早启动时清理）
├── logs/server-YYYY-MM-DD.log 运行日志（追加）
└── tmp/                      原子写中转（启动清理遗留 *.tmp-*）
```

**删除规则**：删除项目/仓库不删除 `data/releases/` 已有记录（审计不可变）；克隆仓库随移除可删 `repos/` 目录；备份可经 API 手动删除（元数据同步删）；不随项目删除自动清理备份。

### 3.3 安全模型

| 项 | 规则 |
|---|---|
| 会话 token | `crypto.randomBytes(32).toString('hex')` 生成，存 credentials.json（POSIX 0600 / Windows ACL 收紧）；浏览器存 `sessionStorage`，`X-BX-Token` Header 注入；`crypto.timingSafeEqual` 比对；除 `GET /api/config`、`GET /api/health`（免 token）与 `GET /api/events`（同源特例）外全部 `/api/*` 必带 |
| CSRF | 所有非 GET 请求：① Origin 存在时必须命中 `http://127.0.0.1:{port}` / `http://localhost:{port}` 白名单，否则 403；② Content-Type 必须 `application/json` |
| 凭据 | token / 远程凭据 / AI key 永不写入数据仓库与 app.json；数据仓库 .gitignore 兜底 |
| 路径穿越 | 文件树/文件内容接口对 path `path.resolve` + `startsWith` 词法校验，拒绝 `..` 逃逸 |
| 符号链接 | 词法校验后再 `fs.realpathSync` 二次校验，指向仓库外的 symlink/junction 一律拒绝（「路径越界（符号链接指向仓库外）」）；目标不存在回退原路径（写入场景） |
| 克隆校验 | `CloneRequest.url` 仅允许 `https://` / `ssh://` / `git@` 前缀；克隆目标固定 `repos/{projectId}/{repoId}/` |
| token 轮换 | `POST /api/auth/rotate` 原子替换，旧 token 立即失效，SSE 全连接关闭 |
| 错误脱敏 | 非回环绑定时错误信息不泄露本地绝对路径 |

### 3.4 可靠性设计

**发布 journal（断点续跑）**：`journal/{taskId}.json` 含 `{taskId, projectId, startedAt, status, request, plan(锁存), steps[]}`；每个 step 完成后原子写；重启扫描 `running`→`interrupted`；用户重新发起同项目发布 → 复用 taskId 与锁存 plan（忽略新 bump/repoIds 防版本漂移），幂等跳过已完成步骤；所有 step 设计为幂等（tag 同 commit 跳过、文件内容一致跳过、push 重复无害、data-commit 无变更不产生空提交）。

**预检（硬阻断）**：逐仓库检查——路径有效 git 仓库 / HEAD 非 detached / dirty==0（仅统计已跟踪文件，untracked 不阻断）/ lastPublishCommit 可达（不可达→警告+按首次发布全量收集）/ milestone tag 不冲突 / build tag 撞名自动规避 / 远程不可达（警告降级）。任一硬阻断 → 整任务中止并返回明确原因。

**失败隔离**：仓库逐个串行 + try/catch；失败 → `repo-error` → 跳过继续；已完成仓库保持已发布状态绝不回滚；≥1 成功 → 项目记录（`repos` 只含成功仓库，`done` 事件带 `failedRepos`）；0 成功 → `error` 事件不落任何记录；失败仓库 `lastPublishCommit` 未更新，下轮自动重新检测。

**单队列**：全局同时最多 1 个发布任务；忙 → 409 `TASK_BUSY`（带 `queueLength`）；发布执行期间项目定义变更 409。

### 3.5 SSE 事件协议

- 通道：`GET /api/events?task={taskId}`（fetch + ReadableStream 手动解析，EventSource 无法带自定义头）；`Accept: text/event-stream`。
- 帧：`data: {json}

`；每 15s 心跳 `: ping`；`retry: 3000`；断线重连后由服务端**重放已缓冲事件**（最多 5000 条）；任务已结束时重放后 2s 关闭连接。
- `PublishEvent.type`：`log`（过程输出）/ `step`（阶段推进）/ `repo-start` / `repo-done` / `repo-error` / `done`（`data: {releaseId, version, failedRepos}`）/ `error`。

### 3.6 静态托管与开发形态

- 生产：server 托管 `apps/web/dist`；`/api/*` 走 API；其余路径查静态文件，非文件路径 SPA fallback 到 `index.html`；`index.html`/`manifest.webmanifest` 不缓存，带 hash 产物 `Cache-Control: immutable`。
- 开发：`pnpm dev` 并行 server(8899) + Vite(5173)；`/api` 代理到 8899（`changeOrigin:false`，SSE 直通）。

## 4. 数据契约（@bxverse/shared —— 唯一跨包契约，字段级定稿）

> 重建时按本表实现 `packages/shared/src/types.ts` 与 `constants.ts`。语义已定稿：**只允许新增可选字段**（标注扩展原因），禁止删除/重命名/改语义。

### 4.1 基础类型

| 类型 | 定义 | 说明 |
|---|---|---|
| `BumpType` | `'major' \| 'minor' \| 'patch'` | 语义化版本步长 |
| `CommitType` | 12 值 | `feat/fix/perf/refactor/style/chore/docs/test/build/ci/revert/other` |
| `LogState` | `'auto' \| 'edited' \| 'confirmed'` | 双轨日志状态机 |
| `CommitInfo` | `{ hash, fullHash, author, date, subject, type, scope, breaking, files }` | `hash`=短 7 位；`fullHash`=40 hex；`date`=`YYYY-MM-DD`；`type` 解析自 Conventional Commits（无法识别为 `other`）；`scope` 缺失为 `null`；`breaking`=含 `BREAKING` 或 `!` 标记；`files`=影响文件相对路径列表 |
| `DiffStat` | `{ filesChanged, insertions, deletions }` | 短平快统计 |
| `Stats` | `{ commits, filesChanged, insertions, deletions, byType }` | `byType` 恒含 12 键（未出现为 0） |
| `ReleaseLog` | `{ state, content, autoDraft }` | `autoDraft`=自动草稿留底 |
| `FileEntry` | `{ name, type: 'dir'\|'file', size }` | 目录 size=0 |
| `TreeNode` | `{ path, entries, truncated }` | `path` 正斜杠相对路径 |
| `FileContent` | `{ path, size, binary, truncated, content, lines }` | 二进制/超限时 content 截断置标志 |
| `CloneRequest` | `{ url, name?, shallow? }` | url 仅 https/ssh/git@ |

### 4.2 `AppConfig`（app.json 顶层）

| 字段 | 类型 | 语义与规则 | 默认值 |
|---|---|---|---|
| `port` | `number` | HTTP 监听端口 | `8899` |
| `host` | `string` | 监听地址；非回环地址启动打印安全警告 | `127.0.0.1` |
| `theme` | `'light' \| 'dark' \| 'system'` | UI 主题 | `system` |
| `themeStyle` | `'indigo' \| 'wenxi'` | 主题套件（扩展 R20）：indigo=标准靛蓝套件（亮/暗/system）；wenxi=深色玻璃拟态（仅深色，强制 dark） | `indigo` |
| `pwa` | `{ enabled: boolean }` | PWA 运行时开关 | `{ enabled: true }` |
| `dataDir` | `string` | 数据仓库绝对路径 | `{home}/data` |
| `pollInterval` | `number` | 轮询检测周期（毫秒，前端以秒展示） | `30000` |
| `ai` | `{ enabled, baseUrl, model, apiKey, providers?, activeProviderId? }` | AI 多供应商（R21）：`enabled=false` 全链路短路；`providers[]` 为供应商列表；`activeProviderId` 当前生效；`baseUrl/model/apiKey` 为**兼容旧字段**（读取时若 providers 空且旧字段非空自动迁移为默认 provider id `legacy`，key 迁入 credentials.json.aiKeys 后置空；app.json 永不存明文 key） | `{ enabled:false, baseUrl:'https://api.openai.com/v1', model:'gpt-4o-mini', apiKey:'', providers:[], activeProviderId:'' }` |
| `backup` | `BackupConfig`（可选） | R19：`{ enabled: true, dir?, source: 'both'\|'bundle'\|'archive', onFailure: 'warn'\|'fail' }` | 缺省 `{ enabled:true, source:'both', onFailure:'warn' }` |
| `projects` | `ProjectDef[]` | 全部项目定义内嵌；CRUD 与 `lastPublishCommit` 更新都整体原子写回 app.json | `[]` |

`AiProvider`：`{ id, name, kind: 'openai-compatible', baseUrl, model, enabled }`（kind 预留扩展位；id 创建后不变）。

### 4.3 `ProjectDef`

| 字段 | 类型 | 默认 |
|---|---|---|
| `id` | `string`（`p_`+6 位小写字母数字，创建后不变） | — |
| `name` | `string`（允许重名） | — |
| `description` | `string?` | 缺省不输出 |
| `version` | `string`（恒带 `v` 前缀，`v1.2.0`） | `v0.1.0` |
| `bump` | `'auto' \| 'manual'` | `auto`（auto=按提交语义推断；manual=建议恒 patch，用户自选） |
| `repoVersionScheme` | `'hybrid' \| 'timestamp'` | `hybrid` |
| `externalExclude` | `CommitType[]` | `DEFAULT_EXTERNAL_EXCLUDE` |
| `repos` | `RepoDef[]`（顺序即 UI 顺序） | `[]` |
| `createdAt`/`updatedAt` | `string?` | 创建/更新时写入 |

### 4.4 `RepoDef`

| 字段 | 类型 | 说明 | 默认 |
|---|---|---|---|
| `id` | `string`（`r_`+6 位） | 也是克隆目录名 | — |
| `name` | `string` | 仓库名（默认取目录名/URL 仓库名） | — |
| `displayName` | `string?` | 中文名；版本清单 `name`、快照 `displayName` 取自本字段，缺省回退 `name` | — |
| `path` | `string` | 本地绝对路径（接入校验存在且含 .git） | — |
| `remote` | `string?` | origin 远程地址（接入时读取；克隆时为 url） | — |
| `buildCommand` | `string?` | 发版前构建命令（shell 语义；空=跳过） | — |
| `outputDir` | `string?` | version.json 输出目录（相对仓库根） | `public` |
| `writeVersionFile` | `boolean?` | 是否在业务仓库写版本文件；false=零侵入（只打 tag） | `true` |
| `artifactDir` | `string?` | R19 产物备份目录（相对仓库根；未配置则跳过产物备份） | — |
| `lastPublishCommit` | `string \| null` | 上次发布 HEAD fullHash（变更检测基准；null=从未发布） | `null` |
| `createdAt` | `string?` | 接入时间 | — |

### 4.5 `ReleaseRecord`（发布记录，落盘后不可变）

| 字段 | 类型 | 规则 |
|---|---|---|
| `id` | `string` | `rel_{scopeId}_{versionSafeName}`（versionSafeName = version 中 `[<>:"/\\|?*\s]` → `_`） |
| `kind` | `'project' \| 'repo'` | 同一发布内项目级与仓库级各一条 |
| `scopeId` | `string` | project=项目 id；repo=仓库 id；也是 releases/{scopeId}/ 目录名 |
| `scopeName` | `string` | 落盘时刻名称快照 |
| `version` | `string` | project=vX.Y.Z；repo=hybrid vX.Y.Z.YYMMDDHH / timestamp vYYMMDDHH |
| `baseVersion` | `string` | 项目基版（同一次发布内全部一致） |
| `buildStamp` | `string` | YYMMDDHH（撞名规避后 8~10 位）；同次发布共享 |
| `bump` | `BumpType` | 本次实际步长 |
| `date` | `string` | ISO 8601 含时区 |
| `from`/`to` | `string\|null`? | repo 记录变更范围（首次发布 from=null）；project 记录 from=null |
| `commits` | `CommitInfo[]` | repo=该仓范围；project=全量聚合 |
| `stats` | `Stats` | 聚合统计 |
| `logs` | `{ internal: ReleaseLog, external: ReleaseLog }` | 双轨日志 |
| `repos` | `RepoReleaseRef[]`? | 仅 project 记录：**只含成功仓库**快照（成功=发布版本 / 同步基版=项目版本 / 失败=仓库当前版本） |
| `tags` | `{ build?, milestone? }` | repo 记录含 build+milestone；project 记录仅 milestone |
| `pushed` | `boolean` | 数据仓库远端推送是否成功（落盘定值不回溯） |
| `builtBy` | `string` | `git config user.name <user.email>`；缺失退化 `bxverse <local>` |
| `backups` | `RepoBackupRef[]`? | R19 本次备份引用 |

### 4.6 计划/任务类型

- `PlannedRepo`：`{ repoId, name, changed, version, from?, to?, commits, buildCommand? }`（changed=true 进 `PublishPlan.changed`，false 进 `syncedOnly`）。
- `PublishPlan`：`{ projectId, projectName, projectVersion, buildStamp, bump, suggestedBump, changed[], syncedOnly[], milestoneTag, tags: {repoId,name,tag}[], externalDraft, internalDraft, warnings[] }`。
- `PublishRequest`：`{ projectId, bump: BumpType\|'auto', repoIds?, skipBuild?, offline?, dryRun?, externalContent?, internalContent?, backupSource?, backupArtifacts?, excludeCommits?: Record<repoId, fullHash[]> }`（`repoIds` 缺省=自动选有变动仓库；`dryRun:true` 同步返回 PublishPlan）。
- `PublishEvent`：`{ type: 'log'\|'step'\|'repo-start'\|'repo-done'\|'repo-error'\|'done'\|'error', message, repoId?, data? }`。

### 4.7 状态与文件类型

- `RepoStatus`：`{ id, name, path, branch, head, dirty, hasRemote, remoteUrl, versionFile: {version,build,buildTime}\|null, buildTags[], milestoneTag\|null, changed, lastPublishCommit\|null, commits[] }`；`changed = commits.length>0 \|\| dirty>0`。
- `OverviewData`：`{ projectCount, repoCount, changedRepoCount, projects: {id,name,version,repoCount,changedRepoCount,lastRelease?}[], changedRepos: {projectId,projectName,repoId,repoName,head,commits}[] }`。
- `RepoVersionItem`（R18）：`{ app: 英文名, name: displayName\|\|app, version }`。
- `RepoReleaseRef`：`{ repoId, repoName, displayName?, version, commits }`。

### 4.8 R19 备份/对比类型

- `BackupItem`：`{ kind: 'source-bundle'\|'source-archive'\|'artifact', file, sha256, size, files? }`。
- `RepoBackupRef`：`{ releaseId, repoId, repoName, projectId, version, commit, tag?, date, items[] }`。
- `FileCompareStatus`：`'added'\|'removed'\|'modified'\|'same'`。
- `FileSideInfo`：`{ sha256?, size? }`。
- `FileCompareItem`：`{ path, status, insertions?, deletions?, left?, right? }`（insertions/deletions 仅源码级填充）。
- `CompareResult`：`{ kind: 'source'\|'artifact'\|'verify', left?, right?, files[], totals: {added,removed,modified,same} }`。

### 4.9 R21 AI 类型

- `AiProviderCategory`：`'domestic'\|'global'\|'aggregator'\|'local'\|'custom'`。
- `AiModelRecommendation`：`{ id, label, description?, isDefault? }`。
- `AiProviderPreset`：`{ key, name, category, baseUrl, docUrl?, placeholderModel, recommendedModels[], hint?, color? }`。
- `AiTestResult`：`{ ok, latencyMs, model, reply, detail?, providerName? }`。

### 4.10 常量定稿（constants.ts）

- `SEMVER_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:\.(\d{6,10}))?$/`
- `HYBRID_VERSION_RE = /^v\d+\.\d+\.\d+\.\d{8,10}$/`
- `BUILD_TAG_PREFIX = 'build'`
- `COMMIT_TYPES`（12 值见上）、`COMMIT_TYPE_LABELS`：feat=新增/fix=修复/perf=优化/refactor=重构/style=样式/chore=杂项/docs=文档/test=测试/build=构建/ci=持续集成/revert=回滚/other=其他
- `DEFAULT_EXTERNAL_EXCLUDE = ['chore','docs','test','style','ci','build','revert']`
- `EXTERNAL_SECTIONS`：`[{title:'新增',types:['feat']},{title:'优化',types:['perf','refactor']},{title:'修复',types:['fix']},{title:'其他',types:[style,chore,docs,test,build,ci,revert,other]}]`
- `DEFAULT_IGNORE_DIRS`：`.git,node_modules,dist,out,coverage,.idea,.vscode,.cache,.nuxt,.next,.output,target,__pycache__,.DS_Store`
- `APP_NAME='BX 版本管理台'`、`APP_DEFAULT_PORT=8899`、`APP_DATA_DIR_NAME='.bxverse'`
- `AI_PRESET_PROVIDERS`：19 个主流预设（见 §12.1 表）

### 4.11 ID 与命名约定

- `projectId = 'p_' + 6位[a-z0-9]`；`repoId = 'r_' + 6位[a-z0-9]`；`taskId = 't_' + YYYYMMDD + '_' + HHmmss + '_' + rand4`；`releaseId = 'rel_' + scopeId + '_' + versionSafeName`。
- 版本：项目 `vX.Y.Z`（规范形态恒带 v）；仓库 hybrid `vX.Y.Z.YYMMDDHH` / timestamp `vYYMMDDHH`。
- 标签：里程碑 `vX.Y.Z`；构建 `build/vX.Y.Z.YYMMDDHH`（撞名追加序号至 8~10 位）。

### 4.12 版本/标签格式校验规则

- `SEMVER_RE` 匹配项目版本（`v1.0.6` / `1.0.6` / `v1.0.6.26081315`）；`HYBRID_VERSION_RE` 匹配仓库混合版本。
- bump：breaking→major / 任意 feat→minor / 否则 patch（含空数组）；`ProjectDef.bump='manual'` 时建议恒 patch。
- buildStamp：本地时间 `YYMMDDHH`（两位数补零）；与既有 build tag 撞名时 `base + 1..99` 追加序号（8→10 位，仍满足正则）；同小时超过 100 次抛 `BUILD_STAMP_EXHAUSTED`。

## 5. 核心引擎规格（@bxverse/core）

> 全部领域逻辑唯一实现方（server 只做 HTTP 编排）。零第三方运行时依赖。公开导出面（与 index.ts 一字不差）：

```ts
export * as git from './git'
export * as version from './version'
export * as changelog from './changelog'
export * as store from './store'
export * as engine from './engine'
export * as files from './files'
export * as backup from './backup'
export * as compare from './compare'
export { diffLines } from './diff'
export type { DiffLine } from './diff'
export type { Journal, JournalStep } from './journal'
export { JournalStore } from './journal'
```

### 5.1 git.ts —— git 子进程封装与解析

**基础封装** `git(args, opts?)`：`spawn('git', args, { cwd, windowsHide: true, env: { ...process.env, LC_ALL: 'C.UTF-8' } })`；stdout/stderr 缓冲上限 50MB；默认超时 30s（clone 120s），超时 SIGKILL 并返回 `code:'TIMEOUT'`；**所有调用带 `-c core.quotepath=false`**（中文路径 UTF-8 原样）；`GitResult = { ok:true, stdout, stderr } | { ok:false, code, stderr }`。**禁止**写历史命令（commit/amend/reset/rebase/force-push 永不出现）。

| 函数 | 签名 | 行为/边界 |
|---|---|---|
| `isRepo` | `(dir) => Promise<boolean>` | `git rev-parse --git-dir`；目录不存在/无权限 → false 不抛 |
| `head` | `(dir) => Promise<string>` | `rev-parse HEAD`；**空仓库抛 GitError('EMPTY_REPO')**（调用方转空态） |
| `currentBranch` | `(dir) => Promise<string>` | `symbolic-ref --short HEAD`；detached → `'(detached)'` |
| `dirtyCount` | `(dir) => Promise<number>` | `status --porcelain --untracked-files=no` 按行计数（untracked 不阻塞发布） |
| `hasRemote` / `remoteUrl` | `(dir) => Promise<boolean/string>` | `remote get-url origin`；无远程 false/'' |
| `latestTag` | `(dir) => Promise<string/null>` | `for-each-ref refs/tags --sort=-creatordate --format=%(refname:short) --count=1` |
| `listTags` | `(dir, pattern?) => Promise<string[]>` | `tag -l pattern` |
| `tagExists` | `(dir, tag) => Promise<boolean>` | `rev-parse -q --verify refs/tags/{tag}` |
| `createTag` | `(dir, tag, { target?, message? })` | 幂等：同名同 commit 跳过；同名不同 commit 抛 `TAG_CONFLICT`（交预检/规避层） |
| `pushTag` | `(dir, tag)` | `push origin tag {tag}`；无 origin 抛 `NO_REMOTE`（调用方降级警告） |
| `commitsSince` | `(dir, base, { maxCommits=3000, includeFiles=true }) => Promise<CommitInfo[]>` | 见下 |
| `diffStat` | `(dir, base) => Promise<DiffStat>` | `--shortstat {base}..HEAD`；base=null 用空树 hash `4b825dc642cb6eb9a060e54bf8d69288fbee4904`；正则解析缺段按 0；空输出全 0；超时返回全 0 并附警告 |
| `clone` | `(url, targetDir, { shallow? })` | 校验 url 前缀 https:// / ssh:// / git@；target 不存在或空目录；shallow=`--depth 1`；超时 120s |

**commitsSince 命令与解析（核心）**：

```
git -c core.quotepath=false log --no-merges --reverse --name-only --date=short \
    --pretty=format:%H%x1e%h%x1e%an%x1e%ad%x1e%s%x1f {base}..HEAD
```

- base=null 时用 `--root`（首次发布全量，含根提交对空树）。
- 记录分隔 `%x1e`(RS) / 单元分隔 `%x1f`(US)；逐行解析：含 `%x1f` 的行为提交头（fullHash/hash/author/date/subject），随后行归入当前提交 files（可含空格），空行重置。
- 边界：base 不可达（force-push/GC）→ git 退出 128 → 捕获后按 `--root` 重跑并写 warning「检测基准不可达，已按首次发布全量收集」；空仓库 → `[]`；超 3000 条截断（warning）；文件名含换行按空行切分会错位（已知限制，函数注释标注）。

### 5.2 version.ts —— 版本计算

| 函数 | 行为 |
|---|---|
| `buildStamp(now?, usedStamps?)` | `YYMMDDHH`；usedStamps 含 base 时追加序号 1..99（8→10 位）；全占抛 `BUILD_STAMP_EXHAUSTED` |
| `parseSemver(v)` | SEMVER_RE 匹配 → `{major, minor, patch, build?}`；否则 null |
| `bumpSemver(v, bump)` | 不匹配抛 `INVALID_SEMVER`；major→(m+1,0,0)、minor→(m,n+1,0)、patch→(m,n,p+1)；返回 `v{major}.{minor}.{patch}` |
| `suggestBump(commits)` | 任意 breaking→major；任意 feat→minor；否则 patch |
| `hybridVersion(projectVersion, stamp)` | `v{major}.{minor}.{patch}.{stamp}` |

### 5.3 changelog.ts —— 提交分类、统计与双轨日志渲染

- `classifyCommit(subject)`：正则 `/^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.*)$/`；不匹配 → `{type:'other', scope:null, breaking: 含 BREAKING}`；breaking = `!` 或 subject 含 BREAKING。
- `classifyCommits(commits)`：就地补全 type/scope/breaking（幂等）。
- `computeStats(commits, diff?)`：`byType` 12 键全量初始化 0 再累加；filesChanged=diff?.filesChanged ?? 去重文件并集；insertions/deletions 无 diff 给 0。
- `renderInternal(commits, opts)`：**对内全量模板**（信息不裁剪）：

```
# v{version} 发布记录（内部）

> 项目：{projectName}｜仓库：{repoName}
> 基版：v{baseVersion}（{from === null ? '首次发布，全量收集' : from}）
> 构建：{buildStamp}｜日期：{date}
> 标签：{tags.join('、') 或 '无'}

## 概览

- 提交：{stats.commits} 个｜影响文件：{stats.filesChanged}｜+{insertions} / -{deletions}
- 类型分布：{按 COMMIT_TYPES 顺序仅列 >0，如「新增(feat)×5、修复(fix)×4」；全 0 时「无」}

## 变更明细

### {COMMIT_TYPE_LABELS[type]}（{type}）

#### {type}{breaking ? '!' : ''}{scope ? `（${scope}）` : ''}：{subject} `{hash}`

- 作者：{author}｜日期：{date}
- 影响文件（{n}）：
  - {file}（字母序；n=0 显示「（无文件级信息）」）

（重复提交块，时间正序；分组按 COMMIT_TYPES 顺序仅留 >0 组；commits 空时「本次无提交明细。」）

> 由 BX 版本管理台自动生成，可人工编辑确认。
```

- `renderExternal(commits, opts)`：**对外分节模板**（不含 hash/作者/文件）：

```
# {projectName} v{version} 更新日志

> 发布日期：{date}｜构建：{buildStamp}

## {EXTERNAL_SECTIONS[i].title}

- {subject}{scope ? `（${scope}）` : ''}
- **[BREAKING]**：{subject}

（节空整节省略；全部为空输出「本次发布无用户可见变更。」）
```

- external 算法：`usable = commits.filter(c => !exclude.includes(c.type) || c.breaking)`（**breaking 强制收录**）；按 EXTERNAL_SECTIONS 分节、组内时间正序、加 `**[BREAKING]**：` 前缀。
- autoDraft 语义：`PublishPlan.externalDraft/internalDraft` = render 在 plan 时刻的输出（不含 AI）；落盘 `ReleaseLog.autoDraft` 同一输出；`content` 初始 = `externalContent ?? autoDraft`；`state` 推断 `content===autoDraft ? 'auto' : 'edited'`。

### 5.4 store.ts —— 数据目录、配置、发布记录与数据仓库

- `APP_DIR`：`BX_HOME ?? join(os.homedir(), APP_DATA_DIR_NAME)`；`resolveHome()` 确保 `data/repos/journal/logs/tmp` 目录。
- `loadAppConfig()/saveAppConfig(cfg)`：app.json 深合并默认值（新增字段兜底）；**原子写**（`tmp-{pid}` 写入 + rename）。
- `loadCredentials()/saveCredentials()`：`{token, dataRemote?, ...}`；credentials.json 写权限 POSIX 0600 / Windows ACL 尽力收紧（失败仅警告）。
- **DataStore 类**（`new DataStore(home?)`，`readonly dataDir`）：
  - `ensureDataRepo()`：git init + `.gitignore`（`*.tmp-*`）+ 首次 commit；配置了 dataRemote 且无 origin → `remote add`；已配 → `pull --ff-only`（失败仅警告）。
  - 项目 CRUD：`listProjects/getProject/saveProject/deleteProject`（全原子写）。
  - `nextReleaseId(kind, scopeId, version)`：`rel_` + (p|r) + `_` + scopeId + `_` + versionSafe。
  - `writeRecord(record)`：写 `internal.md`/`external.md` → 最后写 `data.json`（作为落盘完成判据，原子写）；重建两级 index.json；**幂等**：已存在且内容一致跳过、不一致抛错（记录不可变）。
  - `readRecord(id)`：按 id 扫描匹配 data.json 的 id 读取。
  - `updateRecord(record)`：日志人工编辑唯一通道；校验不可变字段 id/version/scopeId；原子重写 md + data.json。
  - `listRecords(scopeId, n=20, 上限 100)`。
  - `commitRecords(message)`：`git add -A + commit`；无变更返回 `''`（不产生空提交）；约定 message `release({kind}:{scopeId}): {version}` 或 `chore: manual log edit`。
  - `syncDataRepo(action)` → `SyncResult`（`{action, ok, message?, warning?}`），action ∈ pull/push/commit/status。
  - 备份元数据：`writeBackupMeta/readBackupMeta/listBackupMeta/deleteBackupMeta`（`data/backups/{releaseId}-{repoId}.json`）。

**数据仓库目录**：`data/index.json`（`{schemaVersion:1, releases:[{id,kind,scopeId,version,date}]}` 倒序）+ `data/releases/{scopeId}/index.json`（同构）+ 每发布 `{versionSafeName}/{data.json, internal.md, external.md}`。

### 5.5 engine.ts —— 变动检测、发布计划与发布编排

```ts
export async function collectChanges(repo: RepoDef): Promise<RepoStatus>
export function detectChanged(repos: RepoDef[], statuses: Record<string, RepoStatus>): { changed: RepoDef[]; unchanged: RepoDef[] }
export async function planPublish(req: PublishRequest): Promise<PublishPlan>
export async function executePublish(req: PublishRequest, opts: { onEvent: (e: PublishEvent) => void; taskId?: string }): Promise<ExecuteResult>
// ExecuteResult = { releaseId: string | null; failedRepos: string[] }
export async function writeVersionFiles(repo, plan, project, buildStamp, prevRecordVersion?): Promise<void>
export async function syncUnchangedVersionFile(repo, project): Promise<void>
```

**collectChanges（单仓状态）**：`branch/head`（EMPTY_REPO→''）、`dirty`、`hasRemote/remoteUrl`、`versionFile`（读 `{path}/{outputDir??'public'}/version.json` → `{version,build,buildTime}`；缺/坏→null）、`buildTags`（`build/*`）、`milestoneTag`（`v*` 中 SEMVER 且无 build 段，semver 倒序取最新）、`lastPublishCommit`、`commits`（EMPTY_REPO→[]；否则 `commitsSince(path, lastPublishCommit)`）、`changed = commits.length>0`。首次发布（lastPublishCommit=null）走 `--root` 全量；git 失败兜底返回最小状态不抛穿 server。

**detectChanged**：按 `changed===true` 过滤（server 轮询定时器调用；缓存 TTL=pollInterval，`fresh=true` 强制实时；发布执行期间暂停该项目轮询）。

**planPublish（dry-run）伪码**：

```
project = getProject(req.projectId)；不存在 → NotFound
候选仓 = req.repoIds ?? project.repos 全部；repoIds 含非本项目 → Validation
1. 逐仓 collectChanges(fresh=true)
2. 全量提交 = Σ changed 仓 commits（classifyCommits 后）
3. suggestedBump = suggestBump(全量提交)；bump = req.bump==='auto' ? suggestedBump : req.bump
   projectVersion = bumpSemver(project.version, bump)
4. usedStamps = Σ changed 仓 buildTags 解析 stamp；stamp = buildStamp(now, usedStamps)
5. 每 changed 仓：version = hybrid ? hybridVersion(projectVersion, stamp) : 'v'+stamp；
   from=lastPublishCommit；to=head；diff=diffStat（失败→全0+warning）；stats=computeStats；
   plannedRepo = {repoId, name, changed:true, version, from, to, commits, buildCommand}
6. syncedOnly = 候选仓未变动者：{changed:false, version: projectVersion, commits:[]}
7. milestoneTag = 'v' + projectVersion（去 v）；tags = changed 仓 → build/v{projectVersion}.{stamp}
9. drafts：externalDraft = renderExternal(全量提交, {version, date, repoName:'全部仓库'})；
   internalDraft = renderInternal(全量提交, {...})
10. warnings：基准不可达 / 提交截断 / diffStat 超时 / 数据仓库无远程 / dirty>0 仓库 / 排除提交数 / buildStamp 撞名已规避
```

**提交级排除（`req.excludeCommits: Record<repoId, fullHash[]>`）**：按 fullHash 精确过滤 commits；有剔除记 warning「{name} 排除 N 个提交，参与本次发布 M 个」；过滤后某仓 `commits.length===0 && dirty===0` → 降级 `syncedOnly`（仅同步基版，不打标签不写记录）并**重算变动集合**；`diffStat` 仍按 `lastPublishCommit..HEAD` 全量（与排除无关）；`lastPublishCommit` 发布成功后仍前移 head。

**executePublish（发布编排状态机）**：

```
queued → preflight → [per-repo × N（串行，try/catch 隔离）] → sync-unchanged → project-record → data-commit → done
                                ↘ repo-error（跳过该仓继续）      ↘ 0 仓成功 → error（不落任何记录）
```

```
1. journal：新建 {status:'running', request}；resume = journal.plan !== null
2. 计划：resume ? 复用锁存 plan : planPublish(req) 并锁存（防版本漂移）
3. 预检：续跑时跳过 steps 已 done 的仓库
4. 逐 changed 仓：
   repo-start → step(build)：buildCommand 且 !skipBuild → spawn 执行，输出逐行 onEvent('log')，失败 → repo-error（未打标签无污染）
   → step(tag-milestone)：createTag('v{projectVersion}')（幂等）
   → step(tag-build)：createTag('build/v{projectVersion}.{stamp}')
   → step(backup)：backup.enabled 且 backupSource/backupArtifacts → 源码/产物备份（journal phase 'backup'）
   → step(version-file)：writeVersionFiles（幂等：内容一致跳过）
   → step(record)：写仓库 ReleaseRecord（kind:'repo', tags:{build,milestone}）+ 更新 lastPublishCommit=head（saveProject 原子写）
   → step(push)：!offline 且 hasRemote → pushTag×2（失败警告降级，pushed:false）
   → repo-done（失败 → repo-error + failedRepos.push + 继续下一仓）
5. syncedOnly：writeVersionFile!==false → syncUnchangedVersionFile（仅 version.json 基版，无标签无记录）
6. 成功仓 0 → error('全部仓库失败，未生成发布记录')，journal failed，return
   否则写项目 ReleaseRecord（kind:'project', repos: 成功仓 RepoReleaseRef[], tags:{milestone}, pushed 汇总）+ project.version 前移
7. 数据仓库：createTag(dataDir, 'v{projectVersion}') + commitRecords + !offline → syncDataRepo('push')（失败 warning）
8. onEvent done({releaseId, version, failedRepos})；journal.status='done'（保留文件）
```

**journal 续跑语义**：每 step 原子写；重启扫描 `running`→`interrupted` + 广播警告；用户再次发布同 projectId → 复用 taskId 与锁存 plan（忽略新 bump/repoIds），幂等跳过 done 步骤；done/failed journal 保留最近 20 份；任务执行期间项目锁（定义变更 409）。

**writeVersionFiles**：`writeVersionFile===false` 直接返回；`version.json = {version: plan.version, build: buildStamp, buildTime: ISO now}`；已存在且 version/build 一致 → 跳过；已存在且 version 等于上次发布记录版本 → 覆盖；其余（被外部改动、与计划不一致）→ throw 阻断避免误覆盖；`version-history.json` 追加一条（不存在创建数组，原子写）。

**syncUnchangedVersionFile**：`version.json` 已存在 → 仅更新 `version = project.version`（build/buildTime 保持上次值）；不存在 → 写 `{version, build:'', buildTime:''}`；`version-history.json` 追加 `{version, build: 上次值??'', buildTime: 上次值??'', sync:true}`。

### 5.6 preflight.ts —— 预检阻塞项（硬阻断）

| 检查项 | 不满足时 | 处理 |
|---|---|---|
| 有效 git 仓库且路径存在 | 否 | 阻断 |
| HEAD 非 detached | detached | 阻断 |
| `dirtyCount===0` | dirty>0 | 阻断（提示先提交或 stash） |
| `lastPublishCommit` 可达 | 不可达 | **警告** + 按首次发布全量收集 |
| buildCommand 执行成功 | 失败 | 该仓 repo-error，其余继续（隔离） |
| milestone tag 不存在 | 存在且指向不同 commit | **阻断**（要求 bump 版本） |
| build tag 同名 | 存在且指向不同 commit | **自动规避**（buildStamp 序号） |
| 远程可达（!offline 且有 remote） | 不可达 | **警告**（降级纯本地） |

### 5.7 files.ts —— 文件树与文件读取

- 常量：`MAX_TREE_ENTRIES=1000`、`MAX_FILE_READ=512KB`、`MAX_FILE_LINES=5000`；忽略：`DEFAULT_IGNORE_DIRS` + `.git` + 仓库根 `.gitignore` 简化解析（支持 `*`/`**`/尾 `/` 目录模式；不支持 `!` 取反）。
- `safeAbs(repoPath, relPath)` 两层校验：① `path.resolve` + `startsWith` 词法（拒绝 `..` 逃逸）；② `fs.realpathSync` 解析符号链接/junction，指向仓库外一律拒绝（「路径越界（符号链接指向仓库外）」）；目标不存在回退原路径（写入场景）。
- `listTree(repoPath, dirPath)`：逐层懒加载；目录在前、同类 `name.localeCompare` 排序；超 1000 条目 `truncated=true` 停止收集；返回 `{path（正斜杠去前导 /）, entries, truncated}`。
- `readFileContent(repoPath, filePath)`：`size>512KB` → `{binary:false, truncated:true, content:'', lines:0}`（不读取）；含 NUL → `binary:true`；行数>5000 截断前 5000 行 `truncated:true`。

### 5.8 backup/ —— 发布备份（R19，零依赖）

| 文件 | 导出 | 职责 |
|---|---|---|
| `index.ts` | `backupRepo(opts)` / `BackupError` / 常量 `SOURCE_BUNDLE='source.bundle'`、`SOURCE_ARCHIVE='source.tar.gz'`、`SOURCE_SHA256='source.sha256'` | 一次发布一仓编排（bundle→快照→sha256→产物归档）；任一环节失败抛 `BackupError` 并清理本次创建的文件（不删既有）；全部跳过返回 null；幂等 |
| `source.ts` | `createBundle` / `createArchiveGz` | `git bundle create {out} --all`（300s 超时）；`git archive --format=tar {ref}` 管道 zlib gzip level 6 流式写盘 |
| `artifact.ts` | `backupArtifact` / `ARTIFACT_TAR='artifact.tar.gz'` / `ARTIFACT_MANIFEST='artifact-manifest.json'` | `RepoDef.artifactDir` 整体归档（即使被业务 .gitignore 也不丢）；目录不存在/为空 → null（跳过）；tar+manifest 已存在且 files 一致 → 幂等返回 |
| `manifest.ts` | `hashFile` / `walkFiles` / `buildManifest` / `readManifest` / `BACKUP_SKIP_DIRS={.git,.svn,.hg,node_modules}` | 流式 sha256 不整读内存；跳过符号链接防环；`Manifest = {schemaVersion:1, createdAt, root, files:[{path,sha256,size}], totals:{files,bytes}}` |
| `tar.ts` | `createTarGz` | 零依赖 ustar tar.gz：512B 头、>100 字节路径（含中文）走 GNU 'L' longname 扩展头、自动补目录条目、512 对齐、1024B 结尾块，全程流式 |

**存储**：大文件 `{backupRoot}/{projectId}/{repoId}/{versionSafe}/`（`backupRoot = BackupConfig.dir ?? ~/.bxverse/backups`），不进数据仓库；元数据 `RepoBackupRef` 写 `data/backups/{releaseId}-{repoId}.json` 随发布记录 commit；`ReleaseRecord.backups` 挂引用；快照 ref 优先 build tag，其次 HEAD。

**引擎挂接**：`wantSource = backup.enabled && req.backupSource !== false`；`wantArtifact = backup.enabled && req.backupArtifacts !== false`；两者皆否跳过。失败策略 `backup.onFailure`：`'fail'` → 该仓库失败；`'warn'`（缺省）→ 记 log 降级发布继续。

### 5.9 compare/ —— 三层一致性对比

- `compareSource(repoPath, from|null, to)`：源码级 `git diff --numstat` + `--name-status --no-renames` 按 path 合并（二进制 insertions/deletions 记 0）；from=null = 首次全量；kind='source'。
- `compareManifests(left, right)`：产物级两份哈希清单按相对路径合并——仅左→removed、仅右→added、sha256 或 size 不同→modified、一致→same；kind='artifact'。
- `verifyManifest(dir, manifest)`：校验级重算哈希比对——清单有实际无→removed、实际有清单无→added、哈希不一致→modified、一致→same；kind='verify'。

### 5.10 ai.ts —— 可选 AI 能力（多供应商，OpenAI 兼容）

- 私有 `chatCompletion(provider, key, system, user, opts)`：`POST {baseUrl}/chat/completions`（Node 内置 fetch，30s 超时 AbortController；`Authorization: Bearer {key}`）；非 2xx 抛错（含上游状态与截断响应体）；解析 `choices[0].message.content`；去 ``` 代码块包裹。
- `polishLog(provider, key, text)`：未启用/缺配置短路返回原文；超长（>200KB）抛错；system prompt =「版本发布日志编辑助理，改写成面向终端用户的分节发布说明，保留 Markdown 结构，去掉 commit 哈希/文件路径明细，不新增不存在的变更，仅输出日志正文」。**失败抛错由调用方呈现，绝不静默回退原文**。
- `testConnection(provider, key)`：最小 chat 请求验证 key/模型，返回 `AiTestResult{ok, latencyMs, model, reply, detail?}`。
- 阶段二预留：`commitMessage(repoId, files)`（conventional 草稿）、`explainDiff(...)`（中文变更解读）。

### 5.11 journal.ts —— JournalStore

```ts
interface Journal { taskId; projectId; startedAt; status: 'running'|'done'|'failed'|'interrupted'; request: PublishRequest; plan: PublishPlan; steps: JournalStep[] }
interface JournalStep { seq; repoId: string|null; phase: 'preflight'|'build'|'tag-milestone'|'tag-build'|'backup'|'version-file'|'record'|'push'|'project-record'|'data-commit'; state: 'pending'|'running'|'done'|'failed'; detail: string }
```

`JournalStore`：`create/load/saveStep(原子写)/scanInterrupted/markInterrupted`；`saveStep` 每 step 完成后 tmp+rename。

## 6. 服务端规格（@bxverse/server）

### 6.1 中间件链与统一约定

- 所有响应 JSON；错误统一 `{ error: '人类可读信息', code: 'MACHINE_CODE' }`，状态码 400/401/403/404/409/500/502 语义化。
- 链：`router → auth（X-BX-Token + Origin/Content-Type 校验）→ handler → core 服务 → JSON`。
- 免 token：`GET /api/config`（引导拿 token）、`GET /api/health`（CLI 状态）、`GET /api/events`（同源特例）。
- CSRF：所有非 GET：① Origin 存在时必须命中 `http://127.0.0.1:{port}` / `http://localhost:{port}` 白名单（否则 403）；② `Content-Type: application/json`（无 body 的 DELETE 也须带）。
- 请求体读取：JSON，32MB 上限；超限不得 `req.destroy()`（须 resume 排空后 400）。大响应（PublishPlan 可达数 MB）走 gzip。

### 6.2 路由全表

| 方法 | 路径 | 用途 | 响应/说明 |
|---|---|---|---|
| GET | `/api/health` | 健康检查（免 token） | `{ok, version}` |
| GET | `/api/config` | 引导 + 配置读取（免 token） | `{token, config: AppConfig 概要（projects 为 id/name/version/repoCount）}`；`ai.apiKey` 恒为空串，供应商 key 以 `hasKey:boolean` 呈现 |
| POST | `/api/config` | 部分更新（仅 theme/themeStyle/pwa/pollInterval/ai） | `{config}`；port/host/dataDir/projects 出现 → 400 |
| POST | `/api/auth/rotate` | 轮换 token（需旧 token） | `{token}`；旧 token 立即失效，SSE 全关闭 |
| GET | `/api/overview` | 首页聚合（轮询缓存，TTL=pollInterval） | `OverviewData` |
| GET | `/api/projects` | 项目列表 | `ProjectDef[]` |
| POST | `/api/projects` | 新建项目 | 201 `ProjectDef`（id 服务端生成） |
| PATCH | `/api/projects/:id` | 更新项目 | `ProjectDef`；发布中 409 |
| DELETE | `/api/projects/:id?purge=` | 删除项目（purge=true 时连克隆目录） | `{ok, purged}`；记录不删 |
| POST | `/api/projects/:id/repos` | 接入仓库：`{path}` 本地（校验 .git）或 `CloneRequest` 克隆 | 201 `RepoDef` |
| PATCH | `/api/projects/:pid/repos/:rid` | 更新仓库（name/displayName/buildCommand/outputDir/writeVersionFile/artifactDir） | `RepoDef` |
| DELETE | `/api/projects/:pid/repos/:rid?purge=` | 移除仓库 | `{ok, purged}` |
| GET | `/api/repos/:pid/:rid/status?fresh=` | 仓库状态 + 相对上次发布提交 | `RepoStatus`；fresh=true 强制实时 |
| GET | `/api/repos/:pid/:rid/tree?path=` | 目录懒加载 | `TreeNode` |
| GET | `/api/repos/:pid/:rid/file?path=` | 文件内容 | `FileContent` |
| GET | `/api/projects/:id/versions` | 项目版本清单（实时采集，R18） | `RepoVersionItem[]` |
| POST | `/api/projects/:id/versions/export` | 版本清单写入指定仓库（R18） | `{ok, repoId, path, fullPath, items, count}`；可带 `items` 快照 |
| GET | `/api/projects/:id/releases?n=` | 项目发布历史 | `ReleaseRecord[]`（n≤100） |
| GET | `/api/releases?scopeId=&version=` | 按 scope+版本查记录 | `ReleaseRecord` |
| GET | `/api/releases/:id/versions` | 发布快照版本清单（R18） | `RepoVersionItem[]` |
| PATCH | `/api/releases/:id/log` | 双轨日志编辑（edit/confirm/reset） | `ReleaseRecord`；scope 发布中 409 |
| POST | `/api/publish` | dry-run 预览 / 提交发布任务 | dryRun → 200 `PublishPlan`；执行 → 202 `{taskId, queued}`；忙 → 409 |
| GET | `/api/publish/current` | 当前任务查询 | `{taskId: string\|null, status?, projectId?}` |
| GET | `/api/events?task=` | SSE 事件流（缓冲重放 + 实时） | `PublishEvent` 帧 |
| POST | `/api/sync` | 数据仓库 pull/push/commit/status | `SyncResult` |
| GET | `/api/repos/:pid/:rid/backups?n=` | 仓库备份列表（R19） | `{items: RepoBackupRef[]}` |
| GET | `/api/backups/:releaseId/:repoId` | 备份元数据 | `RepoBackupRef` |
| GET | `/api/backups/download/:releaseId/:repoId/:kind` | 备份文件流式下载（带 token 的 blob） | 附件（Content-Disposition filename*=UTF-8''…） |
| DELETE | `/api/backups/:releaseId/:repoId` | 删除备份文件与元数据 | `{ok}` |
| POST | `/api/backups/compare` | 产物级对比（`{kind:'artifact', left, right}`） | `CompareResult` |
| POST | `/api/backups/verify` | 完整性校验 | `CompareResult`（kind='verify'） |
| GET | `/api/repos/:pid/:rid/diff?from=&to=` | 源码级对比（两 tag/commit） | `CompareResult`（kind='source'） |
| POST | `/api/ai/polish` | AI 日志润色（多供应商） | `{ok, content}`；未启用/无生效供应商/无 key → 400 `AI_CONFIG`；上游失败 502 `AI_FAILED` |
| GET | `/api/ai/providers` | 供应商列表（含 hasKey，不含 key） | `AiProvider[]` |
| POST | `/api/ai/providers` | 新增供应商 | 201 provider（含新 id） |
| PATCH | `/api/ai/providers/:id` | 更新 name/baseUrl/model/enabled（enabled:true 即设为当前） | provider |
| DELETE | `/api/ai/providers/:id` | 删除供应商（级联清理 credentials.aiKeys[id]） | `{ok}` |
| PUT | `/api/ai/providers/:id/credential` | 设置/覆盖 API key（write-only） | `{ok, hasKey:true}`；响应不含 key |
| POST | `/api/ai/test` | 测试连接（`{providerId}`） | `AiTestResult` |

> 阶段二预留路由（git 面板，设计预留）：`POST /api/ai/commit-message`、`POST /api/ai/explain-diff`、`GET /api/repos/:pid/:rid/git/status`、`GET .../git/diff`、`POST .../git/commit`、`POST .../git/stash` / `git/stash-pop`、`POST .../git/push`、`POST .../git/pull`、`DELETE .../git/tags/:tag`——**写操作全部用户显式发起，AI 仅产草稿/建议，服务端永不自动写历史**。

### 6.3 发布队列（PublishQueue）

- 全局单 FIFO：`current: TaskState | null`；`TaskState = {taskId, projectId, status:'running'|'done'|'failed', startedAt, finishedAt, events[], failedRepos[], releaseId}`。
- `submit(req)`：忙 → 抛 409 `TASK_BUSY`（前端转「已有发布任务进行中」弹窗）；空闲 → 创建 task 异步执行（不 await 阻塞响应），返回 taskId。
- 事件缓冲最多 5000 条；`done`/`error` 帧同步更新 task 终态；结束 `sse.finishTask(taskId)`。
- 引擎未发终帧的异常兜底：补发 `error` 事件。

### 6.4 轮询（PollCache）

- `Map<repoId, {status, at}>`，TTL = `pollInterval`；`get(repo, {fresh})`：fresh 或过期 → `engine.collectChanges` 实时拉取；`refreshAll(projects, lockedProjectId)` 发布执行期间跳过锁定项目。
- server 启动序列中先 `refreshAll` 一次，再 `setInterval(pollInterval)`。

### 6.5 SSE（SseHub）

- 连接管理：`Content-Type: text/event-stream`；每 15s 心跳 `: ping`；`retry: 3000`；建连时若当前任务存在 → **重放已缓冲事件**；任务非 running 时重放后 2s 关闭；token 轮换 `closeAll()`。
- 前端用 `fetch + ReadableStream` 手动解析（EventSource 无法带自定义头），按 `\n\n` 缓冲跨 chunk 帧分片。

### 6.6 静态托管

- 生产：`/api/*` 走 API；其余查 `apps/web/dist` 静态文件（带 hash 产物 `Cache-Control: immutable`；index.html/manifest 不缓存）；非文件路径 SPA fallback `index.html`（history 模式深链刷新可用）。
- 路由改动后两种形态（dev Vite fallback / 生产 SPA fallback）都要验证深链刷新。

### 6.7 AI 端点细节（§6.2 补充）

- `POST /api/ai/polish`：body `{text}`；校验 text 非空；`cfg.ai.enabled=false` → 400 `AI_DISABLED`；无生效供应商（activeProviderId 无效）或该供应商无 key → 400 `AI_CONFIG`；调 `core.polishLog` 失败 → 502 `AI_FAILED`（error 含供应商名与上游状态，如「DeepSeek 官方 响应异常（401）：…」）。
- providers CRUD：`hasKey` 由 server 依据 `credentials.json.aiKeys` 计算（脱敏布尔）；`enabled:true` 自动互斥其他（设为当前）；删除当前生效 → 回退无生效供应商（或自动激活剩余第一个，见 §12 决策）。
- 旧配置迁移：读取时若 `providers` 空且旧 `baseUrl/model/apiKey` 非空 → 自动生成默认 provider（id `legacy`），key 迁入 `credentials.json.aiKeys.legacy` 后清空 app.json（**迁移在启动序列执行一次并落盘，读取路径保持只读**）。

## 7. 前端规格（@bxverse/web）

### 7.1 路由与页面

| 路径 | name | 页面 | 说明 |
|---|---|---|---|
| `/` | dashboard | Dashboard 总览 | 统计卡 + 项目网格 + 待发布仓库聚合 |
| `/project/:id` | project | ProjectDetail 项目详情 | 仓库网格（变动排序）+ 发布历史 + 管理 |
| `/project/:id/release` | release | ReleaseWizard 发布向导 | 六步；`?step=` URL 同步 |
| `/project/:id/backups` | backups | BackupManage 备份管理 | 备份列表/下载/校验/删除 + 两次发布对比 + 报告导出 |
| `/repo/:pid/:rid` | repo | RepoDetail 仓库详情 | 文件 / 版本日志 / 设置 三 Tab；`?tab=` URL 同步 |
| `/settings` | settings | Settings 设置 | 外观/主题/AI 供应商/轮询/数据仓库/安全 |
| `/:pathMatch(.*)*` | not-found | NotFound | 404 + 返回入口 |

- 全局：`loadingBar`（router.beforeEach/afterEach，错误时 error）；`document.title = '{meta.title} · BX 版本管理台'`；路由组件懒加载。
- 全局守卫/壳：boot 失败显示「无法连接本地服务」+ 重试按钮；booting 显示 logo + 文案；命令面板（Ctrl+K）全局挂载。

### 7.2 布局壳（AppLayout）

- 左**侧栏**：Logo（BX 版本管理台）→ 导航（总览 + 项目分组列表，含待发布红点与「新建项目」+ 按钮）→ 底部（设置 / 主题切换 / 命令面板 Ctrl K 提示）；可折叠（w-58 ↔ w-14，图标模式）；顶部有「跳到主内容」跳过链接。
- **顶栏**：页标题 + 副标；命令面板搜索框（Ctrl+K，桌面显示）；`RuntimeStatus` 服务状态 chip（checking/connected/unavailable，30s 轮询 + 点击重试）；主题切换按钮（light→dark→system 循环；wenxi 下切回 indigo）；「同步数据」按钮（pull，loading 态）；「新建项目」主按钮。
- **主题**：Naive UI `NConfigProvider`（`theme` 按 `themeStyle/isDark` 选 light/dark/wenxi）+ `themeOverrides` 与 UnoCSS 变量同步；UnoCSS `darkMode: 'class'`（html 上切 `dark` class）；`html.theme-wenxi` 叠加玻璃质感（tokens.css）。
- **主题体系（R20）**：Indigo 精密仪器套件（翠绿主色、6/10/14 圆角、等宽版本读数、细网格背景、亮/暗/跟随系统）；WenXi 深色玻璃拟态套件（近纯黑基底、半透明玻璃卡片、翠绿强调、仅深色，wenxi 下强制 dark）。设置页两种风格卡片点击即时预览切换（不进「保存全部设置」）。

### 7.3 Dashboard 总览

- 数据：`GET /api/overview` + `GET /api/projects`（并行）；页面可见时按 `pollInterval` 轮询（`usePolling`：页面隐藏暂停、回前台立即刷新）。
- 统计卡：项目数 / 仓库数 / 待发布仓库数（有变动时 accent 高亮）。
- 项目网格：`ProjectCard`（名称 + 版本徽标 + 仓库数 + 待发布数 + 上次发布；hover 显示「发起发布」按钮；点击进详情）。空 → `EmptyState`「还没有项目」+ 立即创建。
- 待发布仓库区：按项目分组；每组「发布」按钮直达 `/project/:id/release`；每个仓库 chip（名称/提交数/head）链接仓库详情。
- 加载骨架：首屏 skeleton × 3，其余 NSpin。

### 7.4 ProjectDetail 项目详情

- 页头：项目名 + 描述 + 徽标（版本 / 版本方案 / 日志状态）+ 操作（发布新版本 / 接入仓库 / 备份与对比 / 版本清单导出下拉 / 编辑 / 删除）。
- 代码仓库区：`RepoCard` 网格（有变动的排前）；卡片显示分支/head/versionFile 版本/构建命令/路径；hover 显示「重新检测」；空 → 引导接入（本地路径 + URL 克隆两种方式）。状态经 `GET /status`（缓存）+ 30s 轮询；单仓检测失败显示错误并可重试（绝不静默显示为已同步）。
- 发布历史区：最近 5 条（可「查看全部」，最多 100）；行 = 版本徽标 + bump + 已推送 + 版本清单下拉 + 日期 + 参与仓库名；点击开抽屉（对外/对内日志 Markdown，`max-lines` 渲染护栏）；空 → EmptyState。
- 记录详情抽屉（NDrawer 560px）：对外/对内 Tab + MarkdownView（`:max-lines="800"`，超长提示「完整内容可在仓库详情编辑查看」）。
- 删除项目：确认弹窗（提示发布记录不删除，仅移除管理定义）；purge 选项（克隆目录）可选。

### 7.5 RepoDetail 仓库详情（`?tab=files|logs|settings`）

- 页头：仓库名 + 分支 chip + 状态徽标（变动提交数 / 未提交数 / 纯本地）+ remote（截断 + 复制按钮）；返回项目。
- **Tab 文件**：左 FileTree（懒加载目录树，目录先排、图标按扩展名、`truncated` 提示、键盘 →/←/Enter/Space）右 FileViewer（面包屑 + 大小/行数 + 复制 + 下载；`binary` → 「二进制文件不支持预览」；`truncated` → 顶部警告 + **下载时提示内容不完整**；highlight.js 按扩展名高亮、未知 auto）。
- **Tab 版本日志**：左发布记录列表（版本 + 日期 + 提交数；键盘可达）右日志面板：对外/对内 NRadioButton 切换 + 状态徽标 + 统计；**「编辑日志」**（接线 `PATCH /api/releases/:id/log`）：textarea 编辑 → 保存（edit）/ 确认（confirm）/ 恢复自动草稿（reset，需确认）/ 取消；切换内外轨自动退出编辑态；保存后刷新记录与状态徽标。渲染 `:max-lines="800"` 护栏。
- **Tab 设置**：本地路径（只读） + 表单（英文名/中文名/构建命令/产物目录 outputDir/备份产物目录 artifactDir（DirPicker 点选）/写版本文件开关）+ 保存 / 移除仓库（确认弹窗；克隆接入可勾选删除克隆目录）。

### 7.6 ReleaseWizard 六步发布向导（`?step=1..6`）

> 详细流程见 §8。要点：NSteps 六步；步骤内容容器 + 底部操作栏（上一步/下一步/执行发布）；URL 双向同步；`beforeunload` + `onBeforeRouteLeave` 双守卫；进行中任务接管横幅。

### 7.7 BackupManage 备份管理

- 页头：项目名 + 说明 + 操作（选中两次发布后可「产物对比 / 源码对比 / 清空选择」）。
- 每仓库区块：名称 + 备份数 + 产物目录配置状态；备份行 = 复选框（选两次，同仓库）+ 类型图标 + 版本/日期/tag + 类型 chip（大小）+ 下载下拉 / 校验 / 删除（确认）。
- 结果面板（NModal）：四色统计 chip（新增/缺失/变更/一致）+ `NDataTable`（状态/文件/插入/删除/左右大小）+「导出校验报告」（Markdown 下载）。
- 顶部 NAlert 说明备份语义（源码快照遵循 .gitignore；产物目录需在仓库设置配置）。

### 7.8 Settings 设置页

- **外观与体验**：主题风格卡片（Indigo/WenXi，点击即时预览）；主题单选（WenXi 下禁用并说明「固定深色」）；PWA 开关（运行时注册/注销 SW）；变动检测周期（**以秒为单位**输入，5~3600，内部存毫秒）。
- **AI 供应商管理（R21）**：启用开关 → 当前生效供应商行 → 供应商卡片列表（名称 + OpenAI 兼容徽标 + 模型 + 已设置/未设置密钥 + 上次测试状态）→「+ 添加供应商」；卡片操作：设为当前（互斥）/ 测试 / 编辑（key 留空=保持不变）/ 删除（确认，提示引用该供应商的功能不可用）；添加弹窗带预设自动填充 + 推荐模型 + 获取 Key 文档链接 + 「保存并测试」；凭据 write-only（`PUT credential`，永不回显）。
- **数据仓库同步**：dataDir 只读 + 拉取/推送按钮 + 结果提示。
- **安全**：轮换令牌（确认弹窗；旧 token 立即失效需刷新）。
- 「保存全部设置」→ `POST /api/config`（主题/PWA/轮询/AI 顶层）；失败 toast + 表单保留。

### 7.9 组件清单与关键行为

| 组件 | 行为要点 |
|---|---|
| `PageHeader` | 标题 + 图标块 + 描述 + badges 插槽 + 操作插槽 + 返回按钮 |
| `StatusBadge` | changed/dirty/local/version/pushed/scheme/bump/error/log 统一徽标（禁散落自绘） |
| `EmptyState` | 图标 + 标题 + 描述 + 动作插槽；按钮仅当父组件传 @action 时渲染（$attrs.onAction 判断） |
| `LogEditor` | 双轨编辑器：状态徽标 + 自动草稿/插入模板/AI 润色/对比草稿/确认按钮；内部默认折叠只读（前 24 行预览 + 行数/KB 提示）；textarea **非受控** + 250ms 防抖（超长日志数 MB 不卡）；对比草稿 DiffView；external 才可插入模板与 AI 润色 |
| `MarkdownView` | markdown-it（html 关闭 + linkify + hljs 高亮）；`maxLines>0` 时渲染前 N 行 + 截断提示（性能护栏） |
| `DiffView` | 行级 LCS（前/后）；超 1500 行跳过并提示；+/- 统计 chip |
| `PublishConsole` | SSE 控制台：事件分级着色（▸/▶/✓/✗/★/$ 前缀）、自动滚动（上滚 200px 暂停跟随 + 按钮恢复）、断线提示重连（3s）、事件上限 1000 条滚动裁剪、阶段变化 aria-live 播报（避免逐行轰炸） |
| `CommitList` | 提交列表（类型图标/分类 chip/文件折叠/复制哈希/BREAKING 标记/展开全部） |
| `FileTree`/`FileTreeNode` | 懒加载目录树（childrenMap 缓存、loadingSet、selectedPath；键盘 →/←/Enter/Space；tree-row focus-visible） |
| `FileViewer` | 面包屑/大小/行数/复制/下载（FSA API 另存为，不支持回退下载）；truncated 下载警告 |
| `DirPicker`/`DirPickerNode` | 仅目录树选择器（仓库根选项 + 懒加载 + 键盘 + 选中态 brand 竖条）；rid 变化重置 |
| `VersionExportDropdown` | 四种导出：直接打开（JSON 预览高亮 + 复制/另存）/ 另存为文件（showSaveFilePicker）/ 写入项目仓库（弹窗选仓库 + DirPicker 目录 + .json 校验 + **不 commit 提示**）/ 导出到本地目录（showDirectoryPicker 句柄直写）；菜单内置「版本号格式」开关（完整/仅日期，localStorage 记忆）；外层 @click.stop 防冒泡 |
| `CommandPalette` | Ctrl+K：搜索页面/项目/仓库/发布命令；分组展示；↑↓ 选择 + Enter 执行 + Esc 关闭；空结果提示 |
| `RuntimeStatus` | 服务连接 chip（30s 轮询 + 点击重试；connected 显示 v{version}） |
| `AddProjectDialog` | 新建/编辑项目：名称/描述/版本递增策略（auto/manual）/仓库版本方案（hybrid/timestamp）/对外日志排除类型（多选） |
| `AddRepoDialog` | 接入：本地路径（校验 .git，说明浏览器限制需粘贴绝对路径）/ Git 地址（https/ssh，浅克隆开关，说明克隆到数据目录）；中文名可选 |
| `StatCard`/`ProjectCard`/`RepoCard` | 统计卡 / 项目卡（role=link + 键盘）/ 仓库卡（skeleton 加载态） |
| 通用 WIG | 全部卡片/行/按钮：role+tabindex+Enter/Space、icon-only 按钮 aria-label、装饰图标 aria-hidden、focus-ring 可见焦点环 |

### 7.10 状态管理（Pinia stores）

- `app`：boot（bootstrap 拿 token + config + applyTheme）、themeMode/themeStyle/pwaEnabled/pollInterval getters、setTheme/setThemeStyle/togglePwa。
- `projects`：items/overview/loading/statusCache；load/loadOverview/create/update/remove/addRepo/updateRepo/removeRepo/repoStatus(fresh)/projectReleases。
- `publish`：六步状态机（step/projectId/selectedRepoIds/excludedCommits/plan(markRaw)/planning/bumpOverride/logs{internal,external}/offline/skipBuild/backupSource/backupArtifacts/taskId/phase/events/result/error/planDirty）；getters bothConfirmed/canExecute；actions reset/setSelected/toggleCommit/loadPlan/editLog/confirmLog/unconfirmLog/resetLog/execute/pushEvent。
- `ui`：paletteOpen/togglePalette。

### 7.11 全局交互约定与性能护栏

- **URL 状态同步**：RepoDetail `?tab=`、向导 `?step=` 双向同步（初始化读 query 校验、变化 router.replace 写回）。
- **离开守卫**：向导中双轨日志已编辑（state≠auto）或发布进行中且步骤 2~5 → `beforeunload`（刷新/关页）+ `onBeforeRouteLeave`（站内导航）都需确认。
- **进行中任务接管**：进入向导查询 `/api/publish/current`；同项目 running → 横幅「查看进度」→ 复用 taskId 接管控制台（SSE 重放缓冲事件可恢复画面）。
- **轮询**：`usePolling`（页面隐藏暂停、回前台立即刷新）；Dashboard/ProjectDetail 按 pollInterval。
- **性能护栏**：PublishPlan 存 markRaw（数 MB 不做深度 reactive）；LogEditor textarea 非受控 + 防抖；MarkdownView/DiffView maxLines；提交明细预览前 100 条 + 按仓库「展开全部」；文件树懒加载。
- **WIG 无障碍**：卡片/行/树 role+tabindex+键盘；icon-only 按钮 aria-label；装饰图标 aria-hidden；focus-ring 可见焦点环；日期一律 Intl；placeholder 以 … 结尾；路径输入 autocomplete=off + spellcheck=false；转场显式 transition（禁 transition-all）。
- **图标规范**：UnoCSS presetIcons（`@iconify-json/carbon`），类名静态完整拼写（禁动态生成）；禁 emoji。
- **PWA 运行时开关**：`pwa/register.ts` —— enabled 时手工注册插件产物 `sw.js`（registerType autoUpdate），disabled 时 `getRegistrations().unregister()` + 清 caches；App.vue boot 后按配置应用、watch 配置变更即时生效；dev 不注册。

## 8. 发布流程端到端（六步向导 + 执行 + 完成）

### 8.1 步骤总览

`NSteps`：① 检测变更 → ② 版本号 → ③ 日志（双轨确认）→ ④ 预览（dry-run）→ ⑤ 执行（SSE）→ ⑥ 完成。执行永远由人发起；执行中该项目暂停轮询；全局单 FIFO 队列忙返回 409。

### 8.2 步骤 1 检测变更

- 进入向导：加载项目 → `store.reset` → 读 `?step`（1..6 校验，刷新恢复）→ `detect()` → 默认勾选全部有变动仓库 → 查询 `/api/publish/current`（同项目 running → 接管横幅）。
- `detect()`：对全部仓库 `repoStatus(pid, rid, fresh=true)`，**并发上限 4**（避免一次拉起 N 个 git 进程）；结果存 `Map<repoId, RepoStatus|null>`。
- **失败显式化**：检测失败（git 报错/路径失效/权限）→ 该行红色「检测失败」+ 错误原因 + 单仓库重试按钮；全部失败且无变动 → 顶部错误横幅「部分仓库检测失败」+ 重新检测；**绝不把失败显示为「已同步」**。
- 行交互：有变动的仓库可勾选（checkbox）；展示分支/head/提交数/未提交数/「有变动｜已同步｜检测失败」状态；行内「提交明细」展开（前 100 条 + 按仓库「展开全部」，超过提示总数）。
- **提交级排除**：每个提交前 checkbox（默认全选）；排除后该行「已排除 N 条」徽标；排除导致仓库无剩余提交且无 dirty → 引擎降级 syncedOnly；`store.excludedCommits` 与 `planDirty` 标记。
- 底部「下一步」：至少选择一个变动仓库（否则 warning「请至少选择一个变动仓库」）。

### 8.3 步骤 2 版本号

- 调 `store.loadPlan()`（POST /api/publish dryRun）→ `PublishPlan`（存 markRaw）；「正在计算发布计划…」loading。
- 展示：项目版本 旧 → 新（`vX.Y.Z`，等宽大号）+ bump 徽标（重大/次版本/补丁）+ 建议 chip（suggestedBump≠bump 时）+ buildStamp + 里程碑标签。
- bump 选择（NSelect auto/patch/minor/major）：改动即 `rePlan()`；**已编辑日志时重新生成需确认弹窗**（提示人工编辑将丢失，重新生成重置两侧为自动草稿）。
- 参与发布仓库清单（版本号 + 提交数 + from→to）；「仅同步基版 version.json」折叠（syncedOnly 数量）；warnings 逐条 NAlert。

### 8.4 步骤 3 日志（双轨确认）

- 两个 `LogEditor`（external 在上、internal 在下）；外部编辑器可插入模板（分节标题 / 按类型插入全部提交，遵守 externalExclude + breaking 强制收录）与 **AI 润色**（设置页启用且配置完整时显示）。
- 状态机：`auto → edited → confirmed`，两侧独立；`confirmed` 后锁定编辑器（可解除确认）；「自动草稿」一键重置；「对比草稿」DiffView（autoDraft vs content）。
- 发布执行前两侧必须 `confirmed`（`store.bothConfirmed`）；执行按钮 disabled + tooltip 提示。

### 8.5 步骤 4 预览（dry-run 清单）

- 开关：离线发布（默认开；有远程仓库且离线时顶部 NAlert「本次不会推送标签」）/ 跳过构建命令（默认开）/ 源码备份（默认关）/ 产物备份（默认关）。
- 清单逐行渲染「将执行的命令」：预检 / `[$] buildCommand`（跳过时置灰）/ `git tag milestone` / `git tag build` / `[备份] bundle+archive` / `[备份] 产物归档 {dir} → artifact.tar.gz + 哈希清单`（未配置产物目录置灰「跳过」）/ 写 version.json / 更新检测基准 / `[同步基版]` / 写发布记录 / 数据仓库里程碑 + commit / 远程推送或「离线模式：跳过推送」。
- 底部「执行发布」：`store.canExecute`（plan 存在 + 双轨 confirmed）；执行中 loading；409 → 弹窗「已有发布任务进行中」。

### 8.6 步骤 5 执行（SSE 实时控制台）

- `store.execute()` → `POST /api/publish`（日志内容仅在 edited 且 ≠ autoDraft 时携带，避免数 MB 重复传输）→ `{taskId}` → `PublishConsole` 订阅 `GET /api/events?task=`。
- 控制台：事件分级着色、自动滚动（上滚 200px 暂停跟随）、断线 3s 重连提示、阶段变化 aria-live。
- 失败：`error` 事件 → 顶部 NAlert + 「回到版本号重试」；`done` → 步骤 6。

### 8.7 步骤 6 完成

- 成功：大号对勾 + 版本号 + 「统一发布完成」；`failedRepos` 非空 → warning 提示「以下仓库发布失败（未更新检测基准，可下次重新发布）：…」。
- 操作：返回项目 / 查看本次备份（有备份时）/ 版本清单导出下拉（`api.releaseVersions`）/ 再次发布（reset + detect + 默认勾选变动仓库）。

## 9. 版本号、标签与双轨日志规格汇总

### 9.1 版本方案

| 层 | 默认 | 可配 | 规则 |
|---|---|---|---|
| 项目 | `vX.Y.Z` | `ProjectDef.bump` auto/manual | bump 推断：breaking→major / feat→minor / 否则 patch；manual 建议恒 patch |
| 仓库 | `vX.Y.Z.YYMMDDHH` | `repoVersionScheme` hybrid/timestamp | hybrid=`v{projectVersion}.{buildStamp}`；timestamp=`v{buildStamp}` |
| buildStamp | `YYMMDDHH` | 撞名自动追加序号至 8~10 位 | 同小时 100 次抛 BUILD_STAMP_EXHAUSTED |

### 9.2 标签约定

- 里程碑：`vX.Y.Z`（业务仓库与数据仓库各打一个）；构建：`build/vX.Y.Z.YYMMDDHH`。
- 幂等：同名同 commit 跳过；milestone 撞车（不同 commit）预检阻断；build 撞车 buildStamp 规避。
- 推送：`!offline && hasRemote` → `push origin tag {tag}` ×2；失败仅警告降级（`pushed:false`）。

### 9.3 双轨日志状态机

```
auto（自动草稿）──编辑──► edited ──确认──► confirmed
   ▲                          │                     │
   └──────── 自动草稿重置 ◄────┴────── 解除确认 ◄────┘
```

- 发布前（向导）：前端状态机，最终经 `PublishRequest.externalContent/internalContent` 提交；落盘时服务端推断初始 state（content===autoDraft → auto，否则 edited）。
- 发布后（历史编辑）：`PATCH /api/releases/:id/log`（edit→edited / confirm→confirmed / reset→auto），scope 发布中 409；`updateRecord` 校验不可变字段 id/version/scopeId；`commitRecords('chore: manual log edit')` 入审计。
- 模板：internal 全量（提交明细+文件+统计）、external 分节（EXTERNAL_SECTIONS，DEFAULT_EXTERNAL_EXCLUDE，breaking 强制收录）；`autoDraft` 留底供 diff。

## 10. 备份与一致性对比（R19）汇总

| 项 | 规格 |
|---|---|
| 触发 | 每次发布逐仓库自动备份（`AppConfig.backup.enabled` 总开关；向导 backupSource/backupArtifacts 默认关可开） |
| 源码 | `source.bundle`（git bundle --all，可 clone 恢复）+ `source.tar.gz`（git archive，遵循 .gitignore）+ `source.sha256` |
| 产物 | `RepoDef.artifactDir` → `artifact.tar.gz` + `artifact-manifest.json`（哈希清单，即使被业务 .gitignore 也不丢）；未配置/为空跳过 |
| 存储 | 大文件 `backups/{projectId}/{repoId}/{versionSafe}/` 不进 git；元数据 `RepoBackupRef` 入数据仓库随发布 commit 审计 |
| 对比 | 源码级（git diff 两 tag/commit，numstat+name-status 合并）/ 产物级（清单 SHA-256 对比）/ 校验级（manifest vs 实际文件）→ added/removed/modified/same + totals |
| 报告 | 前端导出 Markdown（类型/左右版本/汇总/表格） |
| 失败 | `onFailure='warn'`（缺省，降级警告继续）/ `'fail'`（该仓库发布中止，repo-error 隔离） |
| 恢复 | M7 远期暂缓：bundle 克隆恢复 + 产物解包到指定目录 + 恢复向导 |

## 11. AI 能力规格（R21：多供应商 + 阶段二 Git 助手）

### 11.1 供应商预设（AI_PRESET_PROVIDERS，19 个）

| 预设 | baseUrl | placeholderModel | 分类 |
|---|---|---|---|
| DeepSeek 官方 | https://api.deepseek.com/v1 | deepseek-chat | domestic |
| Kimi (Moonshot) | https://api.moonshot.cn/v1 | kimi-k2.6 | domestic |
| 阿里通义千问 (DashScope) | https://dashscope.aliyuncs.com/compatible-mode/v1 | qwen-plus | domestic |
| 智谱 GLM | https://open.bigmodel.cn/api/paas/v4 | glm-4-flash | domestic |
| MiniMax (海螺) | https://api.minimaxi.com/v1 | MiniMax-M3 | domestic |
| 字节豆包 (Volcengine) | https://ark.cn-beijing.volces.com/api/v3 | doubao-pro-32k | domestic |
| 小米 MiMo API | https://api.xiaomimimo.com/v1 | mimo-v1 | domestic |
| 阶跃星辰 (StepFun) | https://api.stepfun.com/v1 | step-1-8k | domestic |
| 百川智能 | https://api.baichuan-ai.com/v1 | Baichuan4 | domestic |
| 硅基流动 (SiliconFlow) | https://api.siliconflow.cn/v1 | deepseek-ai/DeepSeek-V3 | aggregator |
| OpenRouter | https://openrouter.ai/api/v1 | deepseek/deepseek-chat | aggregator |
| AiHubMix | https://aihubmix.com/v1 | deepseek-chat | aggregator |
| OpenAI 官方 | https://api.openai.com/v1 | gpt-4o-mini | global |
| Groq | https://api.groq.com/openai/v1 | llama-3.3-70b-versatile | global |
| Mistral AI | https://api.mistral.ai/v1 | codestral-latest | global |
| Google Gemini | https://generativelanguage.googleapis.com/v1beta/openai | gemini-2.0-flash | global |
| Ollama 本地 | http://127.0.0.1:11434/v1 | qwen2.5:7b | local |
| LM Studio 本地 | http://127.0.0.1:1234/v1 | local-model | local |
| vLLM / LocalAI | http://127.0.0.1:8000/v1 | default | local |

- 每个预设含：`docUrl`（获取 Key 文档）、`recommendedModels[]`（推荐模型 + isDefault）、`hint`（说明）。
- 全部走 OpenAI 兼容 `/chat/completions`；`kind: 'openai-compatible'` 预留扩展位。

### 11.2 凭据与迁移

- key 存 `credentials.json.aiKeys[providerId]`（0600）；API/UI 永不回显，以 `hasKey:boolean` 呈现；`PUT /api/ai/providers/:id/credential` 写 key（write-only）。
- 旧 `ai.apiKey` 仅作迁移载体：启动时 providers 空且旧字段非空 → 生成 id=`legacy` 默认 provider，key 迁入 aiKeys 后置空；app.json 永不存明文。
- 删除 provider 级联清理 aiKeys；删除当前生效 → 回退无生效供应商（或自动激活剩余第一个，实现时二选一并文档化）。

### 11.3 润色与测试语义

- `POST /api/ai/polish`：读 active provider + credentials key；未启用/无生效/无 key → 400；上游失败 → 502（error 含供应商名）；成功返回 `{content}`（去代码块包裹）；前端仅生成草稿（state→edited），**仍须人工确认**。
- `POST /api/ai/test`：最小 chat 请求 → `AiTestResult{ok, latencyMs, model, reply, detail?}`；UI 保存 key 后可自动后台测试一次并展示「上次测试：通过/失败/未测」。

### 11.4 阶段二：AI Git 助手（设计预留）

- RepoDetail「Git」tab：工作区状态（dirty 文件 + 增删改徽标）/ diff 查看（工作区 vs HEAD / 两提交标签间，复用 DiffView）/ 提交（勾选文件 + 消息 + 确认弹窗；**禁止裸 add -A 全量**，files 必填且校验在仓库工作区内）/ stash / stash-pop（冲突定义错误码与恢复指引）/ push（分支 / --tags，发布 offline 后补推入口）/ pull（--ff-only，失败给可读错误）/ 标签查看删除（二次确认，建议只允许删 build/* 前缀）。
- AI：`commit-message`（conventional 草稿，可编辑，仅用户点提交才执行；diff 过大服务端截断 + 返回 truncated 标记）/ `explain-diff`（中文摘要：改了啥/为什么/风险，MarkdownView 渲染）/ 预检失败 AI 分析（未提交改动摘要 + 提交或 stash 建议）。
- 边界：**AI 只产草稿/建议；commit/stash/push/pull/tag 删除全部用户显式发起 + 确认；AI 永不触发任何写操作**；所有 git 写操作建议记本地日志审计（与「历史即审计」一致）。

## 12. 边界情况与错误处理总表

| 场景 | 处理 |
|---|---|
| 空仓库（无 commit） | head/branch=''、commits=[]、changed=false；预检阻断发布（提示先提交） |
| 首次发布（lastPublishCommit=null） | commitsSince --root 全量；diffStat 对空树 hash；无 milestone 冲突 |
| milestone tag 撞车（同版本不同 commit） | 预检**阻断**，要求 bump 版本 |
| build tag 撞车（同 stamp 不同 commit） | buildStamp 自动加序号规避 + warning |
| 基准不可达（force-push/GC） | 警告 + 按首次发布全量收集 |
| 工作树 dirty>0 | 预检阻断（dirtyCount 仅统计已跟踪文件；untracked 不阻断） |
| 大仓库 | commitsSince 截断 3000（warning）；diffStat 超时降级全 0（warning）；克隆 120s 超时；文件树懒加载 + truncated |
| 文件树/读取超限 | 条目>1000 / 大小>512KB / 行数>5000 → truncated（空 content 或前 N 行），不报错 |
| 符号链接/junction 指向仓库外 | safeAbs realpath 解析后拒绝 |
| 检测失败（git 报错等） | 前端红条显式呈现 + 重试，绝不显示为「已同步」 |
| 提交级排除后无剩余提交 | 全部排除且 dirty=0 → 降级 syncedOnly（仅同步基版） |
| 单仓构建失败 | repo-error 隔离：跳过继续；lastPublishCommit 未更新，下轮自动重新检测 |
| 全部仓库失败 | error 事件，不落任何记录 |
| 无远程 / offline | 纯本地降级：跳过 push，pushed=false + warning |
| 数据仓库 pull 冲突 | 保留本地 + 警告（SYNC_CONFLICT），人工解决 |
| 进程崩溃中断 | journal 每 step 原子落盘；重启标 interrupted + 广播；重新发起同项目发布续跑（复用锁存 plan） |
| 队列忙 | 409 TASK_BUSY（queueLength）；前端弹窗 |
| 发布执行中改项目定义 | 409 PUBLISH_RUNNING |
| AI 服务不可用/超时/无 key | polish 失败显式报错（502/400），绝不静默回退原文 |
| 备份失败（缺省 warn） | 降级警告发布继续；fail 时该仓库中止 |
| 大日志（数 MB） | plan markRaw、textarea 非受控+防抖、MarkdownView maxLines、diff 1500 行上限 |
| Windows 路径（盘符/中文/空格） | spawn 数组参数 + core.quotepath=false + 正斜杠归一；URL/JSON 注意转义 |
| 文件名含换行（罕见） | commitsSince 解析按空行切分会错位（已知限制，注释标注） |

## 13. 验证与验收标准

### 13.1 自动化命令

| 命令 | 含义 | 出口 |
|---|---|---|
| `pnpm typecheck` | 全包 `tsc --noEmit` / vue-tsc | 0 错误（strict、noUnusedLocals/Parameters） |
| `pnpm build` | shared→core→server→cli→web 全链 | 产物就位；web 含 dist/sw.js |
| `pnpm test` | core 单测（vitest，临时 git fixture 仓库） | 全绿（当前基线 56 用例） |
| `pnpm --filter @bxverse/server test` | server 集成测试（真实 HTTP 进程） | 全绿（当前基线 26 用例，含 AI 路由） |
| `pnpm start` | 生产形态 | 浏览器访问 127.0.0.1:8899 完整可用 |
| `pnpm seed` | 演示数据（需服务已启动） | 演示项目 + fixture 仓库 |
| e2e/ | playwright：`prepare-fixture.mjs` + `wizard-flow.py`（六步全流程，BX_PORT=18899）+ `resume.mjs`（中断续跑，BX_PORT=18898） | 独立 BX_HOME 不碰真实数据 |

### 13.2 验收矩阵（按需求）

| 需求 | 验收 |
|---|---|
| R1/R17 | 本地 Web + 可选 PWA（运行时开关生效）；UI 精致、双主题、键盘可达、命令面板 |
| R2/R3/R4 | 项目/仓库两级；本地路径 + URL 克隆接入；文件树/文件查看（懒加载 + 截断保护 + 符号链接加固） |
| R5/R6/R7/R14 | 仓库/项目版本与双轨日志；自动生成 + 人工编辑确认；状态可追踪；历史日志可编辑 |
| R8/R9/R12 | 版本方案可配；检测/bump/草稿/dry-run 全自动；仓库随项目联动、未变动仓库同步基版 |
| R10 | 纯本地与远程 tag 联动双模式；离线/无远程自动降级仅警告 |
| R13 | 总览/详情可见每仓库改动点（提交 + 影响文件 + 统计） |
| R18 | 版本清单导出：下载/写仓库（树选目录）/本地目录/预览；与发布绑定；格式开关（完整/仅日期） |
| R19 | 每次发布自动备份（bundle+快照+产物+哈希清单）；三层对比 + 报告导出；元数据审计 |
| R20 | 双主题套件切换即时生效；WenXi 强制深色；主题变量单一来源 |
| R21 | 多供应商管理（预设/自定义、设为当前、测试、write-only 凭据、热更新）；AI 润色只产草稿；阶段二 Git 面板与 AI 建议（写操作全人工） |
| 非功能·安全 | 127.0.0.1、防 CSRF、凭据独立、token Header、路径穿越/符号链接拦截 |
| 非功能·可靠性 | 发布 journal 续跑演练通过；预检阻断；失败隔离；tag 幂等 |

## 14. 里程碑建议与工作量参考

| 里程碑 | 产出 | 出口 |
|---|---|---|
| M1 核心引擎 | shared 契约 + core 全部模块 + 单测 | 零第三方依赖、56 用例绿 |
| M2 服务端 | server 全部路由 + SSE + 队列 + CLI | 路由全量验证 + 26 集成用例绿 |
| M3 前端三页 | 脚手架 + Dashboard/ProjectDetail/RepoDetail | 三页对真实数据闭环可用 |
| M4 发布向导 | 六步向导 + 双轨日志编辑 + 设置页 + 命令面板 | fixture 仓库全流程发布通过 |
| M5 自动化/PWA/AI/收尾 | PWA 运行时开关、AI 润色、初始数据、键盘可达、边界回归 | 生产形态交付、全命令绿 |
| M6 备份与对比（R19） | 备份存储/打包/对比引擎/API/管理页 | 两次发布对比通过 |
| M7 备份恢复（远期） | bundle 克隆恢复、产物解包、恢复向导 | M6 后再排期 |

## 15. 变更记录（本规格来源版本）

| 日期 | 内容 |
|---|---|
| 2026-08-13 | 依据 requirements/architecture/core-engine/data-model/api/frontend 各文档定稿版提取 |
| 2026-08-17 | 并入 R18 导出细节、发布默认值（离线/跳过构建/不备份）、R19 备份对比、R20 双主题、R21 AI 多供应商 + Git 助手设计；并入向导容错优化（检测失败显式化/任务接管/路由守卫）与 PWA 运行时接线、历史日志编辑、AI 润色全链路等已实现优化 |

---

> 文档完。交给重建 AI 时建议同时提供：本规格 + `packages/shared/src/types.ts` + `constants.ts`（作为契约的唯一事实来源，任何冲突以 shared 为准）。