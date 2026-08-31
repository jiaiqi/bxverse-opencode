# bxverse · BX 版本管理台

项目/仓库两级版本与更新日志统一管理工具：本地 Web 管理台（127.0.0.1），可选 PWA 安装，pnpm monorepo。

需求依据见 [docs/requirements.md](docs/requirements.md)。

## 功能特性

> R26：仓库级构建流水线（versionSource/packageManager/installCommand/preBuildCommand/buildTimeoutMs/versionSyncCommit）+ 双格式 X.Y.Z/VYYMMDDHHmm + manifestTarget 自动落盘（`docs/r26-build-pipeline.md`）

- 项目/仓库两级版本与双轨更新日志（对内全量 / 对外分节）统一管理，发布数据存于 git 数据仓库（历史即审计）
- 发布向导六步（检测→版本→日志确认→预览→执行→完成）+ 提交级排除（人工甄别哪些提交进版本） + R28 快速发布通道（复用上次配置，≤5 步完成周度 patch，`?mode=quick` 预填，门禁仍强制；详细模式保留）
- R27 external 分发闭环：发布完成页与发布历史行一键复制 Markdown / 导出 .md/.html / 同步 external 日志至 GitHub/Gitee Release（`tag_name`+`name`+`body`，同 tag 幂等 PATCH，token 隔离存储，离线禁用提示）
- R19 备份与一致性对比：发布时可备份源码/产物（bundle + 快照 + 产物归档；向导开关，默认关闭），备份列表/下载/校验/删除，两次发布的产物与源码对比 + 校验报告导出；**恢复向导**（M7）：BX_HOME 白名单默认路径、快照/产物覆盖同名文件开关、版本号二次确认、恢复记录入审计（已恢复 ×N）
- 版本清单导出三种方式：另存为文件 / 写入项目仓库（树选目录）/ 导出到本地目录（原生选择器），另附直接预览；版本号格式可选「完整 / 仅日期（V+8 位时间戳）」，默认文件名 version.json
- AI 多供应商体系（R21）：支持 DeepSeek / OpenAI / Ollama / Kimi coding plan / 小米 MiMo / MiniMax / 自定义等 OpenAI 兼容供应商，多供应商自由切换；API Key 安全隔离存储于本机 credentials（write-only，API 与 UI 永不回显明文），一键连通性测试；对外日志一键润色面向用户友好草稿（仍须人工核对确认）
- 仓库内 Git 面板与 AI 助手（R22）：仓库详情新增 Git tab，实时展示分支、HEAD、ahead/behind 读数；变动文件清单清晰区分「已暂存 / 未暂存 / 未追踪」；支持单文件与一键全部暂存/撤销暂存；单文件 Diff 侧栏查看 + AI 变更解读（意图/关键变更/风险评估）；Conventional Commits 提交弹窗支持 AI 自动推断并生成规范标题与说明 + 手工确认提交；拉取（--ff-only 安全快进）与推送联动
- 发布向导容错：仓库状态检测失败显式报错（不误判「已同步」）+ 刷新/重进可接管进行中的发布任务查看实时进度 + 未保存日志站内离开二次确认
- PWA 运行时开关：按设置页开关动态注册/注销 Service Worker（真正可用的安装体验）
- 本地服务状态 chip：连接检测（checking/connected/unavailable）+ 30s 轮询 + 点击重试
- 双主题风格（R20/R21）：Indigo 精密仪器套件（翠绿主色、等宽版本读数、细网格背景、亮/暗/跟随系统）+ WenXi 深色玻璃拟态套件（玻璃卡片，仅深色），设置页一键切换即时预览
- 精密仪器视觉语言（R21）：版本号徽章（等宽 tabular + 发光左缘）、统计卡读数风、发布行左缘指示条、按压反馈（按钮/卡片 :active 缩放）、emil 动效曲线、全键盘可达（卡片 role=link + 焦点环）
- 顶栏（R20）：页标题、命令面板搜索（Ctrl+K）、服务状态、主题切换、同步数据、新建项目
- 首次使用引导（M5-08）：空项目首次启动自动弹出四步引导（欢迎 → 令牌保护 → 建项目/接仓库 → 首次发布），侧栏与命令面板（搜"引导"）可重看；适配无工程化仓库（原生 html/js/jquery 无 package.json：版本走派生模式，install/build 自动跳过，RepoDetail 流水线区有静态仓库提示）
- 可选 PWA 安装、亮/暗主题、Ctrl+K 命令面板

## 结构

