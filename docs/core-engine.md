# bxverse 核心引擎设计（@bxverse/core）

> 文档版本：v0.2（2026-08-13）
> 依据：`docs/requirements.md`（唯一需求依据）、`docs/architecture.md`（总体架构）、`packages/shared/src/types.ts`（定稿共享类型）、`packages/shared/src/constants.ts`（定稿常量）。
> 读者：后续开发 agent。本文给出 core 包**完整的文件清单、每个导出函数的 TS 签名、核心算法伪码与边界情况**，照着实现即可。
> 依赖约束（锁定）：零第三方运行时依赖，仅 Node 内置模块 + `child_process.spawn('git', ...)` + `@bxverse/shared`（仅类型与常量）；不导入 server/web/cli；不含任何 HTTP 概念（事件通过回调注入）。

### 变更记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v0.1 | 2026-08-13 | 初稿 |
| v0.2 | 2026-08-13 | §1 对齐实际 index.ts 导出面（files/backup/compare 三模块 + diffLines/JournalStore 公开导出）；文件清单补 `files.ts`、`backup/`（5 文件）、`compare/index.ts`；新增 §7 文件树与文件读取（safeAbs 符号链接加固）与 §8 备份与一致性对比（R19）；§6.3 补提交级排除 `excludeCommits` 语义；§5.1 补 `updateRecord`；§11 对应关系表补 R19 行（原 §7~§9 顺延为 §9~§11） |
| v0.3 | 2026-08-17 | §1 `ai.ts` 升级多供应商（`chatCompletion` 基础封装 + `polishLog/testConnection`，阶段二预留 `commitMessage/explainDiff`）；`git.ts` 预留阶段二写操作扩展（commit/stash/push/pull/tag 删除）；§5.4 项目级发布记录 `repos` 全量快照语义（成功=发布版本 / 同步基版=项目版本 / 失败=仓库当前版本）；§5.x `syncUnchangedVersionFile` 改为写入本次发布版本 |

---

## 1. 定位与文件清单

core 是全部领域逻辑的唯一实现方（server 只做 HTTP 编排）。对外导出**八个模块** + 辅助导出（与实际 `index.ts` 一字不差）：

```ts
// packages/core/src/index.ts
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

文件清单（`packages/core/src/`，均 [已有]）：

| 文件 | 角色 | 导出 |
|---|---|---|
| `index.ts` | 汇总导出八模块 + diff/journal 辅助导出 | — |
| `git.ts` | git 子进程封装与解析 | 14 个函数（§2）；阶段二扩展：`worktreeStatus/diff/commitFiles/stash/stashPop/pushBranch/pushTags/pullFF/deleteTag`（同上 spawn 数组模式，零依赖） |
| `version.ts` | 版本号计算（R26 双格式 X.Y.Z / VYYMMDDHHmm） | 11 个函数（§3，含 `V_STAMP_RE`/`SEMVER_TOLERANT_RE`/`parseVersionTolerant`/`formatRepoVersion`/`buildStampMinute`/`semverCore`/`compareVersion`） |
| `changelog.ts` | 提交分类/统计/双轨日志渲染 | 5 个函数（§4） |
| `store.ts` | 数据目录、app.json、credentials、发布记录、备份元数据、数据仓库 | `APP_DIR`/`DEFAULT_APP_CONFIG`/`versionSafe`/`tokenMatches` + 配置与凭据函数 + `DataStore` 类（§5）；re-export `resolveHome` |
| `engine.ts` | 变动检测、发布计划、发布编排 | 6 个函数 + `ExecuteResult` 类型（§6） |
| `files.ts` | 文件树与文件读取（gitignore 感知、内置忽略目录、截断保护、符号链接加固） | `listTree/readFileContent`（§7） |
| `backup/index.ts` | 备份编排（幂等、失败清理本次半成品、返回元数据引用） | `backupRepo`/`BackupError`/`BackupRepoOptions` + `SOURCE_BUNDLE/SOURCE_ARCHIVE/SOURCE_SHA256`（§8.1） |
| `backup/source.ts` | 源码备份：git bundle（全历史）+ git archive 快照 | `createBundle/createArchiveGz`（§8.1） |
| `backup/artifact.ts` | 产物目录归档 + manifest | `backupArtifact` + `ARTIFACT_TAR/ARTIFACT_MANIFEST`（§8.1） |
| `backup/manifest.ts` | 目录 → 哈希清单（流式 sha256） | `hashFile/walkFiles/buildManifest/readManifest` + `BACKUP_SKIP_DIRS`（§8.1） |
| `backup/tar.ts` | 零依赖 ustar tar.gz 写入器 | `createTarGz`（§8.1） |
| `compare/index.ts` | 三层一致性对比（源码/清单/校验）→ `CompareResult` | `compareSource/compareManifests/verifyManifest`（§8.2） |
| `journal.ts` | journal 落盘/扫描/恢复 | `JournalStore` 类 + `Journal/JournalStep` 类型（经 index.ts 公开导出，§6.5） |
| `preflight.ts` | 预检阻塞项（引擎内部使用） | `runPreflight`（§6.4，私有） |
| `home.ts` | BX_HOME 解析、目录确保（store 内部使用） | `resolveHome/ensureDirs/atomicWrite`（私有） |
| `ai.ts` | 可选 AI 能力（多供应商，OpenAI 兼容）：日志润色、测试连接、阶段二提交信息/变更解读 | `chatCompletion(provider, key, system, user, opts)`（私有）→ `polishLog` / `testConnection` / `commitMessage` / `explainDiff`；未启用/缺凭据短路 |
| `repo-policy.ts` | 受控写入策略（R26）：`package.json` 版本来源、包管理器探测、受控提交白名单 | `detectPackageManager`/`getDefaultInstallCommand`/`resolveInstallCommand`/`commitVersionFiles`/`readPackageVersion`/`updatePackageVersion`（§3.5） |
| `diff.ts` | autoDraft 与 content 的行级 LCS diff | `diffLines`/`DiffLine`（经 index.ts 公开导出，供 API 层与前端 DiffView 消费） |

私有类型（不跨进程，无需进 shared）：

```ts
// journal.ts
interface Journal {
  taskId: string
  projectId: string
  startedAt: string          // ISO 8601
  status: 'running' | 'done' | 'failed' | 'interrupted'
  request: PublishRequest    // 原始请求（含 dryRun 前的字段）
  plan: PublishPlan          // 锁存的版本计划（续跑复用，防版本漂移）
  steps: JournalStep[]
}
interface JournalStep {
  seq: number
  repoId: string | null      // null = 项目级步骤
  phase: 'preflight' | 'version-sync' | 'install' | 'pre-build' | 'build' | 'tag-milestone' | 'tag-build' | 'backup' | 'version-file' | 'record' | 'push' | 'project-record' | 'data-commit'
  state: 'pending' | 'running' | 'done' | 'failed'
  detail: string
}

// git.ts
type GitResult =
  | { ok: true; stdout: string; stderr: string }
  | { ok: false; code: number; stderr: string }
class GitError extends Error { code: number; stderr: string }

