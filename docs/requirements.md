# bxverse 原始需求文档

> 本文档记录产品的**原始需求**（用户提出时的原意）与**需求澄清结论**，作为后续设计与开发的唯一需求依据。
> 项目代号：bxverse（BX 版本管理台）。

## 1. 背景

现有多个业务工程散落在本机不同目录，各自有独立的版本与更新日志生成脚本（曾由 bx-version-cli 统一管理）。
现有痛点：仓库散乱、版本不统一、日志分散、跨仓库联动困难、缺少可视化管理界面。

目标：**一个统一管理入口**，在本地以可视化方式管理「项目 → 代码仓库」两级结构，自动化生成版本号与更新日志，支持纯本地与远程（tag / release）两种模式。

## 2. 原始需求清单

> 以下为需求提出时的原文要点（逐条保留原意）。

| 编号 | 原始需求 | 原话要点 |
|---|---|---|
| R1 | 客户端形态 | 「希望有的是一个 web 端或者 tauri 打包的客户端」——两者选其一或皆可 |
| R2 | 两级管理模型 | 「要能管理项目，每个项目底下可以有很多代码仓库，可以统一管理这些代码仓库」 |
| R3 | 仓库接入方式 | 「只需要输入代码仓库的 git 地址或者选择本地的位置（实现其中一种或者两种都是些）」 |
| R4 | 仓库内容查看 | 「就能查看到这个仓库的目录结构和文件」 |
| R5 | 仓库级版本与日志 | 「在项目里面可以方便的管理每个仓库代码的版本以及更新日志」 |
| R6 | 项目级版本与日志 | 「也有个项目的版本和更新日志」 |
| R7 | 日志双轨 | 「仓库和项目的版本日志都分为对内和对外」 |
| R8 | 版本号方案 | 「或者是按时间戳还是按通用的 X.Y.Z 版本号」——两种方案均可/可配 |
| R9 | 自动化 | 「所有的生成版本号或者日志尽量能自动化」 |
| R10 | 双模式 | 「可以纯本地操作也可以结合远程仓库的 tag/release 功能」 |
| R11 | 现有工程托管 | 现有工程：`E:\bx-gitee\l-pc-front`、`E:\bx-gitee\l-data-v`、`E:\bx-gitee\l-mp-weixin-reface`、`E:\bx_pc_main\saas`、`E:\project\box-im\im-web`、`E:\bx-gitee\vr-fornt`（后续还会增加）——「这些工程需要放在一个项目里管理」 |
| R12 | 版本联动 | 「每个仓库发生变动后他们各自的版本要相应的改动，统一版本也要变动」 |
| R13 | 改动点可见 | 「统一的管理的工具里要能看到每个仓库的改动点」 |
| R14 | 日志人工可控 | 「对内/对外日志要能自动生成也能人工编辑确认」 |
| R15 | 完整性 | 「要考虑的尽可能完整，不需要有历史包袱」——不迁就旧实现，以新设计为准 |
| R16 | 好用 | 「能在满足我的需求的前提下足够好用」 |
| R17 | UI/UX | 「UIUX 也要尽可能美观优雅精致大方体验足够好」 |
| R18 | 版本清单导出（MVP 补充） | 「在 MVP 版本实现：生成一个 JSON 文件，返回该项目下所有仓库的版本，格式为 JSON 数组，字段有 app（仓库英文名）、name（仓库中文名）、version（版本号）」「把这个生成的 JSON 可以自定义放到项目中某个仓库下」——除下载外，还可写入项目下指定仓库的指定相对路径 |
| R19 | 版本一致性对比与发布备份 | 每次发布自动备份：①源码备份 = git bundle（含全部历史与标签，可完整恢复）+ git archive 快照（仅已跟踪文件，天然遵循 .gitignore）；②产物备份 = 用户按仓库指定的产物目录（`RepoDef.artifactDir`）打包归档 + 哈希清单 manifest.json；③一致性对比：源码级（两 tag/commit 间 git diff）与产物级（两份归档/清单 SHA-256 对比）→ 新增/删除/修改/一致四类差异清单，可导出校验报告；④备份元数据（哈希/大小/commit/tag）入 git 数据仓库审计，大文件存本地 `backups/` 目录不进数据仓库；⑤恢复功能列为远期低优先级 |
| R20 | 主题体系（实现期需求） | 双主题套件：Indigo 精密仪器套件（翠绿主色、等宽版本读数、亮/暗/跟随系统）+ WenXi 深色玻璃拟态套件（近纯黑基底、玻璃卡片，仅深色），`AppConfig.themeStyle` 承载（`'indigo' \| 'wenxi'`），设置页一键切换即时预览；配套顶栏：页标题、命令面板搜索（Ctrl+K）、服务状态 chip、主题切换、同步数据、新建项目 |
| R21 | AI 多供应商体系 | AI 支持 OpenAI 兼容多供应商（DeepSeek / OpenAI / Ollama / Kimi coding plan / 小米 MiMo / MiniMax / 自定义 baseUrl 等），可切换当前生效供应商；凭据 **write-only**（存 `credentials.json`，API 与 UI 永不回显明文），一键连通性测试；向导日志「AI 润色」面向生效供应商；配套精密仪器视觉语言（版本号徽章、统计卡读数风、发布行左缘指示条、按压反馈、全键盘可达） |
| R22 | 仓库 Git 面板与 AI 助手 | 仓库详情新增 Git tab：分支、HEAD、ahead/behind 读数；变动文件区分「已暂存 / 未暂存 / 未追踪」；单文件与一键全部暂存/撤销；单文件 Diff 侧栏 + AI 变更解读；Conventional Commits 提交弹窗支持 AI 生成规范标题与说明 + 手工确认提交；拉取（--ff-only 安全快进）与推送联动——**AI 只产草稿，写操作永远用户确认** |
| R23 | AI 场景特化路由 | AI 供应商支持按场景分流：`commit`（提交信息生成，极速）、`polish`（日志润色）、`explain`（变更解读，深度推理）三条路由可分别配置模型（`AppConfig.ai.routes`） |
| R24 | 发布废弃审计 | 对已发布版本可标记废弃（`POST /api/releases/:id/deprecate {reason, cleanupTags}`），记录 `deprecated`/`deprecateReason`/`deprecatedAt`，可选清理业务仓库里程碑与构建标签 |
| R25 | 多工程分支协同巡检与批量对齐 | 按项目维度巡检各仓库是否停留在主发布分支（`GET /api/projects/:id/branch-alignment`），并支持批量切分支（`POST /batch-checkout`）与批量快进拉取（`POST /batch-pull`） |
| R26 | 仓库级构建流水线与 package.json 版本源 | ①每个仓库可配置完整构建流水线：包管理器探测/自定义、`installCommand`（默认 frozen）、`preBuildCommand`、`buildCommand`、`buildTimeoutMs`；②版本源可选 `derived`（派生，默认）/`packageJson`（以仓库根 `package.json` 为权威，写入 `X.Y.Z` 核心）；③项目级版本格式 `X.Y.Z`（标准语义）/`VYYMMDDHHmm`（纯时间戳，大写 V + 10 位）；④`V` 格式下仓库版本与 bump 无关，X.Y.Z 核心照常随项目 bump 同步；⑤汇总清单 `version.json` 支持发布时按 `manifestTarget` 自动落盘（手动导出保留）；⑥无 `package.json` 的仓库自动降级派生 |
| R27 | external 日志分发至 GitHub/Gitee Release | external 日志生成后可一键分发至 GitHub/Gitee Release（tag 已打好，Release API 幂等同步）：①用户在发布完成页与发布历史行对单仓库选择 provider（GitHub/Gitee）同步 external 内容为平台 Release 备注；②支持复制 Markdown / 导出 .md/.html 三种本地固化渠道；③离线或未配置 token 时禁用并提示 |
| R28 | 快速发布通道（周度 patch 提效） | 六步向导对 patch 是税负：①项目记录上存 `ProjectDef.lastQuickPublish?: {repoIds,bump,skipBuild,offline,backupSource,backupArtifacts}`（扩展字段），发布成功时 withCfg 原子化快照本次配置；②ProjectDetail/向导入口提供“快速发布”（`?mode=quick`），预填上次配置 + 检测→版本（沿用 bump）→日志（auto-draft 展示一次确认）→dry-run→执行，砍掉反复重选但 dry-run 与双轨 confirmed 仍强制（人审为终不破）；③向导保留为“详细模式”。验收：连续两次 patch 第二次交互≤5 步；门禁不可绕过 |
| R29 | 发布 webhook 通知 | 发布完成（done）或失败（error）时向配置的 Incoming webhook 批量 POST JSON（`{event, projectId, version, failedRepos, timestamp}`），适配钉钉/企微/飞书；`AppConfig.notifications.webhooks[]` 中每条含 `id/url/events/enabled`，url 强制 https（本地回环 http 放行以便测试），events 白名单 `done/error`，逐条 5s 超时、重试 1 次，失败记 structuredLog 不影响主流程 |
| R30 | prerelease 灰度支持（N3） | ①契约层：`BumpType` 保持 `major\|minor\|patch`，灰度由可选 `prerelease?: string` 承载（`beta.1`/`rc.1` 等，`PRERELEASE_RE=/^[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*$/`，缺省为正式版）；`PublishRequest`/`PublishPlan`/`PlannedRepo`/`ReleaseRecord`/`RepoReleaseRef` 新增可选 `prerelease?: string`（`// 扩展：R30`），版本正则 `SEMVER_RE`/`HYBRID_VERSION_RE` 扩展 `-beta.N` 并统一 `build` 段为 `\d{6,12}`，新增 `SEMVER_PRERELEASE_RE`/`PRERELEASE_RE`；②版本引擎：`resolvePrerelease(prev,requested)` 同标识递增（`beta.1→beta.2`、`beta→beta.2`，不同标识直接覆盖）、`bumpSemver`/`hybridVersion`/`formatRepoVersion` 透传 prerelease，里程碑始终 `vX.Y.Z-beta.N`（`X.Y.Z` 格式亦渲染为 `1.2.0-beta.1`，`VYYMMDDHHmm` 不受 prerelease 影响），排序 `compareSemver`/`compareVersion` 引入 prerelease 比较（`beta.1 < 正式版`），`isValidPrerelease` 校验；③向导：步骤 2 新增版本类型选择器（正式版/Beta/RC/自定义，`NRadioGroup` + `NInput`，`PRERELEASE_RE` 校验，400ms 防抖 `rePlan`），实时预览本地 `bumpSemverLocal`/`resolvePrereleaseLocal`（`v1.2.0-beta.1→v1.2.0-beta.2`、同标识递增、异标识覆盖），标签预览 `vX.Y.Z-beta.N`/`build/vX.Y.Z-beta.N`，切换时触发日志重置确认 |

