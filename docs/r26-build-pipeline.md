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

## 9. 变更记录

| 日期 | 变更 |
|---|---|
| 2026-08-24 | R26 方案定稿：双格式 `X.Y.Z` / `VYYMMDDHHmm`，package.json 核心同步，受控提交 |