// store.ts
type SyncResult = { action: string; ok: boolean; message?: string; warning?: string } & Record<string, unknown>
```

> 注：architecture.md §7 曾按子目录（`git/`、`version/`、`logs/`、`publish/`、`store/`）规划文件；本设计将公开模块平铺在 `src/` 根（锁定决策），仅 `backup/`、`compare/` 保持子目录形态，实现时可按需拆子文件，但**公开签名与模块归属必须与本文件一致**。轮询缓存（原 `detect/poll.ts`）由 server 侧定时器 + 本包 `engine.collectChanges/detectChanged` 承担。

---

## 2. git.ts —— git 子进程封装与解析

### 2.0 git() 基础封装

```ts
export function git(args: string[], opts?: {
  cwd?: string            // 默认 process.cwd()
  timeoutMs?: number      // 默认 30_000；clone 用 120_000
  env?: NodeJS.ProcessEnv // 默认 { ...process.env, LC_ALL: 'C.UTF-8' }
}): Promise<GitResult>
```

伪码：

```
spawn('git', args, { cwd, windowsHide: true, env })
stdout/stderr 分别收集（限制 buffer 上限 50MB，超出中止该次调用并报 GitError）
timer = setTimeout(timeoutMs) → kill('SIGKILL') → ok:false, code:'TIMEOUT'
exit code 0 → { ok:true, stdout: utf8, stderr: utf8 }
exit code ≠ 0 → { ok:false, code, stderr }
```

实现要点：
- 所有 git 调用必须带 `-c core.quotepath=false`（保证中文路径按 UTF-8 原样输出），解析层统一 utf8 解码。
- **永不**执行写历史类命令：`commit/amend/reset/rebase/force-push` 在本包内禁止出现（原则一：数据权威工具无痕）。

### 2.1 逐函数规格

#### isRepo

```ts
export function isRepo(dir: string): Promise<boolean>
```
- 伪码：`git(['rev-parse','--git-dir'], {cwd:dir})` → ok 即 true。
- 边界：目录不存在/无权限 → false（不抛错）。

#### head

```ts
export function head(dir: string): Promise<string>   // 完整 40 位 hash
```
- 伪码：`git(['rev-parse','HEAD'])` → stdout.trim()。
- 边界：**空仓库**（无 commit）→ 抛 `GitError('EMPTY_REPO')`；调用方（collectChanges）捕获后按空仓库状态返回 `head:''`。

#### currentBranch

```ts
export function currentBranch(dir: string): Promise<string>
```
- 伪码：`git(['symbolic-ref','--short','HEAD'])`。
- 边界：detached HEAD → 失败 → 返回 `"(detached)"`；空仓库 → 抛 `GitError('EMPTY_REPO')`。

#### dirtyCount

```ts
export function dirtyCount(dir: string): Promise<number>
```
- 伪码：`git(['status','--porcelain','--untracked-files=no'])` → 按行计数。
- 说明：只统计已跟踪文件的修改（untracked 不阻塞发布，避免新目录接入初期无法发布）。

#### hasRemote / remoteUrl

```ts
export function hasRemote(dir: string): Promise<boolean>
export function remoteUrl(dir: string): Promise<string>   // 无远程返回 ''
```
- 伪码：`git(['remote','get-url','origin'])`；ok → true/值；fail → false/''。

#### latestTag / listTags / tagExists

```ts
export function latestTag(dir: string): Promise<string | null>
export function listTags(dir: string, pattern?: string): Promise<string[]>  // 例 'build/*'
export function tagExists(dir: string, tag: string): Promise<boolean>
```
- `latestTag`：`git(['for-each-ref','refs/tags','--sort=-creatordate','--format=%(refname:short)','--count=1'])` → 无输出 → null。
- `listTags`：`git(['tag','-l', pattern])`，逐行返回。
- `tagExists`：`git(['rev-parse','-q','--verify','refs/tags/'+tag])` → ok 即 true。

#### createTag（幂等）

```ts
export function createTag(dir: string, tag: string, opts?: { target?: string; message?: string }): Promise<void>
```
- 伪码：
  ```
  if tagExists(tag) && targetCommitOf(tag) === (target ?? HEAD): return   // 幂等跳过
  if tagExists(tag) && 指向不同 commit: throw GitError('TAG_CONFLICT')     // 交预检/规避层处理
  git(['tag','-a', tag, '-m', message ?? tag, target ?? 'HEAD'])
  ```
- 边界：**同名 tag 撞车**分两种（见 §9 汇总表）。

#### pushTag

```ts
export function pushTag(dir: string, tag: string): Promise<void>
```
- 伪码：`git(['push','origin','tag', tag])`；无 origin → 抛 `GitError('NO_REMOTE')`（调用方降级为警告）。

#### commitsSince（详见 §2.2）

```ts
export function commitsSince(dir: string, base: string | null, opts?: {
  maxCommits?: number      // 默认 3000
  includeFiles?: boolean   // 默认 true
}): Promise<CommitInfo[]>
```

#### diffStat

```ts
export function diffStat(dir: string, base: string | null): Promise<DiffStat>
```
- 命令：`base ? git diff --shortstat {base}..HEAD : git diff --shortstat 4b825dc642cb6eb9a060e54bf8d69288fbee4904 HEAD`（空树 hash 即「首次发布全量」）。
- 解析正则（输出可能缺失段，全部按 0 兜底）：
  - `/ (\d+) files? changed/` → filesChanged
  - `/ (\d+) insertions?\(\+\)/` → insertions
  - `/ (\d+) deletions?\(-\)/` → deletions
- 边界：输出为空（无差异）→ 全 0；超时（大仓库）→ 返回全 0 并抛附带警告（调用方写入 `PublishPlan.warnings`）。

#### clone

```ts
export function clone(url: string, targetDir: string, opts?: { shallow?: boolean }): Promise<void>
```
- 伪码：
  ```
  校验 url 前缀：https:// | ssh:// | git@（否则抛 GitError('BAD_URL')）
  校验 targetDir 不存在或为空目录（否则抛 GitError('TARGET_EXISTS')）
  shallow → git clone --depth 1 {url} {targetDir}；否则 git clone {url} {targetDir}
  超时 120s
  ```

### 2.2 commitsSince —— git 命令与解析格式（核心）

**命令**（base 为 null 时用 `--root` 全量收集，即「首次发布」语义）：

```
git -c core.quotepath=false log --no-merges --reverse --name-only --date=short \
    --pretty=format:%H%x1e%h%x1e%an%x1e%ad%x1e%s%x1f {base}..HEAD
```

| 选项 | 作用 |
|---|---|
| `--no-merges` | 排除合并提交（变更明细只列实质提交） |
| `--reverse` | 时间正序（日志按发生顺序排列） |
| `--name-only` | 每条提交后列出影响文件路径 |
| `--root` | 首次发布（base=null）时从根提交开始，含根提交对空树的全部文件 |
| `--date=short` | 日期 `YYYY-MM-DD` |
| `%x1e` / `%x1f` | 记录分隔符（RS）/ 单元分隔符（US），文件名几乎不可能包含，安全可靠 |

**输出形态**（`\x1e`=0x1E、`\x1f`=0x1F）：

```
{fullHash}\x1e{hash}\x1e{author}\x1e{date}\x1e{subject}\x1f
file1
file2

{fullHash}\x1e...
```

**解析伪码**：

```
lines = stdout.split('\n')
result = []; cur = null
for line of lines:
  if line.contains('\x1f'):
    header = line.split('\x1f')[0].split('\x1e')   // [fullHash, hash, author, date, subject]
    cur = classifyCommit({ fullHash, hash, author, date, subject, files: [] })
    result.push(cur)
  else if line.trim() === '':
    cur = null                                       // 提交间空行分隔
  else if cur !== null:
    cur.files.push(line)                             // 文件名原样保留（可含空格）
  // 其余行（首尾杂散行）忽略
