# l-pc-front 接入 bxverse 迁移指南（R32 升级后回退）

> 文档版本：v1（2026-08-31）
> 适用对象：l-pc-front、l-data-v、saas、im-web、vr-fornt 等任何"自带版本/升级脚本"的前端业务仓
> 前置：bxverse 服务已在 127.0.0.1:8899 启动 + 业务仓已在 bxverse 注册项目（`RepoDef.versionSource: 'packageJson'` + `updatePackageVersion: true`）

## 1. 前置条件

- `bx-manager` CLI 已就绪（全局安装或 npx）
- bxverse 服务在 `127.0.0.1:8899` 启动（dev: `pnpm dev`；prod: `pnpm start`）
- 业务仓已在 bxverse 注册项目（`POST /api/projects` + `POST /api/projects/:id/repos`）
- RepoDef 关键字段：
  - `versionSource: 'packageJson'`（R26 接管：版本写回仓库根 `package.json` 的 `version` 字段）
  - `updatePackageVersion: true`（R26 实际写回而非仅展示）
  - `buildCommand: 'vite build'`（R26 仓库级构建流水线）
  - `artifactDir: 'dist'`（R19 产物备份目录）

## 2. 代码删除清单（5 类共 9 文件）

### 2.1 版本脚本（4 个文件）

```bash
# 在业务仓根目录
rm scripts/generate-version.js
rm scripts/create-build-tag.js
rm scripts/git-tag-cli.js
rm scripts/git-commit-cli.js   # 若 l-pc-front 使用
```

**为什么删**：bxverse `POST /api/publish` 自动算版本号（`bumpSemver` / `hybridVersion` / `formatRepoVersion`），并写 `internalDraft` / `externalDraft`；发布执行 `tagBuild` / `tagMilestone` 已在 `engine.executePublish` 自动打。

### 2.2 前端版本文件（3 个文件）

```bash
rm public/version.json
rm -rf public/version-history/   # 整个目录
# （若 public/version-history 不存在则跳过）
```

**为什么删**：bxverse 数据仓库（`~/.bxverse/data`）持久化所有 release 记录 + tags；前端从 `apps/web/src/api/index.ts` 的 `projectReleases(id, n=20)` 拉历史数据更准。

### 2.3 前端版本读取模块（2 个文件）

```bash
rm src/common/version-log.js
rm src/common/updateChecker.js
```

**为什么删**：
- `version-log.js` 提供 `fetchVersionList` / `fetchVersionDetail` / `fetchCurrentVersion`，全部由 bxverse API 替代：
  - `api.projectReleases(id, n)` → 列表 + 摘要
  - `api.releasesByScope(scopeId)` → 仓级历史
  - `api.releaseVersions(recordId)` → 发布快照版本号
- `updateChecker.js` 提供 `checkUpdate` + `showUpdateNotification`，由 bxverse `subscribePublish(taskId)` SSE 实时推送替代（发布完成时立刻推送 `done` 事件）。

### 2.4 前端版本 UI（3 个文件，可选删除）

```bash
# 如果 l-pc-front 仍想保留版本时间线 UI（推荐用 bxverse 数据）
# 把 src/pages/common/changelog/ChangelogPage.vue 改为：
#   1) 路由 hash 跳到 bxverse server 的 /project/:id（管理 UI）
#   2) 在 bxverse UI 上看「项目详情」Tab 2「版本日志」
# 然后删除本地 3 文件：
rm src/pages/common/changelog/ChangelogPage.vue
rm src/components/common/update-log/UpdateLogDialog.vue
rm src/components/common/update-log/markdown-renderer.js
```

**为什么删**：bxverse `RepoDetail` Tab 2「版本日志」+ `BackupManage` 已经覆盖同等能力（更准确的 git 真实状态 + R26 流水线），且符合 WIG / Naive UI / UnoCSS 主题；emojis / 金色装饰 / element-ui 风格被 Naive UI + UnoCSS + 精密仪器视觉语言统一替代。

## 3. package.json scripts 清理

