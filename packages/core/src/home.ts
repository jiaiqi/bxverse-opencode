// packages/core/src/home.ts
// 家目录解析与目录确保（store 内部使用，私有模块）
// BX_HOME 环境变量优先，否则 ~/.bxverse（APP_DATA_DIR_NAME）

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { APP_DATA_DIR_NAME } from '@bxverse/shared'

export interface HomeDirs {
  /** 家目录根（app.json / credentials.json 所在地） */
  root: string
  /** 数据仓库目录（git） */
  dataDir: string
  /** 克隆仓库根 */
  reposDir: string
  /** 发布 journal 目录 */
  journalDir: string
  /** 备份大文件目录（R19；AppConfig.backup.dir 可覆盖） */
  backupsDir: string
  /** server 运行日志目录 */
  logsDir: string
  /** 原子写中转目录 */
  tmpDir: string
}

export function resolveHome(root?: string): HomeDirs {
  const r = root ?? process.env.BX_HOME ?? path.join(os.homedir(), APP_DATA_DIR_NAME)
  return {
    root: r,
    dataDir: path.join(r, 'data'),
    reposDir: path.join(r, 'repos'),
    journalDir: path.join(r, 'journal'),
    backupsDir: path.join(r, 'backups'),
    logsDir: path.join(r, 'logs'),
    tmpDir: path.join(r, 'tmp'),
  }
}

export function ensureDirs(home: HomeDirs = resolveHome()): HomeDirs {
  for (const dir of [home.root, home.dataDir, home.reposDir, home.journalDir, home.backupsDir, home.logsDir, home.tmpDir]) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return home
}

/**
 * 原子写：先写临时文件再 rename（同目录内 rename 保证原子性）。
 * 全局约定：app.json / credentials.json / journal / 发布记录全部遵守。
 */
export function atomicWrite(file: string, content: string, mode?: number): void {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.tmp-${process.pid}`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(tmp, content, mode ? { mode } : 'utf8')
  fs.renameSync(tmp, file)
}