```

**边界情况**：
- **base 不可达**（业务仓库被 force-push / GC）：git 退出码 128 → 捕获后**按首次发布重跑**（`--root` 全量）并向计划写入 warning「检测基准不可达，已按首次发布全量收集」。
- **空仓库**：`rev-parse HEAD` 失败 → 返回 `[]`（发布预检会另阻断）。
- **大仓库**：`maxCommits=3000`——解析层只保留最近 3000 条（边解析边丢弃更早的），避免内存膨胀；被截断时向计划写入 warning「提交数超过 3000，仅展示最近 3000 条」。单条提交文件数不做硬上限（`--name-only` 输出可控）。
- **文件名含换行**（罕见）：按空行切分会错位，接受该已知限制并在函数注释中标注。

---

## 3. version.ts —— 版本号计算

```ts
export function buildStamp(now?: Date): string
// 例：2026-08-13 15:30 → "26081315"（本地时间 YYMMDDHH，两位数补零）

export function parseSemver(v: string): { major: number; minor: number; patch: number; build?: number } | null
// SEMVER_RE 匹配；不匹配 → null

export function bumpSemver(v: string, bump: BumpType): string
// 伪码：
//   p = parseSemver(v)；p === null → throw Error('INVALID_SEMVER')
//   major → (p.major+1, 0, 0)；minor → (p.major, p.minor+1, 0)；patch → (p.major, p.minor, p.patch+1)
//   返回 'v{major}.{minor}.{patch}'（保留 v 前缀，丢弃 build 段）

export function suggestBump(commits: CommitInfo[]): BumpType
// 伪码：
//   任意 breaking === true → 'major'
//   否则任意 type === 'feat' → 'minor'
//   否则 → 'patch'（含空数组）

export function hybridVersion(projectVersion: string, stamp: string): string
// 伪码：p = parseSemver(projectVersion) → null 则 throw
//       返回 'v{p.major}.{p.minor}.{p.patch}.{stamp}'（8 位 stamp，天然满足 HYBRID_VERSION_RE 8~10 位）
```

**buildStamp 撞名规避**（同名 build tag 撞车，锁定语义）：

```
buildStamp(now, usedStamps?: Set<string>)          // usedStamps 来自 planPublish 收集的各仓库既有 build tag
  base = 本地时间 YYMMDDHH
  if usedStamps 不含 base: return base
  for seq in 1..99:
    cand = base + String(seq)                       // 8 → 10 位，仍满足 HYBRID_VERSION_RE
    if 不含 cand: return cand
  throw Error('BUILD_STAMP_EXHAUSTED')              // 同一小时发布超 100 次（不可达）
```

边界：**无 tag 的首次发布** —— `usedStamps` 为空集，直接用当前小时；`latestTag` 为 null 不影响本模块（suggestBump 由历史提交推断）。

---

## 4. changelog.ts —— 提交分类、统计与双轨日志渲染

```ts
export function classifyCommit(subject: string): { type: CommitType; scope: string | null; breaking: boolean }
// 伪码（Conventional Commits 规则）：
//   m = /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.*)$/.exec(subject)
//   不匹配 → { type:'other', scope:null, breaking: subject 含 'BREAKING' }
//   type = m[1] ∈ COMMIT_TYPES ? m[1] : 'other'
//   scope = m[2] ?? null；breaking = m[3]==='!' || subject 含 'BREAKING'

export function classifyCommits(commits: CommitInfo[]): CommitInfo[]
// 就地补全 type/scope/breaking（commitsSince 内部已调用；重复调用幂等）

export function computeStats(commits: CommitInfo[], diff?: DiffStat): Stats
// byType：12 个 CommitType 全量初始化 0，再累加
// commits = len；filesChanged = diff?.filesChanged ?? 去重文件并集大小
// insertions/deletions = diff ?? 0（无 diff 时给 0，调用方按需用 git.diffStat 补真值）

export function renderInternal(commits: CommitInfo[], opts: {
  version: string; baseVersion: string; date: string
  repoName: string; projectName: string; buildStamp: string
  from: string | null; tags: string[]; stats: Stats
}): string

export function renderExternal(commits: CommitInfo[], opts: {
  version: string; date: string; repoName: string; projectName: string
  buildStamp: string; exclude?: CommitType[]
}): string
```

### 4.1 internal 模板（Markdown 结构逐行定义）

```
# v{version} 发布记录（内部）

> 项目：{projectName}｜仓库：{repoName}
> 基版：v{baseVersion}（{from === null ? '首次发布，全量收集' : from}）
> 构建：{buildStamp}｜日期：{date}
> 标签：{tags.join('、') 或 '无'}

## 概览

- 提交：{stats.commits} 个｜影响文件：{stats.filesChanged}｜+{stats.insertions} / -{stats.deletions}
- 类型分布：{按 COMMIT_TYPES 顺序，仅列 >0：`新增(feat)×5、修复(fix)×4、…`；全 0 时「无」}

## 变更明细

### {COMMIT_TYPE_LABELS[type]}（{type}）

#### {type}{breaking ? '!' : ''}{scope ? `(${scope})` : ''}：{subject} `{hash}`

- 作者：{author}｜日期：{date}
- 影响文件（{n}）：
  - {file}（按字母序；n=0 时此行显示「（无文件级信息）」）

（重复以上提交块，时间正序）

---

> 由 BX 版本管理台自动生成，可人工编辑确认。
```

规则：
- 分组按 `COMMIT_TYPES` 顺序，仅保留数量 > 0 的组；组内按时间正序。
- breaking 提交：类型后缀 `!`，行尾追加 `**[BREAKING]**`。
- `## 变更明细` 在 commits 为空时输出「本次无提交明细。」。

### 4.2 external 分节规则（EXTERNAL_SECTIONS + externalExclude + breaking 标记）

```
# {projectName} v{version} 更新日志

> 发布日期：{date}｜构建：{buildStamp}

## {EXTERNAL_SECTIONS[i].title}

- {subject}{scope ? `（${scope}）` : ''}
- **[BREAKING]**：{subject}

（节空则整节省略；全部为空时输出「本次发布无用户可见变更。」）
```

算法伪码：

```
exclude = opts.exclude ?? DEFAULT_EXTERNAL_EXCLUDE
usable = commits.filter(c => !exclude.includes(c.type) || c.breaking)   // breaking 强制收录
for section of EXTERNAL_SECTIONS:
  items = usable.filter(c => section.types.includes(c.type))
  if items.length === 0: continue
  emit '## ' + section.title
  for c of items（时间正序）:
    prefix = c.breaking ? '**[BREAKING]**：' : ''
    emit '- ' + prefix + c.subject + (c.scope ? `（${c.scope}）` : '')
```

规则：
- **external 不含 hash/作者/文件**（只面向用户可感知的变更）。
- **breaking 强制收录**：即使其类型被 exclude（如 `chore!` 罕见的破坏性杂项），仍归入其类型对应分节并加 `**[BREAKING]**` 前缀。
- 分节映射来自 `EXTERNAL_SECTIONS`（feat→新增；perf/refactor→优化；fix→修复；其余→其他）。