## 3. 需求澄清结论（已确认）

| 决策点 | 结论 |
|---|---|
| 客户端形态 | **本地 Web 服务 + 浏览器**（127.0.0.1），体验必须足够好、能在 Web 端管理本地仓库；PWA 可选安装（自由控制是否开启），替代桌面壳体验；Tauri 壳列为远期备选 |
| 前端技术栈 | **Vue3 最佳实践**：Vue3 + Vite + TypeScript + `<script setup>` + Composition API + Pinia + Vue Router + **Naive UI** + **UnoCSS**（含 presetIcons，字体图标全部使用 UnoCSS icons 预设） |
| 包管理 | **pnpm**（monorepo workspace） |
| 仓库接入 | **两种都支持**：本地路径（校验 .git）＋ Git 地址克隆（https/ssh） |
| 版本号方案 | **可配置**：项目级 `vX.Y.Z`（对外语义）+ 仓库级 `vX.Y.Z.YYMMDDHH`（混合，对内可追溯）；纯时间戳方案预留 |
| 日志双轨 | 每次发布产出对内（internal）与对外（external）两份日志，**均可自动生成 + 人工编辑确认**，状态可追踪（草稿/已编辑/已确认/已发布） |
| 版本联动 | 仓库变动 → 仓库版本随项目基版更新 → 项目统一版本 bump；未变动仓库同步基版保证全局一致 |
| 改动点 | 统一工具中可查看每个仓库相对上次发布的提交与影响文件（聚合展示） |
| 数据存储 | 发布数据存于**数据仓库**（git 版本化，历史即审计，可多机同步）；应用配置存于本地用户目录 |
| 备份存储 | 备份大文件（bundle/快照/产物归档）存本地 `~/.bxverse/backups/`（`AppConfig.backup.dir` 可配），**不进 git 数据仓库**避免膨胀；备份元数据（manifest/哈希/大小/commit/tag）以 JSON 落入数据仓库审计 |
| 备份策略 | 每次发布默认自动备份（`AppConfig.backup.enabled` 总开关）；源码备份遵循 .gitignore（bundle 含全部历史、archive 快照仅已跟踪文件）；产物备份归档用户指定的产物目录（未配置则跳过并提示）；备份失败策略 `onFailure: warn\|fail` 可配 |
| 一致性对比 | 三个层次：①源码级（git diff 两 tag/commit 间文件与统计）；②产物级（两份归档或哈希清单 SHA-256 对比）；③校验级（manifest vs 实际文件，校验归档包完整性）。差异结果分 新增/删除/修改/一致 四类，可导出校验报告 |
| external 分发 | external 日志可一键同步至 GitHub/Gitee Release（`POST /repos/{owner}/{repo}/releases`，同 tag 幂等 PATCH），token 存 `credentials.json`（`releaseTokens[provider]`），离线或无 token 时禁用并提示；另支持复制 Markdown / 导出 .md/.html 本地固化 |

