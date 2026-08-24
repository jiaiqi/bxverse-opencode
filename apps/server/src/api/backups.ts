// apps/server/src/api/backups.ts
// 备份与一致性对比（R19/M6，api.md §10.5）：
//   GET    /api/repos/:pid/:rid/backups                 该仓库历次备份列表
//   GET    /api/backups/:releaseId/:repoId              备份元数据
//   GET    /api/backups/download/:releaseId/:repoId/:kind  备份文件流式下载
//   DELETE /api/backups/:releaseId/:repoId              删除备份文件与元数据
//   POST   /api/backups/compare                         产物级对比（两次发布清单）
//   POST   /api/backups/verify                          备份文件完整性校验（重算 sha256）
//   GET    /api/repos/:pid/:rid/diff?from=&to=          源码级对比（git diff）

import fs from 'node:fs'
import path from 'node:path'
import type { AppConfig, CompareResult, RepoBackupRef } from '@bxverse/shared'
import { backup, compare, store } from '@bxverse/core'
import type { Ctx } from '../http/router'
import { apiError, readJsonBody, sendError, sendJson } from '../http/json'
import { assertBackupCleanupBody, assertRestoreBody } from '../validate'

const KIND_FILE: Record<string, string> = {
  'source-bundle': backup.SOURCE_BUNDLE,
  'source-archive': backup.SOURCE_ARCHIVE,
  artifact: backup.ARTIFACT_TAR,
  'artifact-manifest': backup.ARTIFACT_MANIFEST,
}

function resolveBackupRoot(cfg: AppConfig): string {
  return cfg.backup?.dir?.trim() || path.join(store.resolveHome().root, 'backups')
}

function backupDirOf(cfg: AppConfig, meta: RepoBackupRef): string {
  return path.join(resolveBackupRoot(cfg), meta.projectId, meta.repoId, store.versionSafe(meta.version))
}