### 4.3 autoDraft 生成规则

- `PublishPlan.externalDraft / internalDraft` = `renderExternal / renderInternal` 在 plan 时刻的输出（**不含 AI**；AI 润色是向导中前端触发的可选动作，`ai.polishLog` 按生效供应商调用，未启用/缺凭据时由调用方呈现错误，不静默回原文）。
- 落盘时 `ReleaseLog.autoDraft` = 同一 render 调用输出（留底对比基准）。
- `ReleaseLog.content` 初始值 = `PublishRequest.externalContent ?? autoDraft`；`state` 推断：`content === autoDraft ? 'auto' : 'edited'`（确认动作发生在发布前向导与发布后 PATCH，见 api.md §7.3）。

---

## 5. store.ts —— 数据目录、配置与发布记录

```ts
export const APP_DIR: string
// home.ts 计算：process.env.BX_HOME ?? join(os.homedir(), APP_DATA_DIR_NAME)   // APP_DATA_DIR_NAME='.bxverse'
// 启动时 ensureDirs：APP_DIR、data/、repos/、journal/、logs/、tmp/

export async function loadAppConfig(): Promise<AppConfig>
export async function saveAppConfig(cfg: AppConfig): Promise<void>

export async function loadCredentials(): Promise<{ token: string; dataRemote?: string | null }>
export async function saveCredentials(cred: { token: string; dataRemote?: string | null }): Promise<void>
```

**loadAppConfig 伪码**：

```
path = join(APP_DIR, 'app.json')
不存在 → 写默认值并返回：
  { port: APP_DEFAULT_PORT(8899), host: '127.0.0.1', theme: 'system',
    pwa: { enabled: true }, dataDir: APP_DIR, pollInterval: 30000,
    ai: { enabled: false, baseUrl: '', model: '', apiKey: '' }, projects: [] }
存在 → 深合并默认值（新增字段兜底）+ 返回
```

**原子写约定**（app.json / credentials.json / journal / 发布记录全部遵守）：

```
write tmp = path + '.tmp-' + process.pid；writeFile(tmp)；rename(tmp, path)
credentials.json 写权限：POSIX 0o600；Windows 尽力收紧 ACL（失败仅警告）
```

**数据目录布局**（data-model.md 展开前的最小定稿）：

```
{APP_DIR}/
├── app.json                     AppConfig（含 projects 完整定义）
├── credentials.json             { token, dataRemote }（不进数据仓库；0600）
├── data/                        数据仓库（git，gitignore: tmp/、*.tmp）
│   ├── index.json               总索引（overview 用）：{ updatedAt, projects: { [pid]: { name, version, lastRelease } } }
│   └── releases/
│       └── {scopeId}/
│           ├── index.json       [{ id, version, date, kind }]（倒序）
│           └── {versionSafeName}/
│               ├── data.json    ReleaseRecord 全量（含 logs.content 与 autoDraft，唯一事实）
│               ├── internal.md  易读副本（保存时同步生成）
│               └── external.md  易读副本
├── repos/{projectId}/{safeName}/   克隆目录（本地路径接入的仓库不在其中）
├── journal/{taskId}.json
├── logs/    server 运行日志
└── tmp/
```

### 5.1 DataStore 类

```ts
export class DataStore {
  constructor(home?: string)          // 默认 APP_DIR
  readonly dataDir: string

  ensureDataRepo(): Promise<void>
  // 伪码：data/ 不存在 → mkdir + git init -b master + 写 .gitignore(tmp/, *.tmp)
  //       首次 commit('chore: init bxverse data repo')
  //       credentials.dataRemote 存在且 origin 未配置 → git remote add origin {dataRemote}
  //       已存在且 origin 已配 → git pull --ff-only（失败仅警告，保留本地）

  // —— app.json 内嵌 projects 的 CRUD（全部原子写）——
  listProjects(): Promise<ProjectDef[]>
  getProject(id: string): Promise<ProjectDef | undefined>
  saveProject(p: ProjectDef): Promise<void>
  deleteProject(id: string): Promise<void>

  // —— 发布记录（数据仓库）——
  nextReleaseId(kind: 'project' | 'repo', scopeId: string, version: string): string
  // 'rel_' + (kind==='project'?'p':'r') + '_' + scopeId + '_' + versionSafeName(version)
  // versionSafeName = version.replace(/[^0-9a-zA-Z._-]/g, '_')
  writeRecord(record: ReleaseRecord): Promise<void>
  // 伪码：mkdir releases/{scopeId}/{versionSafe}/
  //       write internal.md / external.md 副本 → write data.json（最后写，作为「落盘完成」判据，原子写）
  //       重建 releases/{scopeId}/index.json 与 data/index.json
  readRecord(id: string): Promise<ReleaseRecord | null>       // 按 id 扫描匹配 data.json 的 id 字段读取
  updateRecord(record: ReleaseRecord): Promise<void>
  // 日志人工编辑的唯一通道（api.md §7.3 PATCH 的落点）：
  //   按 record.id 读现有记录 → 不存在抛错「发布记录不存在」
  //   校验不可变字段：version/scopeId 与现有一致（不一致抛错「不可变字段被改动（id/version/scopeId）」）
  //   原子重写 internal.md / external.md 副本 + data.json（md 副本与 data.json 保持同步）
  listRecords(scopeId: string, n?: number): Promise<ReleaseRecord[]>  // n 默认 20、上限 100
  commitRecords(message: string): Promise<string>             // data/ 内 git add -A + commit；无变更 → 返回 ''（跳过）
  syncDataRepo(action: 'pull' | 'push' | 'commit' | 'status'): Promise<SyncResult>
  // —— 备份元数据（R19，§8）——
  writeBackupMeta(ref: RepoBackupRef): Promise<void>          // data/backups/{releaseId}-{repoId}.json（幂等覆盖）
  readBackupMeta(releaseId: string, repoId: string): Promise<RepoBackupRef | null>
  listBackupMeta(): Promise<RepoBackupRef[]>                  // 倒序按日期
  deleteBackupMeta(releaseId: string, repoId: string): Promise<void>
}
```

**幂等约束**：`writeRecord` 目标 `data.json` 已存在且内容一致 → 跳过；内容不一致 → 抛错（发布记录不可变，人工修改只能走 api.md §7.3 的 PATCH 通道——即上表 `updateRecord`）。

**commitRecords 边界**：无变更（`git status --porcelain` 为空）→ 不产生空提交，返回 `''`；commit message 约定 `release({kind}:{scopeId}): {version}` 或 `chore: manual log edit`。

---

---

## 6. engine.ts —— 变动检测、发布计划与发布编排

```ts
export async function collectChanges(repo: RepoDef): Promise<RepoStatus>
export function detectChanged(repos: RepoDef[], statuses: Record<string, RepoStatus>): { changed: RepoDef[]; unchanged: RepoDef[] }
export async function planPublish(req: PublishRequest): Promise<PublishPlan>
export async function executePublish(req: PublishRequest, opts: {
  onEvent: (e: PublishEvent) => void
  taskId?: string
}): Promise<ExecuteResult>
// ExecuteResult = { releaseId: string | null; failedRepos: string[] }（引擎内导出接口）
export async function writeVersionFiles(repo: RepoDef, plan: PlannedRepo, project: ProjectDef, buildStamp: string, prevRecordVersion?: string): Promise<void>
export async function syncUnchangedVersionFile(repo: RepoDef, project: ProjectDef): Promise<void>
```

