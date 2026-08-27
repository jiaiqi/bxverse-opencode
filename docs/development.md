# bxverse 开发规范与工作流（development.md）

> 文档版本：v0.1（2026-08-13）
> 依据：`docs/requirements.md`、`docs/architecture.md`、`docs/frontend.md`、根 `package.json`、`pnpm-workspace.yaml`、`packages/shared/src/types.ts` 与 `constants.ts`。
> 读者：全部开发 agent 与维护者。本文是**强制规范**：质量门禁未通过不得提交/交付。

---

## 1. 环境要求

| 项 | 要求 | 验证命令 |
|---|---|---|
| Node.js | ≥ 20（根 `engines.node`） | `node -v` |
| pnpm | 10.x（`packageManager: pnpm@10.32.1`，用 corepack 对齐版本） | `pnpm -v` |
| git | ≥ 2.30（引擎依赖 `spawn('git', ...)`） | `git --version` |
| 系统 | Windows 10/11 为第一开发平台（macOS/Linux 需兼容，见 §8 路径规范） | — |
| 浏览器 | Chromium 内核现代版（管理台唯一目标客户端） | — |

## 2. 初始化步骤

```powershell
# 1. 克隆（若已克隆跳过）
git clone <仓库地址> bxverse
Set-Location bxverse

# 2. 对齐 pnpm 10.x（已装 pnpm 10 可跳过）
corepack enable

# 3. 安装依赖（onlyBuiltDependencies 白名单已内置 esbuild/vue-demi）
pnpm install

# 4. 启动开发环境（server :8899 + Vite :5173，concurrently 双窗口）
pnpm dev
# 浏览器访问 http://127.0.0.1:5173（Vite 代理 /api → 8899，SSE 直通）
```

首次访问流程：前端 `appStore.bootstrap()` 未持 token → `GET /api/auth/init` 获取会话 token 存 `sessionStorage` → 加载 `AppConfig`（缺失时 server 写默认值，端口 `APP_DEFAULT_PORT=8899`）。

## 3. 常用命令表

| 命令 | 行为 | 说明 |
|---|---|---|
| `pnpm dev` | 并行启动 server(8899, watch) 与 web(5173, Vite dev) | 日常开发入口；server watch 工具统一用 `tsx watch` |
| `pnpm build` | 顺序构建 shared → core → server → cli → web | web 产物 `apps/web/dist` 供 server 生产托管；交付前必跑 |
| `pnpm typecheck` | `pnpm -r typecheck`，全包 `tsc --noEmit` | 质量门禁第一道 |
| `pnpm test（`pnpm -r test`，core 84 + server 27）` | 仅 `@bxverse/core` 测试（vitest） | web 无单测任务时以手动页面清单代替（§7） |
| `pnpm start` | 生产启动 server（需先 build） | 验证生产形态：静态托管 + SPA fallback |
| `pnpm --filter @bxverse/web dev` | 仅前端热更 | 后端不涉及改动时使用 |
| `pnpm --filter @bxverse/core test` | 仅 core 测试 | 引擎改动快速反馈 |
| `pnpm seed` | 创建演示项目 + 3 个本地 fixture 仓库（web-front / api-service / mp-weixin） | **需服务已启动**（`pnpm dev` 或 `pnpm start`）；可选 `--port 8899` / `--project 演示项目` |
| `pnpm icons` | 生成 PWA 图标到 `apps/web/public/`（pwa-192/512、maskable-512.png） | 零依赖手写 PNG 编码器（crc32+zlib）；图标资源变更后重跑 |

**端到端测试（e2e/）**：先装依赖 `pip install playwright` + `playwright install chromium`（详见 `e2e/README.md`）；三个脚本：

| 脚本 | 用途 | 运行方式 |
|---|---|---|
| `e2e/prepare-fixture.mjs` | 造 fixture 项目/仓库 | `BX_PORT=18899` 启动 server 后执行 |
| `e2e/wizard-flow.py` | 发布向导六步全流程（检测→版本→双轨日志确认→预览→SSE 执行→完成） | prepare 之后依次执行 |
| `e2e/resume.mjs` | 中断续跑演练：执行中 kill server → 重启 → 重新发起 → 幂等续跑不重复打标签 | 自管理 server 生命周期，直接 `node e2e/resume.mjs`（`BX_PORT=18898`） |

