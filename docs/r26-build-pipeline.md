# R26 仓库级构建流水线与 package.json 版本源

> 提案编号：R26 | 状态：方案定稿，T1 已落地
> 关联需求：R5/R6/R8/R9/R12/R18/R19 | 影响面：shared / core / server / web / docs

---

## 1. 背景与目标

现有痛点：
- `RepoDef.buildCommand` 单条命令，无法表达"安装依赖 → 前置步骤 → 打包"的完整流水线
- 仓库版本为发布时派生值，不在代码仓内可溯；`updatePackageVersion` 开关为死代码
- 版本格式仅 `hybrid`/`timestamp` 两档，且恒带 `v` 前缀
- 项目汇总清单 `GET /versions` 仅手动导出，无发布时自动落盘

目标：每个仓库可配置完整构建流水线；每个仓库版本由其 `package.json` 记录，项目级汇总 `version.json`；双格式 `X.Y.Z` / `VYYMMDDHHmm` 可选；发布时按配置打包并更新版本。

---

## 2. 决策总表

| # | 决策点 | 结论 |
|---|---|---|
| 1 | 版本写回工作区 | 自动提交，范围硬限定 `package.json` + 锁文件；保留逐仓 `none` 退出口 |
| 2 | 时间戳粒度 | `YYMMDDHHmm`（10 位 `YY MM dd HH mm`）；同分钟撞名追加两位序号 → 12 位 |
| 3 | 非 Node 仓库 | `packageJson` 模式下无 `package.json` → 自动降级派生模式 + warning |
| 4 | 汇总清单 | 手动导出（R18 保留）+ 按 `manifestTarget` 自动写入，双轨并存 |
| 5 | 格式全集 | `X.Y.Z`（标准语义版本） / `VYYMMDDHHmm`（纯时间戳，大写 V） |
| 6 | package.json 写入内容 | 恒写 `X.Y.Z` 核心（semver 合法）；`V` 格式下同样同步核心 |
| 7 | 纯时间戳 × packageJson 组合 | 核心照常随项目 bump 同步，展示/标签用 `V` 时间戳 |

---

## 3. 格式定义

| 格式 | 示例（2026-08-24 15:30） | 说明 |
|---|---|---|
| `X.Y.Z` | `1.2.0` | 标准语义版本 |
| `VYYMMDDHHmm` | `V2608241530` | 纯时间戳，大写 V |

旧数据（`vX.Y.Z` / `vX.Y.Z.YYMMDDHH` / `vYYMMDDHH` 等 8/10 位历史）容错解析兼容，新写入统一为上述两种。

---

## 4. 版本渲染矩阵

| 位置 | 写入内容 |
|---|---|
| 仓库根 `package.json` | bump 后的 `X.Y.Z`（两格式统一） |
| build tag | `build/{格式化串}`（如 `build/V2608241530` / `build/1.2.0`） |
| milestone tag | 与格式一致（`X.Y.Z` 或 `VYYMMDDHHmm` 所属项目维度） |
| 业务仓 `version.json`（兼容写入） | `{ version: 格式化串, build, buildTime }` |
| 项目汇总清单 / 发布记录 | 格式化串 |

---

## 5. 数据模型

### 5.1 RepoDef（仅新增可选字段）

```ts
versionSource?: 'derived' | 'packageJson'   // 缺省 derived，完全保持现行为
packageManager?: 'pnpm' | 'npm' | 'yarn' | 'bun'
installCommand?: string                      // 缺省按锁文件推导 frozen install
preBuildCommand?: string                     // 如更新依赖、codegen
buildTimeoutMs?: number                      // 默认 600000
versionSyncCommit?: 'package' | 'none'       // packageJson 模式默认 'package'
```

### 5.2 ProjectDef

```ts
repoVersionFormat?: 'X.Y.Z' | 'VYYMMDDHHmm'  // 缺省 X.Y.Z
manifestTarget?: { repoId: string, path: string }  // 发布完成自动写入目标
```

### 5.3 PlannedRepo

```ts
currentVersion?: string        // package.json 当前版本（用于展示与幂等）
effectiveMode?: 'packageJson' | 'derived' | 'downgraded'
```

---

## 6. 引擎编排

packageJson 模式仓库（derived 仓库管线不变）：

```
preflight → version-sync(写 X.Y.Z 核心 + 受控提交) → install(frozen) → pre-build → build → tags → backup → version.json → push → record
```

- `version-sync` 幂等：`package.json` 已等于目标核心则跳过
- 提交白名单硬编码：仅 `package.json` + 锁文件（`pnpm-lock.yaml` / `package-lock.json` / `yarn.lock` / `bun.lockb`）
- `install` 默认 frozen（防锁文件漂移污染工作区）；用户覆盖 `installCommand` 时自担
- 无 `package.json` 的仓库在 plan 阶段降级为 derived + warning
- journal 新增 phase：`version-sync` / `install` / `pre-build`

---

## 7. 兼容性

- `shared/constants.ts` 定稿正则不动；core 内部新增容错正则兼容新旧全量格式
- `repoVersionScheme: 'hybrid' | 'timestamp'` 保留，`repoVersionFormat` 存在时优先
- 历史 `v` 前缀数据双向可读

### 7.1 无工程化（纯静态）仓库适配（2026-08-25 补充裁决）

原生 html/js/jquery 等**无 package.json** 的仓库是一等公民：