```
apps/
  web/      Vue3 + Vite + Naive UI + UnoCSS + Pinia + PWA（前端管理台）
  server/   Node http API + SSE + 静态托管（本地服务）
  cli/      bx-manager 命令薄壳
packages/
  shared/   共享类型与常量（TypeScript）
  core/     核心引擎：git / 版本 / 日志流水线 / 发布编排 / 备份与对比（零依赖）
scripts/
  seed.mjs             演示数据种子（需服务已启动）
  gen-pwa-icons.cjs    PWA 图标生成（零依赖）
e2e/
  prepare-fixture.mjs + wizard-flow.py   发布向导六步端到端（Playwright）
  resume.mjs           中断续跑演练
  onboarding.py        首次使用引导（M5-08，空 BX_HOME 自动弹出 + 重看）
  run.mjs              三场景统一编排（pnpm test:e2e）
docs/
  requirements.md   原始需求文档
```

## 开发

```bash
pnpm install
pnpm build:packages   # 先构建 shared/core（或 pnpm build）
pnpm dev              # 同时启动 server(:8899) 与 web(:5173)
pnpm seed             # 造演示数据（需先启动服务）
pnpm icons            # 生成 PWA 图标
```

- 生产形态：`pnpm build` 后 `pnpm start`，浏览器访问 http://127.0.0.1:8899
- 数据目录：`~/.bxverse/`（可用环境变量 `BX_HOME` 覆盖）

## 当前状态

- **版本**：v1.0.1（2026-08-29 锁版，1.x 维护期）—— R1–R30 全实现 / M1–M8 全收口 / 235 单元测试 + 3 e2e 场景 + 65 原型回归全绿
- **变更日志**：[CHANGELOG.md](CHANGELOG.md)（v1.0.0 / v1.0.1 已发布）
- **下一阶段规划**：[docs/next-development-plan.md](docs/next-development-plan.md)（v1.x 维护 + 后续候选）

## 测试

```bash
pnpm typecheck                       # 5 包 tsc --noEmit / vue-tsc --noEmit
pnpm test                            # core 157 + server 78 单测（vitest）
pnpm build                           # 5 包链构建（shared → core → server → cli → web，web ~40s）
pnpm test:e2e                        # 三场景端到端：wizard-flow / resume / onboarding
python design/.diag-tmp/_regress5.py # 原型 v2.0 68 断言回归（wenxi/indigo 主题切换 + 命令面板 + 4 类语义色）
```

## 原型资产（设计/参考）

`design/bxverse-ultimate-cockpit.html` 是单文件 Vue 3 + Tailwind CDN 原型，作为「终极形态」的设计/交互基线；git 跟踪 doc，但 `.html` 与 `.diag-tmp/` 在 `.gitignore` 中（设计资产不污染仓库）。当前迭代到 v2.0 第六轮（A1 count-up / A2 noise+glass / A3 主题切换 / B 命令面板 / D 主题化 / E 4 类语义色 / F 紫色 R30）。

## bx-manager（CLI 薄壳）

`apps/cli` 是 bxverse 的命令行入口，已发布到 npm 时安装即用：

```bash
pnpm i -g bxverse   # 全局安装后即可使用 bx-manager

bx-manager start [--port 8899] [--no-open] [--watchdog]   # 启动管理台（生产，--watchdog 启用 3s 自动拉起）
bx-manager dev   [--port 8899] [--no-open]                # 开发模式（tsx watch）
bx-manager data-dir                                        # 打印 BX_HOME
bx-manager status [--port 8899]                           # 查看运行状态（健康检查）
bx-manager update                                          # 检查 npm registry 最新版本
```

> 看门狗（`--watchdog`）在服务崩溃（非 0 退出）后 3s 自动拉起，Ctrl+C / SIGTERM 主动停服不重拉。

## 自举 release（bxverse 自身的发版流程）

bxverse 自身也用自家的 changeset 机制发版（dogfooding）—— **零依赖**、**不引入** changesets / release-it 等库，全部由 `scripts/release.mjs` + `.changeset/*.md` 承担。

三步发版：

```bash
# 1. 改代码 + 在 .changeset/ 写一条变更记录（YAML frontmatter + Markdown body）
cat > .changeset/feat-xxx.md <<'EOF'
---
type: minor
---

描述这一轮的变更（用户可读，一行 80 字内最佳）
EOF

# 2. 预览发版（不改任何文件，只打印新版本 + 涉及 package）
pnpm release:dry

# 3. 正式发版：自动 bump 所有 package.json + 写 CHANGELOG.md
pnpm release

# 4. 人工 review 后 git 提交 + 删除已消费的 .changeset/*.md
git add -A && git commit -m "release: vX.Y.Z"
rm .changeset/feat-xxx.md   # 避免下次重复发布
```

`type: major | minor | patch` 三档；多文件混用时取最大（major > minor > patch）。脚本不自动 git commit / npm publish，**人审为终**——与产品发布同源哲学。

完整协议与示例见 `.changeset/README.md`。