```diff
 {
   "scripts": {
-    "build:version": "node scripts/generate-version.js && npm run build",
-    "build:version:ci": "node scripts/generate-version.js --ci && npm run build",
-    "build:version:ci:tag": "node scripts/generate-version.js --ci && npm run build && node scripts/create-build-tag.js",
-    "build:version:ci:tag:push": "node scripts/generate-version.js --ci && npm run build && node scripts/create-build-tag.js --push",
-    "generate-version": "node scripts/generate-version.js",
-    "generate-version:ci": "node scripts/generate-version.js --ci",
-    "create-build-tag": "node scripts/create-build-tag.js",
-    "git-tag": "node scripts/git-tag-cli.js",
-    "git-commit": "node scripts/git-commit-cli.js",
     "build": "vite build",
     "dev": "vite",
     ...
   }
 }
```

**为什么删**：所有版本生成 / build tag / commit 辅助改由 `bx-manager` 接管（`bx-manager start` 启动服务，`POST /api/publish` 一键发布）。

## 4. vite.config / vue.config 清理

```diff
// vite.config.mjs 或 vue.config.js
- import { htmlEnvInject } from './scripts/vite-plugins.mjs'
- plugins: [
-   htmlEnvInject(),  // 注入 __VERSION__ 全局
-   envListTrim(),     // env 精简
-   copySanitize(),    // 资源脱敏
- ]
- define: {
-   __VUE_OPTIONS_API__: true,
-   __VUE_PROD_DEVTOOLS__: false,
-   __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
-   'process.env.VERSION_BASE': JSON.stringify(process.env.VERSION_BASE),
-   ...
- }
```

**为什么删**：bxverse R26 在 `executePublish` 自动注入 `version` 到 release record；前端直接通过 API 拿版本号，无需构建时注入。

## 5. 路由清理

```diff
// src/router/index.js（Vue Router）
- { path: '/changelog', name: 'changelog', component: () => import('@/pages/common/changelog/ChangelogPage.vue') }
- { path: '/update-log', name: 'update-log', component: () => import('@/components/common/update-log/UpdateLogDialog.vue') }
```

**为什么删**：版本时间线 / 升级日志功能由 bxverse UI 替代；本业务仓只保留业务路由。

## 6. bxverse 接入配置

### 6.1 接入步骤

```bash
# 1. 启动 bxverse 服务
bx-manager start --port 8899
# 浏览器打开 http://127.0.0.1:8899 拿到 token

# 2. 在 bxverse 创建项目 + 接入 l-pc-front 仓
curl -X POST http://127.0.0.1:8899/api/projects \
  -H "X-BX-Token: $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"l-pc-front","description":"主产品线 PC 前台"}'
# → 返回 projectId

# 3. 接入仓库（本地路径或 git clone）
curl -X POST http://127.0.0.1:8899/api/projects/p_xxx/repos \
  -H "X-BX-Token: $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"l-pc-front","path":"E:/bx-gitee/l-pc-front","buildCommand":"vite build","artifactDir":"dist","versionSource":"packageJson","updatePackageVersion":true}'
```

### 6.2 关键字段说明

| 字段 | 值 | 作用 |
|---|---|---|
| `versionSource` | `'packageJson'` | R26：以仓库根 `package.json` 的 `version` 为权威（替代 l-pc-front 旧 `v1.0.0.26082918` 格式） |
| `updatePackageVersion` | `true` | R26：发布时**实际写回** `package.json`（替代 l-pc-front `__VERSION__` 注入） |
| `buildCommand` | `'vite build'` | R26：发布前执行构建 |
| `artifactDir` | `'dist'` | R19：产物备份目录 |
| `installCommand` | `'npm ci'`（可选） | R26：自定义安装命令 |
| `preBuildCommand` | `''`（可选） | R26：构建前自定义步骤 |

## 7. 回退 SOP（上线后使用）

**场景**：线上服务 v1.2.0 有问题，希望回退到 v1.1.0

### 7.1 在 bxverse UI 操作

1. 浏览器打开 `http://127.0.0.1:8899` → 进入项目 `l-pc-front`
2. 点顶栏「**回退**」按钮（或命令面板 Ctrl+K 搜「回退」）
3. **Step 1 选 release**：时间线列表选 `v1.1.0`（在 v1.2.0 之前）
4. **Step 2 预览影响面**：
   - 顶部 banner 显示「从 v1.2.0 回退到 v1.1.0」+ 风险等级 chip（ok=绿 / warn=黄 / block=红）
   - 中间表格：受影响仓 × 目标/当前 commit × ahead/dirty/compatibility
   - 底部 drift 风险提示（跨项目不齐的列）