e2e 用独立 `BX_HOME` 与端口（18899/18898）隔离，不触碰真实数据；运行前确保端口未被占用，截图输出至 `%TEMP%\opencode\bxverse-shots\`。

## 4. 目录约定（新增文件放置规则）

```
apps/web/
├── index.html / vite.config.ts / uno.config.ts / tsconfig.json
├── public/                  # 静态资源（PWA 图标等；业务图标禁止放这里）
└── src/
    ├── main.ts              # createApp + pinia + router + naive + uno.css（禁止加业务逻辑）
    ├── App.vue              # 布局壳：Provider/主题/命令面板挂载/路由出口
    ├── env.d.ts             # 全局类型声明
    ├── api/                 # http.ts（fetch 封装/SSE）+ index.ts（全部资源函数）
    ├── stores/              # app.ts / projects.ts / repos.ts / releaseWizard.ts
    ├── router/index.ts      # 路由表 + 守卫
    ├── views/               # Dashboard / ProjectDetail / RepoDetail / ReleaseWizard / Settings / NotFound
    ├── components/          # 公共组件（frontend.md §4 清单；页面私有组件放 views/{Page}/ 下）
    ├── composables/         # useCommands.ts 等可复用逻辑（useXxx 命名）
    ├── utils/               # diff.ts、format.ts 等纯函数（禁止 import vue）
    ├── constants/icons.ts   # CommitType→i-carbon-* 图标映射（前端私有常量）
    ├── styles/              # tokens.css（唯一色板来源）、markdown.css、base.css
    ├── pwa/register.ts      # 运行时 SW 注册/注销（§frontend 10）
    └── theme.ts             # Naive UI themeOverrides（引用 var(--bx-*)）