### 6.1 collectChanges —— 单仓状态（对应 GET /api/repos/:pid/:rid/status）

伪码：

```
status = {
  id: repo.id, name: repo.name, path: repo.path,
  branch: currentBranch(path)（EMPTY_REPO → ''）
  head: head(path)（EMPTY_REPO → ''）
  dirty: dirtyCount(path)
  hasRemote/remoteUrl: hasRemote/remoteUrl(path)
  versionFile: 读 {path}/{repo.outputDir ?? 'public'}/version.json → 解析 {version, build, buildTime}；缺/坏 → null
  buildTags: listTags(path, 'build/*')
  milestoneTag: listTags(path, 'v*').filter(SEMVER_RE 且无 build 段).sort(semver 倒序)[0] ?? null
  lastPublishCommit: repo.lastPublishCommit ?? null
  commits: (EMPTY_REPO ? [] : commitsSince(path, repo.lastPublishCommit))
  changed: commits.length > 0
}
```

边界：
- **空仓库**：`head/branch` 置空串、`commits=[]`、`changed=false`，其余照常；发布预检另行阻断。
- **首次发布**：`lastPublishCommit=null` → `commitsSince(..., null)` 走 `--root` 全量；`changed=true`（有历史即视为待发布）。
- 失败兜底：git 调用失败 → 返回最小可用状态 + 附加 warning 字段（不进 RepoStatus 类型，通过日志打印），不抛穿 server。

### 6.2 detectChanged —— 纯函数（server 轮询定时器调用）

```
changed = repos.filter(r => statuses[r.id]?.changed === true)
unchanged = repos.filter(r => !statuses[r.id]?.changed)
```

server 侧缓存约定：`Map<repoId, { status: RepoStatus; at: number }>`，TTL = `AppConfig.pollInterval`；`fresh=true` 或缓存缺失 → 实时 `collectChanges`。发布执行期间暂停该项目的轮询。

### 6.3 planPublish —— 发布计划（对应 POST /api/publish dryRun）

伪码：

```
project = store.getProject(req.projectId)；不存在 → throw NotFound
候选仓 = req.repoIds ?? project.repos.map(r => r.id)
（req.repoIds 非法（不属于本项目）→ throw Validation）

1. 逐仓 collectChanges(fresh=true)
2. 全量提交 = Σ changed 仓的 commits（classifyCommits 后）
3. suggestedBump = suggestBump(全量提交)
   bump = req.bump === 'auto' ? suggestedBump : req.bump
   projectVersion = bumpSemver(project.version, bump)
4. usedStamps = Σ changed 仓 buildTags 解析出的 stamp 集合
   stamp = buildStamp(new Date(), usedStamps)
5. 每 changed 仓：
     version = scheme==='hybrid' ? hybridVersion(projectVersion, stamp) : 'v' + stamp
     from = repo.lastPublishCommit；to = head
     diff = diffStat（失败 → 全 0 + warning）
     stats = computeStats(commits, diff)
     plannedRepo = { repoId, name, changed: true, version, from, to, commits, buildCommand }
6. syncedOnly = 候选仓中未变动者：{ changed:false, version: projectVersion（纯基版，无 stamp）, commits:[] }
7. milestoneTag = 'v' + projectVersion 去 v
8. tags = changed 仓 → { repoId, name, tag: 'build/v{projectVersion}.{stamp}' }
9. drafts：externalDraft = renderExternal(全量提交, {version:projectVersion, date, repoName:'（全部）'?})
   实际约定：项目级日志的 opts.repoName 传「全部仓库」，见 4.2 模板——项目日志标题为「# {projectName} v{version} 更新日志」
   internalDraft = renderInternal(全量提交, {...})
 10. warnings 汇总：基准不可达、提交截断、diffStat 超时、数据仓库无远程、dirty>0 的仓库、buildStamp 撞名已规避（信息级）等
```

**提交级排除（`req.excludeCommits`，形如 `Record<repoId, string[]>`）**（向导人工甄别「哪些 commit 值得进版本」）：

- 过滤：对每个条目逐仓建立**排除哈希集合**，按 `fullHash` 精确匹配过滤 `statuses[repoId].commits`（顺序与分类信息保留，后续 `classifyCommits` 正常执行）。
- warnings：确有剔除时记「`{name} 排除 N 个提交，参与本次发布 M 个`」。
- **降级 syncedOnly**：过滤后该仓 `commits.length === 0 && dirty === 0` → `changed=false`，随后**重算变动集合**（`changedRepos` 按过滤后的 `statuses` 重新过滤），该仓落入 `syncedOnly`（仅同步基版，不打标签不写记录）；`dirty > 0` 时保持 changed（计划中另记「仅有未提交改动」warning）。
- **不改变的语义**：`diffStat` 仍按 `lastPublishCommit..HEAD` 全量计算（与排除无关，不重算）；`lastPublishCommit` 发布成功后仍前移到 `head`，被排除的提交不再出现在下轮检测中。`excludeCommits` 为空/缺省时整块跳过。

边界：
- **无变动仓库**（`changed=[]`）：`projectVersion` 仍 bump？—— 否：`suggestedBump='patch'`、bump 照常推进，`changed=[]`、`syncedOnly` 含全部仓库（纯基版同步发布也合法，例如手动触发）。
- **空仓库参与发布**：`head=''` → 预检阻断（见 6.4），plan 阶段仅 warning。

### 6.4 preflight.ts —— 预检阻塞项（硬阻断）

```ts
// preflight.ts（私有）
export async function runPreflight(repo: RepoDef, plan: PlannedRepo, project: ProjectDef): Promise<PreflightResult>
// PreflightResult = { ok: boolean; blocked: string[] }（模块内导出接口）
```

| 检查项 | 不满足时 | 处理 |
|---|---|---|
| `isRepo` 且路径存在 | 否 | 阻断 |
| HEAD 非 detached | detached | 阻断 |
| `dirtyCount === 0` | dirty > 0 | 阻断（提示先提交或 stash） |
| `lastPublishCommit` 可达 | 不可达 | **警告** + 按首次发布全量收集 |
| `buildCommand` 执行成功 | 失败 | 该仓 `repo-error`，其余仓库继续（失败隔离，不阻断整任务） |
| milestone tag `vX.Y.Z` 不存在于业务仓库 | 已存在且指向不同 commit | **阻断**（要求 bump 版本） |
| build tag 同名 | 已存在且指向不同 commit | **自动规避**（§3 buildStamp 序号） |
| `!offline && hasRemote` 时远程可达 | 不可达 | **警告**（降级纯本地） |

### 6.5 executePublish —— 发布编排状态机 + journal 续跑

**状态机**（任务级）：

```
queued(入队) → preflight → [per-repo × N] → sync-unchanged → project-record → data-commit → done
                        ↘ repo-error（跳过该仓，继续下一仓）
                        ↘ 0 仓成功 → error（不落任何记录）
```

伪码：