## 4. 现有工程清单（初始数据）

| 工程 | 本地路径 | 说明 |
|---|---|---|
| l-pc-front | `E:\bx-gitee\l-pc-front` | 现有工程，纳入「默认项目」 |
| l-data-v | `E:\bx-gitee\l-data-v` | 现有工程 |
| l-mp-weixin-reface | `E:\bx-gitee\l-mp-weixin-reface` | 现有工程 |
| saas | `E:\bx_pc_main\saas` | 现有工程 |
| im-web | `E:\project\box-im\im-web` | 现有工程 |
| vr-fornt | `E:\bx-gitee\vr-fornt` | 现有工程 |

以上 6 个工程初期放在**一个项目**（如「主产品线」）中管理；模型支持任意多个项目，后续新工程可直接加入。

## 5. 非功能需求

| 类别 | 要求 |
|---|---|
| 安全 | 服务仅绑定 127.0.0.1；API 防 CSRF；凭据独立存储、不进数据仓库；token 走 Header |
| 可靠性 | 发布任务可中断续跑；失败不污染已完成仓库；发布前预检阻塞项 |
| 性能 | 文件树懒加载、git 调用缓存；发布任务单队列 |
| 自动化 | 轮询检测仓库变动、版本 bump 自动建议、内外日志自动草稿；发布执行最终由人确认 |
| 体验 | 美观优雅精致大方；键盘可达；命令面板；亮/暗主题；动效克制；空状态引导 |
| 兼容 | 纯本地（无 origin/离线）与远程联动（tag/release）自动降级 |