```

| 规则 | 内容 |
|---|---|
| shared 包 | 已定稿。**新增/修改字段必须先在 `docs/data-model.md` 备案**，禁止私自加字段 |
| core 包 | 按模块分目录（git/version/logs/publish/store/detect/ai），模块内 index.ts 为唯一对外出口 |
| server 包 | 业务逻辑必须下沉 core；api 目录每个文件对应一个资源；路由注册集中在 http/router.ts |
| 公共组件 vs 页面私有 | 被 ≥2 个页面使用才放 `components/`；页面私有组件放 `views/{Page}/components/` |
| 禁止 | 根目录、docs 下放代码；包间相对路径 `../../` 引用 shared（必须走 `@bxverse/shared`） |

## 5. 命名约定

| 对象 | 规则 | 示例 |
|---|---|---|
| .vue 文件 | PascalCase | `ProjectDetail.vue`、`AddRepoDialog.vue` |
| 目录 / 普通模块 | kebab-case | `release-wizard/`、`use-commands.ts`（composable 例外见下） |
| composable | useXxx 命名 | `useCommands` |
| store 文件 / id | camelCase | `releaseWizard.ts` / `useReleaseWizardStore` |
| 组件 | PascalCase 多词（单词禁止，避免与 HTML 冲突） | `StatusBadge` |
| 变量 / 函数 | camelCase | `selectedRepoIds`、`loadPlan` |
| 类型 / 接口 | PascalCase，跨包共享类型直接引用 shared | `RepoStatus`（禁止本地重定义） |
| 常量 | UPPER_SNAKE | `TOKEN_KEY`（shared 的用 `COMMIT_TYPE_LABELS` 等） |
| props | camelCase；emits | kebab-case（`update:show` 除外） |
| 路由 | name camelCase；path kebab | `project-detail`、`/project/:id` |
| API 函数 | 动词 + 资源 | `getOverview`、`planPublish`、`addRepo` |
| git 分支 | `feat/主题-短横线`、`fix/主题` | `feat/web-wizard` |

## 6. 编码规范（强制）

1. **TypeScript**：全包 `strict: true`；`tsconfig.base.json` 为基线，各包只增不改。**禁止 `any`**；例外清单（必须加注释说明原因）：
   - `JSON.parse` 结果（先断言 `unknown` 再类型守卫收窄）；
   - `PublishEvent.data`（`unknown`，消费处按 `type` 收窄）；
   - 第三方回调参数无类型定义时（用最小化 `as` 转换替代）。
2. **组件**：必须 `<script setup lang="ts">` + Composition API；`defineProps`/`defineEmits` 全类型化；`withDefaults` 提供默认值；禁止 Options API（项目无历史包袱，R15）。
3. **图标**：必须 UnoCSS `presetIcons` 类名（`i-carbon-*`）；**禁止** 图片图标、emoji、内联 SVG 文件；图标类名静态完整拼写，禁止字符串拼接。
4. **常量**：禁止硬编码魔法字符串——`APP_NAME`/`APP_DEFAULT_PORT`、`COMMIT_TYPE_LABELS`/`COMMIT_TYPES`/`EXTERNAL_SECTIONS`/`DEFAULT_EXTERNAL_EXCLUDE` 一律 import `@bxverse/shared`；API 路径字面量只允许出现在 `api/index.ts`；前端私有常量（图标映射等）放 `constants/icons.ts`。
5. **字段名**：任何与后端交换的数据，字段名必须与 `types.ts` 一字不差；禁止本地别名污染 payload。
6. **样式**：UnoCSS 原子类优先；颜色只允许 `brand/bg/surface/border/text/success/warning/error/info` 体系（frontend.md §1.8），禁止裸 hex；scoped CSS 仅限 markdown 渲染与 highlight 主题。
7. **异步**：统一 `async/await`；请求失败必须处理（toast/错误态），禁止静默 catch；组件卸载前取消 SSE 订阅（`onUnmounted`）。
8. **依赖**：web 包禁止新增运行时依赖清单外的库；新增依赖需在 PR 描述说明理由（锁定栈见 requirements 澄清结论）。
9. **WIG 合规约定**（frontend.md §12）：装饰图标 `aria-hidden`；icon-only 按钮 `aria-label`；树/行 `role`+`tabindex`+键盘；站内导航必须 RouterLink；transition 显式属性（禁 `transition-all`）；日期必须 Intl；placeholder 以 `…` 结尾；路径类输入 `autocomplete="off" + spellcheck="false"`。
10. **URL 状态同步**：需要「刷新/分享可恢复」的界面状态（RepoDetail `?tab=`、发布向导 `?step=`）必须双向同步 URL query：初始化读 query 校验，变化 `router.replace` 写回；禁止只存内存 store。
11. **构建顺序与生成物**：web 构建 = `vite build && vue-tsc --noEmit`（vite 先产出 dist，vue-tsc 后做类型门禁）；`auto-imports.d.ts` / `components.d.ts` 由 unplugin 自动生成，应入库（不要 gitignore），保证 clone 后 vue-tsc 可直接通过。

## 7. 质量门禁（每个任务完成必须全绿）

| 门禁 | 命令 | 通过标准 |
|---|---|---|
| 类型检查 | `pnpm typecheck` | 全包 0 error |
| 构建 | `pnpm build` | 五包顺序构建成功，`apps/web/dist` 产出 |
| 单元测试 | `pnpm test（`pnpm -r test`，core 84 + server 27）` | core 测试全过（引擎改动必须补测试） |
| 前端手动清单 | 浏览器过一遍受影响页面 | 见下 |

**前端手动验收清单**（每次前端改动勾选受影响项）：

- [ ] 总览加载/空态/变动仓库面板
- [ ] 项目详情：仓库卡片状态徽标、AddRepoDialog 两种接入
- [ ] 仓库详情：文件树懒加载（含 truncated 提示）、文件查看（binary/truncated/copy）
- [ ] 发布向导：六步走通（plan → 编辑日志 → confirm → dry-run → 执行 → done）；步骤回退数据保留
- [ ] 日志编辑器：auto→edited→confirmed 流转、草稿对比、模板插入、未确认拦截执行
- [ ] 设置页：保存/409 提示/PWA 开关/令牌轮换
- [ ] 主题：亮/暗/system 三态切换，UnoCSS 与 Naive UI 一致（抽查卡片/按钮/表格）
- [ ] 键盘：Ctrl+K 面板、Esc、树导航、焦点环
- [ ] 断网/杀 server 进程：toast 与重试路径
- [ ] 生产验证：`pnpm build && pnpm start`，直接访问 8899（非 Vite 代理）

## 8. 常见坑（必读）

1. **Windows 路径处理**：一切路径用 `node:path`（`path.join/resolve`）；仓库内相对路径统一 `path.posix` 或手动 `/` 分隔（文件树 `path` 参数是 git 风格正斜杠）；禁止手拼 `'\\'` 字符串；展示层绝对路径仅展示、不回传。
2. **execFileSync / spawn 参数防转义**：git 调用一律 `spawn('git', args)`，参数**数组**传参，禁止 shell 字符串拼接（防空格路径与注入）；`shell: false` 默认；Windows 下 `.cmd` 命令用 `shell: true` 或直接调用可执行文件。
3. **pnpm onlyBuiltDependencies**：根 `package.json` 已白名单 `esbuild`、`vue-demi`；新增原生/构建期依赖时同步补白名单，否则 `pnpm install` 会跳过 postinstall 导致构建报错。
4. **Naive UI 与 UnoCSS 主题一致性**：色板唯一来源是 `styles/tokens.css` 的 `--bx-*` 变量；themeOverrides 与 uno.config 均引用变量（frontend.md §1.7/§1.8）。改色必须改 tokens.css 一处；新增组件样式先查「该色是否有 token」。暗色切换 = `html.dark` class + NConfigProvider theme 同时切换，漏一个即花屏。
5. **SSE 断线重连**：EventSource 带不了 `X-BX-Token` → 必须 fetch + ReadableStream 实现；重连 3s 指数退避（上限 10s）；`done` 事件后主动 close；组件卸载 abort；server 每 15s 心跳 `: ping` 客户端必须忽略。
6. **markdown-it 安全**：`html: false`（日志内容可能含仓库提交中的 HTML 片段）；highlight.js 只注册白名单语言（js/ts/vue/json/bash/css/md），控制包体。
7. **PWA 注册时序**：`injectRegister: false`，注册入口在 `pwa/register.ts`，由 `appStore.bootstrap()` 读 `config.pwa.enabled` 后动态 import；**dev 不注册**；`/api` 永不缓存（workbox navigateFallbackDenylist）。
8. **Vite 代理**：`/api` 与 `/api/publish/stream` 都走同一 proxy（SSE 走 HTTP 长连接，不要配 `ws: true`）。
9. **自动按需导入**：Naive UI 组件与 API（`useMessage` 等）依赖 `unplugin-auto-import` + `unplugin-vue-components`（NaiveUiResolver）；UnoCSS 类名必须静态拼写（动态拼接的 `i-carbon-${name}` 不会生成图标）。
10. **sessionStorage token**：token 只走 `X-BX-Token` 头（architecture §5.2）；页面刷新后 `bootstrap()` 自动续；401 的兜底是 `/api/auth/init` 重新引导，禁止把 token 写 localStorage 或 Cookie。
11. **并发会话 / 多实例端口冲突**：server 默认监听 `127.0.0.1:8899`；并行任务、e2e、多实例同时启动会撞端口（`EADDRINUSE` → server 打印错误并退出）。启动前先检测端口占用；被占用时用 `BX_PORT` 换端口（server 启动错误信息会提示）；e2e 固定用 18899/18898 隔离。
12. **server 代码改动必须重启**：路由/API/引擎均在 server 进程启动时加载，改 server 代码后 watch 不覆盖生效；验证前务必重启 server 进程（kill 旧进程或重开 `pnpm dev`），否则跑的是旧路由。`pnpm seed` 也依赖运行中的服务。

## 9. git 提交规范

```
<type>(<scope>): <subject>

