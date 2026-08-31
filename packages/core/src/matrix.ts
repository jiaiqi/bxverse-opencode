// packages/core/src/matrix.ts
// 多项目跨工程版本矩阵聚合（zero-dep pure over AppConfig）—— 跨项目 × 跨仓库的版本对齐视图。
// 端到端 0 入侵：纯聚合展示，只走 status（pollCache / engine.collectChanges）+ dataStore.listRecords
// 两条只读路径，不动工作区、不打标签、不写 app.json、不写数据仓库、不动业务仓库。
//
// 设计要点：
//   - 输入：AppConfig + getStatus(repo) + dataStore
//   - 输出：VersionMatrix（结构化 + drift 标记 + totals）
//   - 并行：仓库级 status + lastRelease 走 runWithPool 上限 6（与 overview/doctor 同源）
//   - 列归一：同 path（normalize 后小写 + 正斜杠）合为一列；列按 occurrences desc, app asc 排序
//   - 行：项目按配置顺序输出
//   - drift：同 app 列下，跨项目 version 集合大小 > 1 → drift 列
//   - 容错：单仓 status 失败 → cell.version='-' + pollFailed=true；单仓 lastRelease 失败 → null

import { runWithPool } from './pool'
import type {
  AppConfig,
  ProjectDef,
  RepoDef,
  RepoStatus,
  VersionMatrix,
  MatrixColumn,
  MatrixCell,
  MatrixProjectRow,
} from '@bxverse/shared'
import type { DataStore } from './store'

export interface BuildMatrixOptions {
  /** 并发上限（默认 6） */
  concurrency?: number
}

export async function buildMatrix(
  cfg: AppConfig,
  getStatus: (repo: RepoDef) => Promise<RepoStatus>,
  dataStore: DataStore,
  options: BuildMatrixOptions = {},
): Promise<VersionMatrix> {
  const concurrency = options.concurrency ?? 6
  const projectsCfg = cfg.projects ?? []
  const allRepos: { repo: RepoDef; project: ProjectDef }[] = []
  for (const p of projectsCfg) {
    for (const r of p.repos ?? []) {
      allRepos.push({ repo: r, project: p })
    }
  }

  // 1. 列归一：同 path → 同一列（首个出现的 RepoDef.name 为列 app 名）
  const colByPath = new Map<string, MatrixColumn>()
  for (const { repo } of allRepos) {
    const key = normalizePath(repo.path)
    if (!colByPath.has(key)) {
      colByPath.set(key, {
        app: repo.name,
        name: repo.displayName || repo.name,
        occurrences: 0,
        displayName: repo.name,
      })
    }
    colByPath.get(key)!.occurrences += 1
  }
  for (const col of colByPath.values()) {
    col.displayName = col.occurrences > 1 ? `${col.app} · ${col.occurrences} 项目` : col.app
  }
  const columns = [...colByPath.values()].sort((a, b) => {
    if (b.occurrences !== a.occurrences) return b.occurrences - a.occurrences
    return a.app.localeCompare(b.app)
  })
  const pathToColApp = new Map<string, string>()
  for (const { repo } of allRepos) {
    const col = colByPath.get(normalizePath(repo.path))
    if (col) pathToColApp.set(repo.id, col.app)
  }

  // 2. 收集 status + lastRelease（并行；listRecords 走 {full:false, limit:1} 索引快速路径）
  const statusMap = new Map<string, RepoStatus | null>()
  const lastReleaseMap = new Map<
    string,
    { version: string; date: string; daysAgo: number } | null
  >()
  await runWithPool(allRepos, concurrency, async ({ repo }) => {
    try {
      statusMap.set(repo.id, await getStatus(repo))
    } catch {
      statusMap.set(repo.id, null)
    }
    try {
      const records = await dataStore.listRecords(repo.id, { limit: 1, full: false })
      const last = records[0]
      lastReleaseMap.set(
        repo.id,
        last
          ? {
              version: last.version,
              date: last.date.slice(0, 10),
              daysAgo: daysAgoFromDate(last.date),
            }
          : null,
      )
    } catch {
      lastReleaseMap.set(repo.id, null)
    }
  })

  // 3. 行（项目）+ 单元格
  const cellByRepoId = new Map<string, MatrixCell>()
  const projects: MatrixProjectRow[] = []
  for (const p of projectsCfg) {
    const cells: Record<string, MatrixCell> = {}
    let changedCount = 0
    let dirtyCount = 0
    for (const r of p.repos ?? []) {
      const s = statusMap.get(r.id)
      const lr = lastReleaseMap.get(r.id) ?? null
      let cell: MatrixCell
      if (!s) {
        cell = {
          absent: false,
          version: '-',
          lastRelease: lr,
          changed: false,
          commits: 0,
          pollFailed: true,
          // 扩展：R31（pollFailed 时仍填，便于前端定位）
          app: r.name,
          name: r.displayName || r.name,
          repoId: r.id,
        }
      } else {
        const version = s.versionFile?.version || p.version
        if (s.changed) changedCount += 1
        if (s.dirty > 0) dirtyCount += 1
        cell = {
          absent: false,
          version,
          lastRelease: lr,
          changed: s.changed,
          commits: s.commits.length,
          repoKind: s.repoKind,
          // 扩展：R31 注入 cell.app/name/repoId 让前端按列对齐
          app: r.name,
          name: r.displayName || r.name,
          repoId: r.id,
        }
      }
      cells[r.id] = cell
      cellByRepoId.set(r.id, cell)
    }
    // 项目 lastRelease
    let projectLast: MatrixProjectRow['lastRelease'] = null
    try {
      const records = await dataStore.listRecords(p.id, { limit: 1, full: false })
      const last = records[0]
      if (last) {
        projectLast = {
          version: last.version,
          date: last.date.slice(0, 10),
          daysAgo: daysAgoFromDate(last.date),
        }
      }
    } catch {
      projectLast = null
    }
    projects.push({
      id: p.id,
      name: p.name,
      version: p.version,
      lastRelease: projectLast,
      changedCount,
      dirtyCount,
      cells,
    })
  }

  // 4. drift：按列（app 名）聚合版本集合，>1 不齐
  const appVersions = new Map<string, Set<string>>()
  for (const { repo } of allRepos) {
    const app = pathToColApp.get(repo.id)
    if (!app) continue
    const cell = cellByRepoId.get(repo.id)
    if (!cell || cell.pollFailed || cell.version === '-') continue
    if (!appVersions.has(app)) appVersions.set(app, new Set())
    appVersions.get(app)!.add(cell.version)
  }
  const driftColumns: string[] = []
  for (const [app, versions] of appVersions) {
    if (versions.size > 1) driftColumns.push(app)
  }

  // 5. totals
  const totals = {
    projects: projects.length,
    repos: allRepos.length,
    changed: projects.reduce((s, p) => s + p.changedCount, 0),
    driftColumns: driftColumns.length,
  }

  return {
    generatedAt: new Date().toISOString(),
    columns,
    projects,
    driftColumns,
    totals,
  }
}

/** 路径归一（Windows 兼容：反斜杠转正斜杠 + 小写） */
function normalizePath(p: string): string {
  return p.replaceAll('\\', '/').toLowerCase()
}

/** 距今天数（防 NaN：解析失败回退 0） */
function daysAgoFromDate(d: string): number {
  const t = new Date(d).getTime()
  if (Number.isNaN(t)) return 0
  return Math.max(0, Math.floor(Date.now() / 86_400_000) - Math.floor(t / 86_400_000))
}