## 6. 变更记录

| 日期 | 变更 |
|---|---|
| 2026-08-13 | 首次记录原始需求与澄清结论 |
| 2026-08-13 | 补充 R18：项目版本清单导出（app/name/version JSON 数组）——`RepoDef.displayName`（中文名）承载 name 字段，`GET /api/projects/:id/versions` 返回 |
| 2026-08-13 | R18 补充：生成的文件可自定义写入项目下某个仓库的指定路径——`POST /api/projects/:id/versions/export {repoId, path}` |
| 2026-08-13 | R18 澄清：写入目标**手动点选**（弹窗内树形目录选择器，不手填路径）；全面引入 File System Access API——导出另存为（showSaveFilePicker）、导出到任意本地目录（showDirectoryPicker + 句柄写入）、文件查看器原生下载；仓库内写入因浏览器不暴露绝对路径由树选择器承担 |
| 2026-08-13 | R18 补充：版本清单与发布绑定——每次发布完成页可导出当次清单；发布历史每条记录可导出**当时快照**（`GET /api/releases/:id/versions`，发布落盘时快照各仓库版本与中文名） |
| 2026-08-13 | 新增 R19：版本一致性对比与发布备份——发布时自动备份源码（git bundle + archive 快照，遵循 .gitignore）与产物（按仓库指定 artifactDir 打包 + manifest）；三层次一致性对比（源码 git diff / 产物清单对比 / manifest 校验）；大文件本地 `backups/`、元数据入数据仓库；恢复功能远期低优先级 |
| 2026-08-17 | 需求补充（R18 导出 + 发布默认值）：导出版本清单可选「**仅日期**」版本号格式（`V` + 8 位时间戳，如 `V26081728`；默认仍为完整 `vX.Y.Z.YYMMDDHH`）；导出**默认文件名** `version.json`；发布向导**默认离线发布、跳过构建命令、不备份源码与产物**（可手动开启） |
| 2026-08-17 | 需求补充（AI 多供应商 + Git 助手，设计见 `docs/frontend.md` §4.19 / `docs/api.md` §3.10 / `docs/data-model.md` §3.1）：① AI 支持**多供应商**（OpenAI 兼容：DeepSeek 官方 / OpenAI / Ollama 本地 / Kimi coding plan / 小米 MiMo API / MiniMax coding plan / 自定义 baseUrl），可切换当前生效供应商；凭据 **write-only**（存 `credentials.json`，不回显、不落 app.json）② 向导日志「AI 润色」升级多供应商 ③ 后续（阶段二）：仓库 Git 操作面板（状态/diff/提交/stash/推送/拉取/标签）+ **AI 生成提交信息**（conventional 草稿）与 **AI 变更解读**（中文摘要）+ 预检失败 AI 分析——AI 只产草稿，写操作永远用户确认 |
| 2026-08-17 | 新增 R23：AI 场景特化路由——`AppConfig.ai.routes` 支持按场景分流（`commit` 极速/`polish` 润色/`explain` 深度推理），实现已在 `dfe8e6d` 落地，文档追认 |
| 2026-08-25 | 追认补录 R20/R21/R22 定义（此前编号在 README/roadmap 中被引用但本表缺失，造成追溯断链）：R20 双主题体系与顶栏（Indigo 精密仪器 + WenXi 玻璃拟态，`themeStyle` 契约）、R21 AI 多供应商体系（write-only 凭据 + 连通性测试 + 润色）与精密仪器视觉语言、R22 仓库 Git 面板与 AI 助手（AI 只产草稿、写操作用户确认）；三者均已实现（`45dba62` 等），本次仅回填定义不改变任何语义 |
| 2026-08-17 | 新增 R24：发布废弃审计——`POST /api/releases/:id/deprecate` 标记 `deprecated`/`deprecateReason`/`deprecatedAt`，可选清理业务仓库标签，实现已在 `dfe8e6d` 落地，文档追认 |
| 2026-08-17 | 新增 R25：多工程分支协同巡检与批量对齐——`GET /api/projects/:id/branch-alignment` + `POST /batch-checkout` + `POST /batch-pull`，实现已在 `dfe8e6d` 落地，文档追认 |
| 2026-08-24 | 新增 R26：仓库级构建流水线与 package.json 版本源 —— 双格式 `X.Y.Z` / `VYYMMDDHHmm`；仓库流水线 `versionSource`（derived/packageJson）+ `packageManager` + `installCommand`（frozen 默认/skip）+ `preBuildCommand` + `buildTimeoutMs` + `versionSyncCommit`（package/none，受控提交仅 package.json+锁文件）；项目级 `repoVersionFormat` + `manifestTarget` 自动落盘；无 package.json 降级派生；详见 `docs/r26-build-pipeline.md` |
| 2026-08-24 | 裁决 DOC2：writeVersionFile 三方矛盾——以引擎实际行为为准：默认写入 `version.json`，可通过 `writeVersionFile=false` 关闭；`types.ts:62` 注释目标态与 `repo-policy.ts` 旧头注已废止，R26 接线后 `repo-policy.ts` 转正 |
| 2026-08-24 | 新增 R29：发布 webhook 通知——`AppConfig.notifications.webhooks[]`（`{id,url,events:('done'\|'error')[],enabled}`），url https 校验（本地回环 http 放行）、events 白名单，发布 done/error 时逐条 POST `{event,projectId,version,failedRepos,timestamp}`，5s 超时重试 1 次，失败记 structuredLog 不影响发布 |
| 2026-08-24 | 新增 R27：external 日志分发至 GitHub/Gitee Release——双轨日志卖点但 external 无处安放，tag 已打好，Release API 顺手。①core 新增 `release/` 模块用 `node:https` 实现 GitHub `POST /repos/{owner}/{repo}/releases` 与 Gitee 等价 API（`tag_name`+`name`+`body`），token 从 `credentials.json` 取（`releaseTokens[provider]` / `releaseTokens`），remote URL 解析 owner/repo 复用现有 git 能力；②server 路由 `POST /api/releases/:id/publish-note` `body{repoId,provider,body}` 幂等：已存在同名 release 则 PATCH body；③web 发布完成页与发布历史行加操作组——复制 Markdown / 导出 .md/.html / 同步到 Release（provider 下拉），离线禁用并提示；④文档同步 `api.md`/`architecture.md`/`data-model.md`/`README`。详见 `docs/optimization-plan.md` N1 |
| 2026-08-24 | 新增 R28：快速发布通道——types `ProjectDef.lastQuickPublish?:{repoIds,bump,skipBuild,offline,backupSource,backupArtifacts}`（`// 扩展：`），发布成功时 withCfg 原子化快照；ProjectDetail/向导提供“快速发布”入口（`?mode=quick`），预填上次配置+检测→版本→日志→dry-run→执行，门禁（dry-run+双轨 confirmed）仍强制，向导保留为详细模式；连续两次 patch 第二次≤5 步。详见 `docs/optimization-plan.md` N2 |
| 2026-08-24 | 新增 R30：prerelease 灰度支持（N3 子 PR① 契约层）——裁决采用 `prerelease?: string` 可选字段承载 `beta`/`rc` 等标识（形如 `beta.1`/`rc.1`），而非扩展 `BumpType` 为 `prepatch/preminor/premajor`；原因：`prerelease?: string` 更灵活、兼容既有 `major/minor/patch` 语义与 `suggestBump` 等调用处，支持任意标识与递增（`beta.1→beta.2`），零侵入既有发布链路。契约变更（经本条批准）：`BumpType` 保持 `major\|minor\|patch` 不变；`PublishRequest`/`PublishPlan`/`PlannedRepo`/`ReleaseRecord`/`RepoReleaseRef` 新增可选 `prerelease?: string`（`// 扩展：R30`）；版本正则 `SEMVER_RE`/`HYBRID_VERSION_RE` 扩展 `vX.Y.Z-beta.N` 形态（`-(alpha|beta|rc...).N`）并统一 `build` 段为 `\d{6,12}`（修正 `SEMVER_RE \d{6,10}` 与 `HYBRID \d{8,10}` 口径不一致），新增 `SEMVER_PRERELEASE_RE`/`PRERELEASE_RE`；core 版本计算/标签形态/UI 为后续子 PR②③。详见 `docs/optimization-plan.md` N3 |
| 2026-08-24 | R30 子 PR② 版本引擎落地：`packages/shared/src/constants.ts` 新增 `PRERELEASE_RE`/`SEMVER_PRERELEASE_RE`，`SEMVER_RE`/`HYBRID_VERSION_RE` 按 PR① 口径扩展；`packages/core/src/version.ts` 新增 `isValidPrerelease`/`resolvePrerelease`（同前缀 `beta.1→beta.2`，`beta→beta.2` 归一，异前缀覆盖）、`comparePrerelease`、更新 `bumpSemver(v,bump,prerelease?)`/`hybridVersion`/`formatRepoVersion`/`parseSemver` 透传 prerelease，排序引入 prerelease（`beta < 正式版`）；`packages/core/src/engine.ts` `planPublish` 校验 `PRERELEASE_RE`、按 `resolvePrerelease(prevPre,requested)` 递增、`bumpSemver` 带 prerelease、里程碑 `vX.Y.Z-beta.N`（`X.Y.Z` 的 `core-prerelease` 亦然）、`PlannedRepo`/`syncedOnly`/`ReleaseRecord`/`RepoReleaseRef` 快照 prerelease；`preflight`/`store` 适配；`pnpm typecheck` 通过 |
| 2026-08-24 | R30 子 PR③ 向导 UI 落地：`apps/web/src/components/wizard/StepVersion.vue` 新增版本类型选择器（正式版/Beta/RC/自定义，`NRadioGroup` + `NInput` 校验 `PRERELEASE_RE`、`prereleaseError`、400ms 防抖 `rePlan`）、实时预览（本地 `SEMVER_PRERELEASE_RE_LOCAL` 解析与 `resolvePrereleaseLocal`/`bumpSemverLocal`，展示 `previewVersion`/`milestonePreview`/`buildTagPreview` 及链路说明 `v1.2.0-beta.1→v1.2.0-beta.2`），`apps/web/src/stores/publish.ts` 新增 `prerelease` 状态并透传 `planPublish`/`publish`，`apps/server/src/api/publish.ts` 接收校验、联调 `?step=` URL 与日志重置确认保持；验收：同标识递增、异标识覆盖、正式版回退均经向导与 dry-run 验证 |
| 2026-08-25 | M5-08 落地：首次使用引导（四步：欢迎 → 令牌保护 → 建项目/接仓库 → 首次发布；空项目首启自动弹出、侧栏/命令面板可重看、完成标记 localStorage） |
| 2026-08-25 | R26 补充裁决（无工程化仓库适配）：原生 html/js/jquery 等无 package.json 的仓库为合法一等公民——版本走派生模式（derived），install/build 仅在显式配置命令时执行（自动探测本来就跳过）；versionSource=packageJson 时维持既有降级语义；shared RepoStatus 扩展可选字段 repoKind（nodejs/static）供 UI 提示；静态仓库显式配置了流水线命令时 plan 阶段给 warning |
| 2026-08-25 | M7 收口裁决：恢复冲突策略落地为「空目录（默认）/ overwrite 覆盖同名文件」两档，source-bundle（git clone）恒要求空目录；每次成功恢复追加 restores 审计记录入数据仓库；/api/health 透出 home 供前端拼白名单内默认路径 |
| 2026-08-26 | M11 收口第一段（doctor 内核化）：core/doctor.ts（零依赖纯函数 + runWithPool 6 仓并行 + 复用 core/git 封装）→ GET /api/ops/doctor 同源端点 → scripts/doctor.mjs CLI 改调 core、保留原行为并新增 --json 结构化输出与退出码（error=2/ok=0）；8 个单测覆盖空/路径缺失/非 git/正常/ahead/force-push/从未发布/项目筛选/packageJson；core 测试 135→143 绿 |
| 2026-08-26 | M11(失败结构化恢复)第一段后端落地：shared 扩展 FailedRepoReport + PublishEvent.code/detail；core engine 失败时落结构化 failedReports（含 code/head/target/tag/tagTarget/suggestions） + rollbackFailedPublish（仅删自产 build 标签 + 标 deprecate release + 写 R24 审计 + commitRecords）；errors 增 PREFLIGHT_FAILED/BUILD_FAILED/INSTALL_FAILED/PRE_BUILD_FAILED/PUSH_FAILED；server /api/publish/:taskId/failure（结构化失败诊断）+ /rollback；web store 透 failedReports + api 暴露 publishFailure/publishRollback；core 单测 143→145 全过；e2e 三场景全过；typecheck/build 全绿；UI 失败卡片放到下一段 |
| 2026-08-26 | M11 UI 段：FailureRecoveryCard.vue（失败头卡 + 错误码 chip + 结构化诊断面板：head/target/tag/tagSource + 恢复建议 + 三出路按钮（改用下一版本号重试 / 接管续跑 / 回滚）+ 诊断包导出真实 Blob）；StepResult.vue 集成；ReleaseWizard retry-bump/resume handlers；api publishFailure/publishRollback 暴露；e2e 三场景全过；typecheck/build 全绿 |
| 2026-08-26 | M12 运维中心落地：core 补 export resolveHome；server /api/ops/process（自举版本/内存 RSS/uptime/BX_HOME/nodeVersion/platform/startedAt）+ /api/ops/logs（30 天滚动 JSON 行按 level 过滤，最多 500 行倒序）；web OpsCenter.vue 4 卡（一致性体检/数据迁移/引擎日志流/关于 bxverse）+ /ops 路由 + 30s 自动刷新 + doctor.md 报告导出；core 测试 145 全过；typecheck/build 全绿；e2e 三场景全过 |
| 2026-08-26 | M13 驾驶舱增强：server /api/overview/weekly（近 8 周发布次数 + 跨项目数，按 ISO 周分组，0 周也展示空柱）；web Dashboard 新增发布节奏柱状图（svg 8 柱 + 峰值提示 + 跨项目聚合统计）+ 分支巡检入口（首个项目跳转 + OpsCenter 入口）；typecheck/build 全绿；e2e 三场景全过 |
| 2026-08-26 | M14 命令面板增强完成：fuzzy 匹配（连续命中加权 + 短查询优先 + 关键词/标题双轨排序）+ WIG a11y（aria-label 描述总项数 + listbox role + 空态 role=status + 计数条）；e2e 用 placeholder 选择器兼容动态 aria-label；typecheck/build 全绿；e2e 三场景全过；core 测试 145 全过；Phase 2 序号 1-5 全部完成 |
| 2026-08-26 | Phase 3 自举分发：cli 启用看门狗模式（bx-manager start --watchdog，崩溃 3s 自动拉起，Ctrl+C 不重拉）+ 新增 bx-manager update（拉 npm registry 比对最新版本，零依赖）；scripts/release.mjs 零依赖发版脚本（聚合 .changeset/*.md → 自动 bump 所有 package.json + 写 CHANGELOG.md，--dry-run 预览）；.changeset/README.md 说明格式与人审门禁；core 测试 145 / typecheck / build / e2e 三场景全过 |
| 2026-08-26 | Phase 3 自举分发阶段 2 收口：根 README 增「bx-manager（CLI 薄壳）」「自举 release」两节；development.md 增 §11 自举 release 协议（type 三档 + 工作流 4 步 + 零依赖说明）；core 测试 145 / typecheck / build / e2e 三场景全过；Phase 3 序号 1-3 全部完成 |
| 2026-08-27 | v1.0.0 tag 落地（首次 major）：docs/v1-checklist.md 8 节验收清单全部通过（typecheck/build/core 145 测试/e2e 三场景）；scripts/release.mjs 零依赖跑通 0.1.0→1.0.0（6 个 package.json + CHANGELOG.md + git tag v1.0.0）；API 契约双冻结（shared/types.ts + shared/constants.ts），后续走 1.x 维护路径 |
| 2026-08-27 | 方向 B·F2 裁决落地：PublishRequest 缺省值 = false（构建默认执行、标签默认推送、备份默认开启），server validateRequest 全部改为显式 === true；dry-run 错误分类的中文嗅探加 TODO(A1) 注释指向 CoreError 统一错误体系；新增 3 条 server 契约测试（A 不传字段/B 显式 true/C 显式 false 与缺省等价）全过（server 40 测试 / typecheck 0 error / e2e 三场景） |
| 2026-08-27 | 方向 B·A1 收口：CoreError 统一错误体系 + statusForCode 映射表 + sendError 序列化 + 结构化日志带 coreCode；新增 apps/server/test/core-error.test.ts（16 映射表单测 + 4 序列化单测 = 20 测试）；server 40→60 测试；core 145 / typecheck 0 error / build / e2e 三场景全过；verification: grep 无 includes(仓库) 类嗅探（仅注释里保留 A1 任务描述） |