[body]

[footer]
```

| type | 用途 | scope 取值 |
|---|---|---|
| feat | 新功能 | web / server / core / shared / cli / repo |
| fix | 缺陷修复 | 同上 |
| docs | 文档（docs/、README） | docs |
| refactor | 重构（不改行为） | 同上 |
| style | 格式（不影响逻辑） | 同上 |
| test | 测试 | core / server |
| chore | 构建/依赖/杂项 | repo |

规则：subject 用中文祈使句，≤50 字，不加句号；涉及 shared 类型变更必须带 `!`（如 `feat(shared)!: RepoDef 增加 outputDir`）；破坏性变更 footer 注明 `BREAKING CHANGE:`；一 commit 一事，禁止混入无关文件；提交前 `git diff` 自查，**禁止提交 token/凭据/本地路径绝对配置**。

示例：

```
feat(web): 发布向导完成摘要步骤与失败仓库提示
fix(server): SSE 断线重连后补发任务快照事件
docs: 补充 frontend.md 徽标规则表
```

## 10. 与需求文档的对应关系

| 编号 | 需求 | 本文对应章节 |
|---|---|---|
| R1 | 客户端形态（本地 Web + 可选 PWA） | §2 初始化（5173/8899 双进程）、§8.7 PWA 注册时序 |
| R2 | 项目/仓库两级管理 | §4 web 目录约定（views/stores 对应两级模型） |
| R3 | 仓库接入两种方式 | §7 手动清单（AddRepoDialog 两种接入验收项） |
| R4 | 仓库内容查看 | §7 清单（文件树懒加载/truncated/binary 验收） |
| R5 | 仓库级版本与日志 | §6.4 字段名与 types.ts 一致、§7 构建门禁 |
| R6 | 项目级版本与日志 | §7 向导六步走通验收项 |
| R7 | 日志双轨 | §7 清单（日志编辑器双轨验收） |
| R8 | 版本号方案可配 | §6.4 引 shared 常量（hybrid/timestamp 配置项） |
| R9 | 自动化 | §5 命名（planPublish 等）、§7 全流程门禁 |
| R10 | 双模式 | §8.4/§8.8（offline 参数、代理与生产托管） |
| R11 | 现有工程托管 | §2 首次访问初始化流程（默认项目数据落地） |
| R12 | 版本联动 | §6.4 与 shared 契约一致（syncedOnly 语义由类型保障） |
| R13 | 改动点可见 | §7 总览验收项 |
| R14 | 日志人工可控 | §7 日志状态机验收、§6.7 禁止静默 catch |
| R15 | 完整性（无历史包袱） | §6.2 禁止 Options API、§4 全新目录约定（不迁就旧实现） |
| R16 | 足够好用 | §7 键盘/断网/重试验收清单 |
| R17 | UI/UX | §6.6 样式规范（token 体系/禁止裸 hex）、§8.4 主题一致性、§7 主题三态验收 |

## 11. 自举 release 协议

bxverse 自身也用本仓库的 changeset 机制发版（dogfooding，零依赖）。

**`type` 三档**：`major | minor | patch`；多文件混用时取最大（major > minor > patch）。

**`scripts/release.mjs`（零依赖，Node 内置 API）**：
- `pnpm release:dry` 预览：扫描 `.changeset/*.md`（YAML frontmatter + Markdown body）→ 推断 bump → 打印 6 个 package.json 的 before/after + 生成的 CHANGELOG 段落
- `pnpm release` 正式：原子写入所有 package.json + 追加 CHANGELOG.md
- **不自动** git commit / npm publish —— 人审为终，与产品发布同源哲学
- 不引入第三方库（changesets / release-it / auto 等）

**工作流**：

```bash
# 1. 改代码 + 写一条 changeset
cat > .changeset/feat-xxx.md <<'EOF'
---
type: minor
---

描述这一轮的变更（用户可读，一行 80 字内最佳）
EOF

# 2. 预览
pnpm release:dry

# 3. 正式发版
pnpm release

# 4. 人工 review
git add -A && git commit -m "release: vX.Y.Z"
rm .changeset/feat-xxx.md   # 避免下次重复发布
```

完整字段定义：`.changeset/README.md`。变更记录：根 `CHANGELOG.md`。