export function register(
  router: import('../http/router').Router,
  services: { loadCfg: () => Promise<AppConfig>; getDataStore: () => store.DataStore },
): void {
  // ---------- 列表 ----------
  router.get('/api/repos/:pid/:rid/backups', async (ctx: Ctx) => {
    const cfg = await services.loadCfg()
    const project = cfg.projects.find(p => p.id === ctx.params.pid)
    if (!project) throw apiError(404, 'NOT_FOUND', `项目不存在: ${ctx.params.pid}`)
    if (!project.repos.some(r => r.id === ctx.params.rid)) {
      throw apiError(404, 'NOT_FOUND', `仓库不存在或不属于该项目: ${ctx.params.rid}`)
    }
    const n = Math.min(Math.max(Number(ctx.query.get('n') ?? 20), 1), 100)
    const metas = (await services.getDataStore().listBackupMeta())
      .filter(m => m.repoId === ctx.params.rid)
      .slice(0, n)
    sendJson(ctx.res, 200, { items: metas })
  })

  // ---------- 元数据 ----------
  router.get('/api/backups/:releaseId/:repoId', async (ctx: Ctx) => {
    await services.loadCfg()
    const meta = await services.getDataStore().readBackupMeta(ctx.params.releaseId, ctx.params.repoId)
    if (!meta) throw apiError(404, 'NOT_FOUND', '备份元数据不存在')
    sendJson(ctx.res, 200, meta)
  })

  // ---------- 下载 ----------
  router.get('/api/backups/download/:releaseId/:repoId/:kind', async (ctx: Ctx) => {
    const cfg = await services.loadCfg()
    const meta = await services.getDataStore().readBackupMeta(ctx.params.releaseId, ctx.params.repoId)
    if (!meta) throw apiError(404, 'NOT_FOUND', '备份元数据不存在')
    const fileName = KIND_FILE[ctx.params.kind]
    if (!fileName) throw apiError(400, 'VALIDATION', `kind 非法（支持 ${Object.keys(KIND_FILE).join('/')}）`)
    let itemFile: string
    if (ctx.params.kind === 'artifact-manifest') {
      // 清单不是元数据 item（由产物备份派生），仅要求存在产物归档
      if (!meta.items.some(i => i.kind === 'artifact')) throw apiError(404, 'NOT_FOUND', '该备份不含产物')
      itemFile = fileName
    } else {
      const item = meta.items.find(i => KIND_FILE[i.kind] === fileName)
      if (!item) throw apiError(404, 'NOT_FOUND', '该备份不含此文件')
      itemFile = item.file
    }
    const file = path.join(backupDirOf(cfg, meta), itemFile)
    if (!fs.existsSync(file)) throw apiError(404, 'NOT_FOUND', `备份文件缺失: ${itemFile}`)
    const stat = fs.statSync(file)
    ctx.res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': stat.size,
      'Content-Disposition': `attachment; filename="${itemFile}"; filename*=UTF-8''${encodeURIComponent(itemFile)}`,
      'Cache-Control': 'no-store',
    })
    const stream = fs.createReadStream(file)
    stream.on('error', () => {
      if (!ctx.res.headersSent) {
        sendError(ctx.res, Object.assign(new Error('文件读取失败'), { status: 500, code: 'READ_FAILED' }))
      } else {
        try {
          ctx.res.destroy()
        } catch {
          // ignore
        }
      }
    })
    stream.pipe(ctx.res)
  })

  // ---------- 删除 ----------
  router.delete('/api/backups/:releaseId/:repoId', async (ctx: Ctx) => {
    const cfg = await services.loadCfg()
    const ds = services.getDataStore()
    const meta = await ds.readBackupMeta(ctx.params.releaseId, ctx.params.repoId)
    if (!meta) throw apiError(404, 'NOT_FOUND', '备份元数据不存在')
    // 先删大文件目录（best-effort），再删元数据
    try {
      fs.rmSync(backupDirOf(cfg, meta), { recursive: true, force: true })
    } catch (e) {
      throw apiError(500, 'DELETE_FAILED', `备份文件删除失败: ${(e as Error).message}`)
    }
    await ds.deleteBackupMeta(ctx.params.releaseId, ctx.params.repoId)
    sendJson(ctx.res, 200, { ok: true })
  })

  // ---------- 产物级对比 ----------
  router.post('/api/backups/compare', async (ctx: Ctx) => {
    const cfg = await services.loadCfg()
    const ds = services.getDataStore()
    const body = (await readJsonBody(ctx.req)) as Record<string, unknown>
    const kind = String(body.kind ?? 'artifact')
    if (kind !== 'artifact') throw apiError(422, 'COMPARE_UNSUPPORTED', `不支持的对比类型: ${kind}`)
    const left = body.left as { releaseId?: string; repoId?: string } | undefined
    const right = body.right as { releaseId?: string; repoId?: string } | undefined
    if (!left?.releaseId || !left.repoId || !right?.releaseId || !right.repoId) {
      throw apiError(400, 'VALIDATION', 'left/right 必须包含 releaseId 与 repoId')
    }
    const lm = await ds.readBackupMeta(left.releaseId, left.repoId)
    const rm = await ds.readBackupMeta(right.releaseId, right.repoId)
    if (!lm || !rm) throw apiError(404, 'NOT_FOUND', '备份元数据不存在（可能尚未发布备份）')

    const lDir = backupDirOf(cfg, lm)
    const rDir = backupDirOf(cfg, rm)
    const lManifest = await backup.readManifest(path.join(lDir, backup.ARTIFACT_MANIFEST))
    const rManifest = await backup.readManifest(path.join(rDir, backup.ARTIFACT_MANIFEST))
    if (!lManifest || !rManifest) {
      throw apiError(404, 'NOT_FOUND', '两侧产物清单缺失（可能该次发布未备份产物）')
    }
    const result: CompareResult = compare.compareManifests(lManifest, rManifest, {
      left: `${lm.version}（${lm.date.slice(0, 10)}）`,
      right: `${rm.version}（${rm.date.slice(0, 10)}）`,
    })
    sendJson(ctx.res, 200, result)
  })

  // ---------- 完整性校验 ----------
  router.post('/api/backups/verify', async (ctx: Ctx) => {
    const cfg = await services.loadCfg()
    const ds = services.getDataStore()
    const body = (await readJsonBody(ctx.req)) as Record<string, unknown>
    const releaseId = String(body.releaseId ?? '')
    const repoId = String(body.repoId ?? '')
    if (!releaseId || !repoId) throw apiError(400, 'VALIDATION', 'releaseId 与 repoId 必填')
    const meta = await ds.readBackupMeta(releaseId, repoId)
    if (!meta) throw apiError(404, 'NOT_FOUND', '备份元数据不存在')

    const dir = backupDirOf(cfg, meta)
    const files = await Promise.all(meta.items.map(async (i) => {
      const abs = path.join(dir, i.file)
      if (!fs.existsSync(abs)) {
        return {
          path: i.file,
          status: 'removed' as const,
          left: { sha256: i.sha256, size: i.size },
        }
      }
      try {
        const stat = fs.statSync(abs)
        const sha256 = await backup.hashFile(abs)
        const same = stat.size === i.size && sha256 === i.sha256
        return {
          path: i.file,
          status: same ? 'same' as const : 'modified' as const,
          left: { sha256: i.sha256, size: i.size },
          right: { sha256, size: stat.size },
        }
      } catch {
        return {
          path: i.file,
          status: 'removed' as const,
          left: { sha256: i.sha256, size: i.size },
        }
      }
    }))
    const totals = {
      added: 0,
      removed: files.filter(f => f.status === 'removed').length,
      modified: files.filter(f => f.status === 'modified').length,
      same: files.filter(f => f.status === 'same').length,
    }
    const result: CompareResult = { kind: 'verify', left: `${meta.version} 元数据`, right: dir, files, totals }
    sendJson(ctx.res, 200, result)
  })

  // ---------- 磁盘占用 ----------
  router.get('/api/backups/usage', async (ctx: Ctx) => {
    const ds = services.getDataStore()
    const metas = await ds.listBackupMeta()
    const projectId = ctx.query.get('projectId')?.trim() || undefined
    const repoId = ctx.query.get('repoId')?.trim() || undefined
    const filtered = metas.filter(m => (!projectId || m.projectId === projectId) && (!repoId || m.repoId === repoId))
    const usage = backup.getBackupUsage(filtered)
    sendJson(ctx.res, 200, usage)
  })

  // ---------- 保留策略清理 ----------
  router.post('/api/backups/cleanup', async (ctx: Ctx) => {
    const cfg = await services.loadCfg()
    const ds = services.getDataStore()
    const body = (await readJsonBody(ctx.req)) as Record<string, unknown>
    assertBackupCleanupBody(body)
    const retention = (body.retention as import('@bxverse/shared').BackupRetention | undefined) ?? cfg.backup?.retention
    if (!retention || (retention.keepLast == null && retention.maxBytes == null && retention.keepDays == null)) {
      throw apiError(400, 'VALIDATION', '未配置保留策略（keepLast / maxBytes / keepDays 至少一项）')
    }
    const projectId = body.projectId ? String(body.projectId) : undefined
    const repoId = body.repoId ? String(body.repoId) : undefined
    const dryRun = !!body.dryRun
    const result = await backup.enforceRetention({
      backupDir: resolveBackupRoot(cfg),
      dataStore: ds,
      retention,
      projectId,
      repoId,
      dryRun,
    })
    sendJson(ctx.res, 200, result)
  })

  // ---------- 恢复 ----------
  router.post('/api/backups/restore', async (ctx: Ctx) => {
    const body = (await readJsonBody(ctx.req)) as Record<string, unknown>
    assertRestoreBody(body)
    const releaseId = String(body.releaseId ?? '').trim()
    const repoId = String(body.repoId ?? '').trim()
    const kind = String(body.kind ?? '').trim() as 'source-bundle' | 'source-archive' | 'artifact'
    const targetDir = String(body.targetDir ?? '').trim()
    const cfg = await services.loadCfg()
    const meta = await services.getDataStore().readBackupMeta(releaseId, repoId)
    if (!meta) throw apiError(404, 'NOT_FOUND', '备份元数据不存在')
    const fileName = KIND_FILE[kind]
    if (!fileName) throw apiError(400, 'VALIDATION', `不支持的 kind: ${kind}`)
    // artifact-manifest 不可恢复，仅 artifact
    if (kind === 'artifact' && !meta.items.some(i => i.kind === 'artifact')) throw apiError(404, 'NOT_FOUND', '该备份不含产物')
    const srcFile = path.join(backupDirOf(cfg, meta), fileName)
    if (!fs.existsSync(srcFile)) throw apiError(404, 'NOT_FOUND', `备份文件缺失: ${fileName}`)
    // S6 收紧：白名单 + 空目录校验（400 明确失败，不落入 500）
    const resolvedTarget = path.resolve(targetDir)
    const homeRoot = path.resolve(store.resolveHome().root)
    if (resolvedTarget !== homeRoot && !resolvedTarget.startsWith(homeRoot + path.sep)) {
      throw apiError(400, 'VALIDATION', `targetDir 必须位于 BX_HOME 目录下（仅允许 ${homeRoot} 及其子目录）`)
    }
    if (fs.existsSync(resolvedTarget)) {
      let stat: fs.Stats
      try {
        stat = fs.statSync(resolvedTarget)
      } catch (e) {
        throw apiError(400, 'VALIDATION', `targetDir 无法访问: ${(e as Error).message}`)
      }
      if (!stat.isDirectory()) throw apiError(400, 'VALIDATION', 'targetDir 已存在且不是目录')
      const entries = fs.readdirSync(resolvedTarget)
      if (entries.length > 0) throw apiError(400, 'VALIDATION', `targetDir 必须为空目录: ${targetDir}（请先清空或另选路径）`)
    } else {
      try {
        fs.mkdirSync(resolvedTarget, { recursive: true })
      } catch (e) {
        throw apiError(400, 'VALIDATION', `targetDir 创建失败: ${(e as Error).message}`)
      }
    }
    try {
      if (kind === 'source-bundle') {
        await backup.restoreBundle(srcFile, targetDir)
      } else {
        await backup.restoreArchive(srcFile, targetDir)
      }
    } catch (e) {
      // 透传已分类的 400（如目录非空），其余归 500
      if ((e as { status?: number })?.status === 400) throw e
      const msg = (e as Error).message ?? ''
      if (msg.includes('目标目录非空') || msg.includes('必须为空目录')) {
        throw apiError(400, 'VALIDATION', msg)
      }
      throw apiError(500, 'RESTORE_FAILED', `恢复失败: ${msg}`)
    }
    sendJson(ctx.res, 200, { ok: true, targetDir })
  })

  // ---------- 源码级对比 ----------
  router.get('/api/repos/:pid/:rid/diff', async (ctx: Ctx) => {
    const cfg = await services.loadCfg()
    const project = cfg.projects.find(p => p.id === ctx.params.pid)
    if (!project) throw apiError(404, 'NOT_FOUND', `项目不存在: ${ctx.params.pid}`)
    const repo = project.repos.find(r => r.id === ctx.params.rid)
    if (!repo) throw apiError(404, 'NOT_FOUND', `仓库不存在或不属于该项目: ${ctx.params.rid}`)
    const to = ctx.query.get('to')?.trim()
    if (!to) throw apiError(400, 'VALIDATION', 'to 必填（tag/commit）')
    const from = ctx.query.get('from')?.trim() || null
    if (!fs.existsSync(repo.path)) throw apiError(400, 'REPO_INVALID', `仓库路径不存在: ${repo.path}`)
    const result = await compare.compareSource(repo.path, from, to)
    sendJson(ctx.res, 200, result)
  })
}