```
async function executePublish(req, { onEvent, taskId }):
  journal = JournalStore.load(taskId)                        // 新建：{ status:'running', request:req }
  resume = journal.plan !== null                              // 已锁存计划 → 续跑模式

  // 1. 计划：续跑复用锁存 plan；否则重算并锁存
  plan = resume ? journal.plan : await planPublish(req)
  journal.plan = plan（原子写）

  // 2. 预检（续跑时跳过 steps 已 done 的仓库）
  for repo of plan.changed:
    if resume && journalStep(repo, 'push')?.state === 'done': continue   // 已完成仓库幂等跳过
    preflight → blocked → onEvent repo-error + step failed，标记该仓 failed，跳过

  // 3. 逐 changed 仓库（串行，try/catch 隔离）
  failedRepos = []
  for repo of plan.changed:
    if 该仓预检失败 → 跳过（已记 failed）
    try:
      onEvent repo-start(repoId, name)
      step(build):    buildCommand && !req.skipBuild → spawn 执行（输出逐行 onEvent log）
                      失败 → throw → repo-error（未打标签，无污染）
      step(tag-milestone): createTag('v{projectVersion}')          // 幂等：同 commit 已存在跳过
      step(tag-build):     createTag('build/v{projectVersion}.{stamp}')
      step(version-file):  writeVersionFiles(repo, plannedRepo, project)   // 幂等：内容一致跳过
      step(record):        写仓库 ReleaseRecord（kind:'repo'，tags: {build, milestone}）
                           + 更新 RepoDef.lastPublishCommit = head（saveProject 原子写）
      step(push):          !req.offline && hasRemote → pushTag × 2（失败 → warning 降级，pushed:false）
      onEvent repo-done(repoId, `${name} → ${version}`)
    catch e:
      onEvent repo-error(repoId, message)
      failedRepos.push(repoId)
      journal.steps 标记 failed（继续下一仓）

  // 4. 未变动仓库同步基版
  for repo of plan.syncedOnly:
    if !repo.writeVersionFile: continue
    syncUnchangedVersionFile(repo, project)      // 仅 version.json 基版字段，无标签无记录

  // 5. 项目聚合记录
  if 成功仓数 === 0:
    onEvent error('全部仓库失败，未生成发布记录')
    journal.status = 'failed'；return { releaseId: null, failedRepos }
  projectRecord = {
    kind:'project', scopeId, scopeName, version: projectVersion, baseVersion: project.version,
    buildStamp, bump, date, commits: 全量提交, stats: 聚合,
    logs: { internal/external: { content: req.*Content ?? draft, autoDraft: draft, state: 推断 } },
    repos: 成功仓的 RepoReleaseRef[], tags: { milestone: 'v{projectVersion}' },
    pushed: 所有成功仓均推成功（含 syncedOnly 无推送），builtBy: APP_NAME
  }
  store.writeRecord(projectRecord)
  project.version = projectVersion（saveProject 原子写）

  // 6. 数据仓库里程碑 + commit/push
  git.createTag(dataDir, 'v{projectVersion}')        // 数据仓库里程碑标签（业务历史对齐）
  store.commitRecords(`release(project:${scopeId}): ${projectVersion}`)
  !req.offline → store.syncDataRepo('push')（失败 → warning）

  // 7. 收尾
  onEvent done('发布完成', { releaseId, version: projectVersion, failedRepos })
  journal.status = 'done'（保留文件，不删除）
  return { releaseId, failedRepos }
```

**journal 落盘与续跑语义**（journal.ts，`JournalStore`）：

- **写入时机**：每个 step 完成后原子写（tmp + rename）；进程崩溃最多丢失最后一个未落盘 step。
- **step 幂等**（续跑安全）：tag 创建（同 commit 已存在 → 跳过）、version.json / 记录（内容一致 → 跳过，不一致 → 报错）、push（重复推送无害）、data-commit（无变更不产生空提交）。
- **启动恢复**（server 启动序列）：`JournalStore.scanInterrupted()` → `status==='running'` 的 journal 标记 `interrupted`，SSE 广播警告「检测到中断的发布任务 t_...，可续跑」。
- **续跑触发**：用户再次 `POST /api/publish`（同 projectId）→ server 发现同 projectId 存在 `running/interrupted` journal → **复用其 taskId 与锁存 plan**（忽略新请求的 bump/repoIds，避免版本漂移），从断点继续；已完成仓库因 step 全部 `done` 被幂等跳过。
- **done/failed 的 journal**：保留最近 20 份供审计，更早的启动时清理。
- 任务执行期间项目锁（api.md §1.4）防止项目定义被并发修改。

### 6.6 writeVersionFiles / syncUnchangedVersionFile

```ts
export async function writeVersionFiles(repo: RepoDef, plan: PlannedRepo, project: ProjectDef, buildStamp: string, prevRecordVersion?: string): Promise<void>
```

伪码：

```
if repo.writeVersionFile === false: return                       // 零侵入开关
outDir = join(repo.path, repo.outputDir ?? 'public')；mkdir -p
version.json  = { version: plan.version, build: buildStamp, buildTime: ISO now }
  已存在且 version/build 与本次一致 → 跳过（幂等，不重复写）
  已存在且 version 等于上次发布记录版本（prevRecordVersion，来自最新一条 repo 记录）→ 正常覆盖
  其余（存在且被外部改动、与计划不一致）→ throw（阻断避免误覆盖）
version-history.json = 追加一条 { version, build, buildTime }（不存在则创建数组；原子写）
```

```ts
export async function syncUnchangedVersionFile(repo: RepoDef, project: ProjectDef): Promise<void>
```

伪码：

```
if repo.writeVersionFile === false: return
version.json 已存在 → 仅更新 version 字段 = project.version（基版同步，build/buildTime 保持上次值）
不存在 → 写入 { version: project.version, build: '', buildTime: '' }（空构建占位）
version-history.json 追加 { version: project.version, build: 上次值 ?? '', buildTime: 上次值 ?? '', sync: true }
```

> 语义：未变动仓库**不建标签、不写发布记录**，只把 version.json 的基版字段对齐到新项目版本，保证全局版本一致（R12）。

---

## 7. files.ts —— 文件树与文件读取

```ts
export function listTree(repoPath: string, dirPath: string): TreeNode
export function readFileContent(repoPath: string, filePath: string): FileContent
```

常量（模块内私有）：`MAX_TREE_ENTRIES = 1000`、`MAX_FILE_READ = 512 * 1024`（512KB）、`MAX_FILE_LINES = 5000`。目录忽略规则：内置忽略目录 `DEFAULT_IGNORE_DIRS`（shared 常量）+ 硬编码排除 `.git` + 仓库根 `.gitignore` 简化解析。

### 7.1 safeAbs —— 路径规范化 + 符号链接加固（两层校验）

```
safeAbs(repoPath, relPath):
  root = path.resolve(repoPath)；abs = path.resolve(root, relPath)
  if abs !== root && !abs.startsWith(root + path.sep): throw '路径越界'      // 第一层：词法越界（含 .. 逃逸）
  try: real = fs.realpathSync(abs)                                          // 第二层：解析符号链接/junction
  catch: return abs                                                        // 目标不存在（写入场景）→ 回退原路径
  realRoot = fs.existsSync(root) ? fs.realpathSync(root) : root
  if real !== realRoot && !real.startsWith(realRoot + path.sep):
    throw '路径越界（符号链接指向仓库外）'                                   // 拒绝指向仓库外的 symlink/junction
  return abs
```

