# bxverse · BX 版本管理台

项目/仓库两级版本与更新日志统一管理工具：本地 Web 管理台（127.0.0.1），可选 PWA 安装，pnpm monorepo。

需求依据见 [docs/requirements.md](docs/requirements.md)。

## 结构

```
apps/
  web/      Vue3 + Vite + Naive UI + UnoCSS + Pinia + PWA（前端管理台）
  server/   Node http API + SSE + 静态托管（本地服务）
  cli/      bx-manager 命令薄壳
packages/
  shared/   共享类型与常量（TypeScript）
  core/     核心引擎：git / 版本 / 日志流水线 / 发布编排（零依赖）
docs/
  requirements.md   原始需求文档
```

## 开发

```bash
pnpm install
pnpm build:packages   # 先构建 shared/core（或 pnpm build）
pnpm dev              # 同时启动 server(:8899) 与 web(:5173)
```

- 生产形态：`pnpm build` 后 `pnpm start`，浏览器访问 http://127.0.0.1:8899
- 数据目录：`~/.bxverse/`（可用环境变量 `BX_HOME` 覆盖）