5. **Step 3 确认版本与日志**：
   - 新版本号默认 `1.1.1`（patch 增量）
   - 双轨日志预填（来自 v1.1.0.logs）
   - 勾选「我已确认将回退并发布新版本」
6. **Step 4 完成**：
   - 展示 `RollbackResult` 卡片（新 releaseId + 废弃 releaseId + 删除 tag）
   - 数据仓库落审计 commit
   - 业务仓侧拉新代码即可

### 7.2 业务仓侧 CI 配合

bxverse 在业务仓打 `revert-to/{targetVersion}` 标签（指向 targetCommit），业务仓侧 CI 检测到 `revert-to/v1.1.0` 标签 → 自动切回 → 上线服务。

```bash
# 业务仓 CI 脚本示例（GitLab CI / GitHub Actions）
if git tag -l "revert-to/*" | grep -q .; then
  REVERT_TAG=$(git tag -l "revert-to/*" | sort -V | tail -1)
  git checkout $REVERT_TAG
  npm ci && npm run build && npm run deploy
fi
```

## 8. 回归测试

```bash
# 8.1 业务仓侧：删除全部 9 文件后必须能 build
rm -rf scripts/generate-version.js scripts/create-build-tag.js scripts/git-tag-cli.js scripts/git-commit-cli.js
rm -rf src/common/version-log.js src/common/updateChecker.js
rm -rf src/pages/common/changelog/ChangelogPage.vue src/components/common/update-log/
rm -f public/version.json
rm -rf public/version-history/
pnpm typecheck && pnpm build
# 期望：业务功能不受影响（仅失去自建版本/升级 UI）

# 8.2 bxverse 端到端回归
pnpm --filter @bxverse/cli test:e2e   # wizard-flow.py 仍过

# 8.3 演练：发 3 个版本 + 回退 1 次
#   1) 业务仓改 1 个 commit → bxverse 发布 v1.0.0
#   2) 业务仓改 1 个 commit → bxverse 发布 v1.1.0
#   3) 业务仓改 1 个 commit → bxverse 发布 v1.2.0
#   4) bxverse UI → 回退到 v1.1.0 → 验证：
#      - v1.1.1 发布（新基版）
#      - v1.2.0 标 deprecated
#      - build/v1.1.0.26083010 + v1.1.0 标签删除
#      - revert-to/v1.1.0 标签创建
#      - 数据仓库 commit: 'revert: rollback ...'
```

## 9. 已知差异 / 限制

| l-pc-front 旧行为 | bxverse 替代 | 差异 |
|---|---|---|
| `version.json` 在 `public/` | bxverse 数据仓库（`~/.bxverse/data/`） | 业务仓不存版本号（package.json 仍由 `updatePackageVersion` 写） |
| `version-history/{version}.md` 静态文件 | `ReleaseRecord.logs.internal/external` 数据 | 同等能力 + 不可变审计 |
| `__lpcUpdateNow`（清缓存 + reload） | bxverse `subscribePublish(taskId)` SSE 实时推送 | 更精准（按发布事件触发） |
| `checkUpdate` 本地 vs 远程文件对比 | bxverse `engine.collectChanges` git 真实状态 | 更精准（lastPublishCommit..HEAD 提交数 + dirty + ahead/behind） |
| `ChangelogPage` 极简单列 + 金色装饰 | bxverse `RepoDetail` Tab 2 + Naive UI + UnoCSS | 主题统一 + WIG 合规 |
| `__VERSION__` 构建时全局注入 | bxverse API 运行时拉取 | 避免构建时污染 |

## 10. 多仓迁移（如 l-data-v、saas 等）

对其他业务仓，**重复 §2-§5 删除步骤 + §6 bxverse 接入配置**即可。每个业务仓独立项目，可独立管理发布。

跨项目协调场景（如「l-pc-front 在主产品线 + 灰度项目都接入」）由 bxverse `Version Matrix` 矩阵视图（R31）统一管理。