边界：`dirPath/filePath` 为空串时 resolve 结果为仓库根本身（合法）；`..` 逃逸在词法层拦截；仓库内**指向仓库外**的符号链接/junction 在 realpath 层被拒绝（仓库内互相链接允许）。

### 7.2 listTree —— 懒加载目录树（逐层展开）

```
abs = safeAbs(repoPath, dirPath)
不存在 → throw '目录不存在: {dirPath}'；非目录 → throw '不是目录: {dirPath}'
patterns = loadIgnorePatterns(repoPath)   // 简化 .gitignore：支持 *、**、尾 / 目录模式；不支持 ! 取反
for name of fs.readdirSync(abs):
  已收集 ≥ 1000 条目 → truncated = true，停止收集
  name === '.git' → 跳过；statSync 失败 → 跳过
  目录且 ∈ DEFAULT_IGNORE_DIRS → 跳过
  isIgnored(rel, patterns) → 跳过        // 模式含 / 对全相对路径匹配；仅 basename 模式对末段匹配
  entries.push({ name, type: dir|file, size: 文件才给大小 })
entries 排序：目录在前，同类按 name.localeCompare
return { path: relDir（正斜杠、去前导 /）, entries, truncated }
```

边界：目录不存在/非目录抛错（server 层转译为 400/404）；超 1000 条目置 `truncated=true`（前端展示「已截断」）；不做递归，前端逐层懒加载。

### 7.3 readFileContent —— 文件内容读取

```
abs = safeAbs(repoPath, filePath)
不存在 → throw '文件不存在'；是目录 → throw '是目录'
st.size > 512KB → 返回 { binary:false, truncated:true, content:'', lines:0 }（不读取）
buffer 含 0x00（NUL）→ { binary:true, truncated:false, content:'', lines:0 }
text 按 /\r?\n/ 拆行；行数 > 5000 → 截断前 5000 行，truncated:true
正常 → { path: rel, size, binary:false, truncated:false, content, lines }
```

边界：二进制基于 NUL 字节探测；超限返回空 content 而非报错，前端按 `truncated/binary` 徽标提示（R4 文件查看）。

---

## 8. 备份与一致性对比（R19）

> 共享类型（types.ts R19 扩展）：`BackupItem`、`RepoBackupRef`、`BackupConfig`（`AppConfig.backup`，缺省 `{ enabled: true, source: 'both', onFailure: 'warn' }`）、`FileCompareStatus`（四类差异：added/removed/modified/same）、`FileCompareItem`、`FileSideInfo`、`CompareResult`。

### 8.1 backup/ —— 发布备份（5 文件）

| 文件 | 导出 | 职责 |
|---|---|---|
| `index.ts` | `backupRepo(opts: BackupRepoOptions): Promise<RepoBackupRef \| null>`、`BackupError`、`BackupRepoOptions`、常量 `SOURCE_BUNDLE='source.bundle'`/`SOURCE_ARCHIVE='source.tar.gz'`/`SOURCE_SHA256='source.sha256'`；re-export `backupArtifact/ARTIFACT_MANIFEST/ARTIFACT_TAR/buildManifest/readManifest/hashFile` | 一次发布一仓编排：bundle → 快照 → sha256 清单 → 产物归档；任一环节失败抛 `BackupError` 并**清理本次运行创建的文件**（不删既有旧物）；全部跳过（无 items）返回 null |
| `source.ts` | `createBundle(repoPath, outFile)`、`createArchiveGz(repoPath, ref, outFile)` | 源码备份：`git bundle create {out} --all`（全历史全标签，可 clone 恢复，300s 超时）；`git archive --format=tar {ref}` 管道 zlib gzip（level 6）流式写盘，快照仅已跟踪文件（.gitignore 语义由 git 原生保证） |
| `artifact.ts` | `backupArtifact(repoPath, artifactDir, outDir): Promise<ArtifactBackupResult \| null>`、`ARTIFACT_TAR='artifact.tar.gz'`、`ARTIFACT_MANIFEST='artifact-manifest.json'` | 产物归档：`RepoDef.artifactDir` 目录整体归档（即使被业务 .gitignore 也不丢）；目录不存在/为空 → null（跳过）；幂等：tar/manifest 已存在且 files 一致 → 直接返回 |
| `manifest.ts` | `hashFile(file)`、`walkFiles(root, {skipDirs})`、`buildManifest(root)`、`readManifest(file)`、`BACKUP_SKIP_DIRS={.git,.svn,.hg,node_modules}`、接口 `Manifest/ManifestFile` | 目录 → 哈希清单（流式 sha256 不整读内存；跳过符号链接防环）；`Manifest = { schemaVersion:1, createdAt, root, files:[{path,sha256,size}], totals:{files,bytes} }` |
| `tar.ts` | `createTarGz(files, outFile)` | 零依赖 ustar tar.gz：512 字节头、>100 字节路径（含中文）走 GNU 'L' longname 扩展头、自动补目录条目、512 对齐、1024 字节结尾块，全程流式不落临时文件 |

**存储语义**：大文件落 `{backupRoot}/{projectId}/{repoId}/{versionSafe(version)}/`（`backupRoot = BackupConfig.dir ?? ~/.bxverse/backups`），**不进数据仓库**；元数据 `RepoBackupRef` 经 `DataStore.writeBackupMeta` 写 `data/backups/{releaseId}-{repoId}.json`，**随发布记录一并 commit 入数据仓库**（git 审计），配套 `readBackupMeta/listBackupMeta/deleteBackupMeta`（§5.1）；`ReleaseRecord.backups` 挂 `RepoBackupRef[]`。快照 ref 优先取本次 build tag，其次 HEAD full hash。

**executePublish 挂接**（2.3 步，journal phase `backup`）：`wantSource = backup.enabled && req.backupSource !== false`、`wantArtifact = backup.enabled && req.backupArtifacts !== false`；两者皆否 → 跳过备份步骤。失败策略 `AppConfig.backup.onFailure`：`'fail'` → 抛错致该仓库失败；`'warn'`（缺省）→ 记 log 降级，发布继续。

### 8.2 compare/ —— 三层一致性对比（compare/index.ts）

```ts
export async function compareSource(repoPath: string, from: string | null, to: string): Promise<CompareResult>
// ① 源码级：git diff --numstat + --name-status --no-renames 两次调用按 path 合并
//    （--numstat 与 --name-status 不能同出；二进制文件 insertions/deletions 记 0）
//    from=null = 首次发布全量；返回 kind:'source'，left = from ?? '(root)'，right = to；任一命令失败抛错

export function compareManifests(left: Manifest, right: Manifest, names?: { left?: string; right?: string }): CompareResult
// ② 产物级：两份哈希清单按相对路径合并——仅左 → removed、仅右 → added、
//    sha256 或 size 不同 → modified、一致 → same；kind:'artifact'，left/right 取 names 或 root

export async function verifyManifest(dir: string, manifest: Manifest): Promise<CompareResult>
// ③ 校验级：重算目录内实际文件哈希并与清单比对——清单有实际无 → removed、
//    实际有清单无 → added、哈希不一致 → modified、一致 → same；kind:'verify'
```

返回类型：`CompareResult = { kind: 'source' | 'artifact' | 'verify', left?, right?, files: FileCompareItem[], totals: { added, removed, modified, same } }`；`FileCompareItem = { path, status: FileCompareStatus, insertions?, deletions?, left?: FileSideInfo, right?: FileSideInfo }`（`insertions/deletions` 仅源码级填充；`FileSideInfo = { sha256?, size? }`）。

