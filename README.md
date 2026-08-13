# bxverse · BX 版本管理台

项目/仓库两级版本与更新日志统一管理工具：本地 Web 管理台（127.0.0.1），可选 PWA 安装，pnpm monorepo。

需求依据见 [docs/requirements.md](docs/requirements.md)。

## 功能特性

- 项目/仓库两级版本与双轨更新日志（对内全量 / 对外分节）统一管理，发布数据存于 git 数据仓库（历史即审计）
- 发布向导六步（检测→版本→日志确认→预览→执行→完成）+ 提交级排除（人工甄别哪些提交进版本）
- R19 备份与一致性对比：每次发布自动备份源码/产物（bundle + 快照 + 产物归档），备份列表/下载/校验/删除，两次发布的产物与源码对比 + 校验报告导出
- 版本清单导出三种方式：另存为文件 / 写入项目仓库（树选目录）/ 导出到本地目录（原生选择器），另附直接预览
- 本地服务状态 chip：连接检测（checking/connected/unavailable）+ 30s 轮询 + 点击重试
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