- `repo-policy.detectRepoKind()`：有 package.json → `nodejs`，否则 → `static`；`RepoStatus.repoKind` 于 `collectChanges` 实时计算透出（不落盘，随仓库演进自动翻转）
- 版本：`versionSource=packageJson` 时 plan 阶段降级 derived + warning（既有语义）；默认 derived 本来就适配
- install：自动探测只看锁文件，静态仓库天然跳过；构建同理（仅在显式配置命令时执行）
- 护栏：静态仓库**显式配置了** install/pre-build/build 命令时，plan 阶段追加 warning（命令仍会执行，提醒可留空）
- UI：RepoDetail 流水线区对 static 仓库展示降级提示横幅（派生版本、产物备份可直接把源码目录设为 artifactDir）

---

## 8. 实施拆解

```
T1 shared 契约扩展 (XS) ✓
T2 core 格式函数 + 容错解析单测 (S)
T3 repo-policy 转正 + 单测 (M)
T4 engine 编排 / journal / 失败隔离集成测 (L, 前置 F2 缺省值修复)
T5 server API (PATCH 字段 / status 探测) + 测试 (S)
T6 web UI (RepoDetail 设置、向导步骤 2/4、项目设置) (M)
T7 文档回写 requirements / data-model / core-engine / api / frontend / roadmap(M13) / README (S)
T8 e2e fixture 向导回归 (S)
```

---

## 10. B 方向多栈 versionSource（gradle / cargo / goModule）

### 10.1 背景与目标

R26 已落地 `RepoDef.versionSource: 'derived' | 'packageJson'` 两栈，bump→写 `package.json` 顶层 `version` 走 `commitVersionFiles` 受控提交链路。但仅覆盖 Node.js 仓；JVM/Android（Gradle）/ Rust（Cargo）/ Go（goModule）项目同样存在版本管理需求。

B 方向在 core 层补齐 3 栈 `detect + read + write` 能力，引擎主路径暂不消费（R26 已落地的 packageJson 路径不变），由后续 server/web 端点与引擎扩展复用。

### 10.2 版本源枚举

| 取值 | 适用栈 | 读取位置 | 写入 | 说明 |
|---|---|---|---|---|
| `derived` | 任意（默认） | 不读 | 不写 | bxverse 推算版本，不维护业务仓版本文件（保持现行为） |
| `packageJson` | Node.js | `package.json#version` | ✅ | R26 既有，受控提交 |
| `gradle` | JVM/Android | `build.gradle` 或 `build.gradle.kts` 的 `version = "X.Y.Z"` | ✅ | 新增 |
| `cargo` | Rust | `Cargo.toml [package] version = "X.Y.Z"` | ✅ | 新增；[workspace.package] 不动 |
| `goModule` | Go | — | ❌ | 新增；go.mod 不存版本（Go 社区规范），版本由 git tag + CI ldflags 注入 |

```ts
// packages/shared/src/types.ts (R26 + B 方向)
versionSource?: 'derived' | 'packageJson' | 'gradle' | 'cargo' | 'goModule'
```

### 10.3 core 能力函数

`packages/core/src/repo-policy.ts` 新增 3 主函数 + 4 辅助函数（gradle Groovy/Kotlin DSL、Cargo.toml [package] 解析）：

| 函数 | 签名 | 行为 |
|---|---|---|
| `detectVersionSource` | `(repoPath) => VersionSource` | 按文件存在优先级：`build.gradle(.kts)` > `Cargo.toml` > `go.mod` > `package.json` > `derived` |
| `readVersionBySource` | `(repoPath, source) => string \| null` | 按 source 调对应 read 函数；goModule/derived 永远 null |
| `writeVersionBySource` | `(repoPath, source, version) => { previous, next }` | 按 source 调对应 write 函数；goModule/derived 抛清晰错 |

辅助函数 `readGradleVersion` / `writeGradleVersion` 支持 `build.gradle`（Groovy DSL）和 `build.gradle.kts`（Kotlin DSL），匹配 `version = "X.Y-Z"` 形式（单/双引号），跳过 `//` 注释行；`readCargoVersion` / `writeCargoVersion` 仅改 `[package]` section 的 `version` 字段，`[workspace.package]` / `[dependencies]` 不动。

### 10.4 引擎集成（暂未消费）

当前 `engine.ts:278` 仍只判 `versionSource === 'packageJson'` 走 `updatePackageVersion`；B 方向仅在 core 层落地 read/write/detect 能力。

**后续扩展点**（不在本节 scope，留待 R32.x）：
- `engine.ts:278` 改为 `switch (effectiveSource)`，case `gradle`/`cargo` 调 `writeVersionBySource`；case `goModule` 跳过 version-sync（依赖外部 CI ldflags 写入）
- `commitVersionFiles` 白名单扩 `build.gradle` / `build.gradle.kts` / `Cargo.toml`（保持受控提交纪律）
- `getDefaultInstallCommand` 增 cargo（`cargo build --frozen`）与 goModule（`go mod download`）映射

### 10.5 server / web 接入

- **server**：`GET /api/repos/:id` 已返回 `versionSource` 字段（`RepoDef` 序列化透传）；后续可在 `GET /api/repos/:id/version` 单独暴露 `readVersionBySource` 探测值
- **web**：`RepoSettings.vue` 增加 `versionSource` 下拉（5 选 1，默认 derived）；选中后即时显示当前探测值（`detectVersionSource + readVersionBySource`）

### 10.6 借鉴 l-pc-front

l-pc-front 的 `scripts/generate-version.js` 仅处理 Node.js（`package.json` + `public/version.json`），无多栈概念。本节能力超出 l-pc-front，是 bxverse 通用化的独立扩展。

---

## 9. 变更记录

| 日期 | 变更 |
|---|---|
| 2026-08-24 | R26 方案定稿：双格式 `X.Y.Z` / `VYYMMDDHHmm`，package.json 核心同步，受控提交 |
| 2026-08-31 | B 方向多栈 versionSource：扩 gradle/cargo/goModule，core 层 detect+read+write 能力，引擎主路径暂不消费 |