---

## 9. 边界情况汇总表

| 场景 | 处理 |
|---|---|
| 空仓库（无 commit） | `head/branch=''`、`commits=[]`、`changed=false`；预检阻断发布（提示先提交） |
| 首次发布（`lastPublishCommit=null`） | `commitsSince --root` 全量收集；`diffStat` 对空树 hash；无 milestone tag 冲突 |
| 仓库无任何 tag | `latestTag=null`、`buildTags=[]`、`milestoneTag=null`；版本建议由提交历史推断 |
| milestone tag 撞车（同版本不同 commit） | 预检**阻断**，要求 bump 版本 |
| build tag 撞车（同 stamp 不同 commit） | buildStamp 自动加序号（8→10 位）规避，plan.warnings 记录 |
| 基准不可达（force-push/GC） | 警告 + 按首次发布全量收集 |
| 工作树 dirty > 0 | 预检阻断（`dirtyCount` 仅统计已跟踪文件） |
| 大仓库（提交多/文件多/克隆慢） | commitsSince 截断 3000 条（warning）；diffStat 超时降级全 0（warning）；克隆 120s 超时；文件树懒加载 + `truncated` |
| 文件树/读取超限 | 条目 > 1000 / 大小 > 512KB / 行数 > 5000 → `truncated=true`（空 content），不报错 |
| 仓库内符号链接/junction 指向仓库外 | `safeAbs` realpath 解析后拒绝（「路径越界（符号链接指向仓库外）」） |
| 备份失败（缺省 `onFailure='warn'`） | 降级为警告，发布继续；`'fail'` 时该仓库发布中止（repo-error 隔离） |
| 备份产物目录不存在/为空 | `backupArtifact` 返回 null → 跳过（不视为失败）；全部跳过时 `backupRepo` 返回 null |
| 提交级排除后某仓无剩余提交 | 全部排除且 dirty=0 → 降级 syncedOnly（仅同步基版）；排除数记入 plan.warnings |
| 单仓构建失败 | `repo-error` 隔离：跳过该仓继续；该仓 `lastPublishCommit` 未更新，下轮自动重新检测 |
| 全部仓库失败 | `error` 事件，不落任何记录 |
| 无远程 / offline | 纯本地降级：跳过 push，`pushed:false` + warning |
| 数据仓库 pull 冲突 | 保留本地 + 警告，人工解决（api.md §9 `SYNC_CONFLICT`） |
| 进程崩溃中断 | journal 每 step 原子落盘；重启标 `interrupted`；重新发起同项目发布 → 续跑跳过已完成仓库 |

---

## 10. 与 @bxverse/shared 类型的对照表

| core 模块 / 函数 | 输入（shared 类型） | 输出（shared 类型） |
|---|---|---|
| git.isRepo/head/dirtyCount/... | `string`（路径） | `boolean/string/number` |
| git.commitsSince | `string \| null`（基准） | `CommitInfo[]` |
| git.diffStat | `string \| null` | `DiffStat` |
| version.suggestBump | `CommitInfo[]` | `BumpType` |
| version.bumpSemver / hybridVersion | `string` / `BumpType` | `string` |
| changelog.classifyCommit | `string`（subject） | `{ type: CommitType; scope: string \| null; breaking: boolean }` |
| changelog.computeStats | `CommitInfo[]`, `DiffStat?` | `Stats` |
| changelog.renderInternal / renderExternal | `CommitInfo[]` + opts | `string`（Markdown，写入 `ReleaseLog.content/autoDraft`） |
| store.loadAppConfig / saveAppConfig | — / `AppConfig` | `AppConfig` |
| store.DataStore.writeRecord / listRecords | `ReleaseRecord` / `scopeId` | — / `ReleaseRecord[]` |
| engine.collectChanges | `RepoDef` | `RepoStatus` |
| engine.detectChanged | `RepoDef[]`, `Record<string, RepoStatus>` | `{ changed: RepoDef[]; unchanged: RepoDef[] }` |
| engine.planPublish | `PublishRequest` | `PublishPlan`（含 `PlannedRepo[]`、`syncedOnly`） |
| engine.executePublish | `PublishRequest` + `onEvent` | `{ releaseId, failedRepos }`，经回调发出 `PublishEvent`（7 种 type） |
| engine.writeVersionFiles | `RepoDef`, `PlannedRepo`, `ProjectDef` | `void`（写 version.json/version-history.json） |
| engine.syncUnchangedVersionFile | `RepoDef`, `ProjectDef` | `void` |
| files.listTree / readFileContent | `string`（repoPath + 相对路径） | `TreeNode` / `FileContent` |
| backup.backupRepo | `BackupRepoOptions`（私有接口） | `RepoBackupRef \| null`（大文件不返回内容，仅引用） |
| compare.compareSource / compareManifests / verifyManifest | `string` / `Manifest` | `CompareResult`（added/removed/modified/same 四类差异 + totals） |
| 事件流整体 | `PublishEvent`（types.ts 定稿，无 taskId 字段——按任务过滤由 server SSE 层完成） | — |

> 私有类型（`Journal/JournalStep/GitResult/SyncResult`）不出包；跨进程数据一律 shared 类型。

---

## 11. 与需求文档的对应关系

| 本文档章节 | 对应需求编号 | 说明 |
|---|---|---|
| §1 定位（数据权威工具无痕、零依赖） | R15、R10 | 不迁就旧实现；纯本地/远程双模式 |
| §2 git.ts（提交解析/标签幂等/克隆） | R3、R13、R10 | 仓库接入两种方式、改动点收集、tag 联动 |
| §2.2 commitsSince 全量/增量 | R9、R13 | 自动化检测、相对上次发布的提交与文件 |
| §3 version.ts（三方案/撞名规避） | R8、R12 | X.Y.Z / 混合时间戳、仓库随项目基版联动 |
| §4 changelog.ts（internal 全量/external 分节） | R7、R9、R14 | 双轨日志自动生成 + autoDraft 留底人工可控 |
| §5 store.ts（app.json/数据仓库/凭据） | 非功能·安全、R10 | 发布数据 git 版本化、凭据独立、多机同步 |
| §6.1/6.2 检测与轮询 | R13、非功能·自动化 | 改动点可见、轮询检测缓存 |
| §6.3 planPublish（含 excludeCommits 提交级排除） | R9、R14 | 版本建议、日志草稿、dry-run 预览全自动、人工甄别提交 |
| §6.4 preflight | 非功能·可靠性 | 预检阻塞项、发布前校验 |
| §6.5 executePublish + journal 续跑 | 非功能·可靠性、R12、R10 | 失败隔离、中断续跑、未变动仓库同步基版、远程降级 |
| §6.6 version 文件写入 | R5、R15 | 版本文件落业务仓库（可关，零侵入） |
| §7 files.ts（文件树/文件读取） | R4 | 仓库文件树与文件内容查看（懒加载、截断保护、符号链接加固） |
| §8 备份与一致性对比 | R19 | 发布自动备份（bundle/快照/产物）+ manifest 哈希清单 + 三层一致性对比（源码/清单/校验） |
| §9 边界情况汇总 | R15、R16 | 完整性、足够好用 |
| §10 类型对照 | 全局契约 | 与 shared 定稿类型一一对应 |

