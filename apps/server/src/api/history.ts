// apps/server/src/api/history.ts
// 发布历史查询 + 双轨日志编辑（PATCH /api/releases/:id/log，state 流转）

import type { AppConfig, ExternalReleaseProvider, RepoVersionItem } from '@bxverse/shared'
import { git, release, store } from '@bxverse/core'
import type { Ctx } from '../http/router'
import { apiError, readJsonBody, sendJson } from '../http/json'

export interface HistoryServices {
  loadCfg: () => Promise<AppConfig>
  lockedProjectId: () => string | null
  dataStore: store.DataStore
}

export function register(router: import('../http/router').Router, services: HistoryServices): void {
  router.get('/api/projects/:id/releases', async (ctx: Ctx) => {
    const cfg = await services.loadCfg()
    if (!cfg.projects.some(p => p.id === ctx.params.id)) {
      throw apiError(404, 'NOT_FOUND', `项目不存在: ${ctx.params.id}`)
    }
    const n = Number(ctx.query.get('n') ?? 20)
    if (!Number.isInteger(n) || n < 1) throw apiError(400, 'VALIDATION', 'n 必须为正整数')
    sendJson(ctx.res, 200, await services.dataStore.listRecords(ctx.params.id, Math.min(n, 100)))
  })

  router.get('/api/releases', async (ctx: Ctx) => {
    const scopeId = ctx.query.get('scopeId')
    if (!scopeId) throw apiError(400, 'VALIDATION', '缺少必填参数 scopeId')
    const version = ctx.query.get('version')
    const records = await services.dataStore.listRecords(scopeId, 100)
    if (version) {
      const hit = records.find(r => r.version === version)
      if (!hit) throw apiError(404, 'NOT_FOUND', `未找到 ${scopeId} 的 ${version} 发布记录`)
      sendJson(ctx.res, 200, hit)
      return
    }
    sendJson(ctx.res, 200, records)
  })

  // GET /api/releases/:id/versions —— 该次发布的项目版本清单（R18 与发布历史绑定）
  router.get('/api/releases/:id/versions', async (ctx: Ctx) => {
    const record = await services.dataStore.readRecord(ctx.params.id)
    if (!record) throw apiError(404, 'NOT_FOUND', `发布记录不存在: ${ctx.params.id}`)
    if (record.kind !== 'project' || !record.repos) {
      throw apiError(400, 'VALIDATION', '仅项目级发布记录包含版本清单')
    }
    const items: RepoVersionItem[] = record.repos.map(r => ({
      app: r.repoName,
      name: r.displayName || r.repoName,
      version: r.version,
    }))
    sendJson(ctx.res, 200, items)
  })

  // PATCH /api/releases/:id/log —— 双轨日志人工编辑（api.md §7.3）
  router.patch('/api/releases/:id/log', async (ctx: Ctx) => {
    const body = (await readJsonBody(ctx.req)) as Record<string, unknown>
    const track = String(body.track ?? '')
    const action = String(body.action ?? '')
    if (!['internal', 'external'].includes(track)) {
      throw apiError(400, 'VALIDATION', 'track 必须为 internal/external')
    }
    if (!['edit', 'confirm', 'reset'].includes(action)) {
      throw apiError(400, 'VALIDATION', 'action 必须为 edit/confirm/reset')
    }

    const record = await services.dataStore.readRecord(ctx.params.id)
    if (!record) throw apiError(404, 'NOT_FOUND', `发布记录不存在: ${ctx.params.id}`)

    // 该记录所属 scope 正在发布中 → 409
    const scopeProjectId = record.kind === 'project' ? record.scopeId : null
    const locked = services.lockedProjectId()
    if (scopeProjectId && locked === scopeProjectId) {
      throw apiError(409, 'PUBLISH_RUNNING', '该记录所属项目正在发布中')
    }

    const log = record.logs[track as 'internal' | 'external']
    const prevState = log.state
    if (action === 'edit') {
      if (typeof body.content !== 'string') throw apiError(400, 'VALIDATION', 'edit 必须提供 content')
      log.content = body.content
      log.state = 'edited'
    } else if (action === 'confirm') {
      if (prevState === 'edited') log.state = 'confirmed'
      // auto/confirmed 状态下 confirm 幂等无变化
    } else {
      log.content = log.autoDraft
      log.state = 'auto'
    }

    await services.dataStore.updateRecord(record)
    await services.dataStore.commitRecords(`chore: manual log edit (${ctx.params.id}, ${track}:${action})`)
    sendJson(ctx.res, 200, record)
  })

  // POST /api/releases/:id/deprecate —— 标为废弃与纠偏撤销 Tag (R24)
  router.post('/api/releases/:id/deprecate', async (ctx: Ctx) => {
    const body = (await readJsonBody(ctx.req)) as { reason?: string; cleanupTags?: boolean }
    const reason = String(body.reason ?? '').trim()
    const cleanupTags = body.cleanupTags === true
    const cfg = await services.loadCfg()

    // 1. 废弃记录更新
    const updated = await services.dataStore.deprecateRecord(ctx.params.id, reason)

    // 2. 若勾选撤销标签，遍历关联工程安全清理
    // 修正：不再只读 project 记录的 tags（仅 milestone，build 永不清理），改为从 projectRecord.repos 反查各 repo 最新 record，取其 tags.build/tags.milestone 组装待删清单
    let removed: string[] = []
    let failed: { repoId: string; tag: string; reason: string }[] = []
    if (cleanupTags && updated.kind === 'project' && updated.repos?.length) {
      const project = cfg.projects.find(p => p.id === updated.scopeId)
      if (project) {
        for (const rRef of updated.repos) {
          const repoDef = project.repos.find(r => r.id === rRef.repoId)
          if (!repoDef) continue
          // 反查该仓最新 record（优先精确匹配 rRef.version，fallback 最新一条）
          let repoRecord: import('@bxverse/shared').ReleaseRecord | null = null
          try {
            const candidates = await services.dataStore.listRecords(rRef.repoId, 20)
            repoRecord = candidates.find(r => r.version === rRef.version) ?? candidates[0] ?? null
            if (!repoRecord) {
              const rid = services.dataStore.nextReleaseId('repo', rRef.repoId, rRef.version)
              repoRecord = await services.dataStore.readRecord(rid)
            }
          } catch {
            repoRecord = null
          }
          if (!repoRecord) continue
          const tagsToDelete = [repoRecord.tags.build, repoRecord.tags.milestone].filter(Boolean) as string[]
          const uniqTags = [...new Set(tagsToDelete)]
          for (const tag of uniqTags) {
            try {
              await git.deleteTag(repoDef.path, tag, { remote: true })
              removed.push(tag)
            } catch (e) {
              failed.push({ repoId: rRef.repoId, tag, reason: (e as Error).message })
            }
          }
        }
      }
    } else if (cleanupTags && updated.kind === 'repo') {
      // 仓库级废弃：直接清理自身 tags
      const cfgProject = cfg.projects.find(p => p.repos.some(r => r.id === updated.scopeId))
      const repoDef = cfgProject?.repos.find(r => r.id === updated.scopeId)
      if (repoDef) {
        const tagsToDelete = [updated.tags.build, updated.tags.milestone].filter(Boolean) as string[]
        for (const tag of [...new Set(tagsToDelete)]) {
          try {
            await git.deleteTag(repoDef.path, tag, { remote: true })
            removed.push(tag)
          } catch (e) {
            failed.push({ repoId: updated.scopeId, tag, reason: (e as Error).message })
          }
        }
      }
    }

    if (failed.length > 0) {
      const warnings = failed.map(f => `${f.repoId} 清理标签 ${f.tag} 失败: ${f.reason}`)
      // 部分成功：HTTP 200 + warnings
      sendJson(ctx.res, 200, { ...updated, removed, failed, warnings })
      return
    }
    // 全部成功或无需清理：附加 removed/failed 便于审计，warnings 仅在部分成功时返回
    sendJson(ctx.res, 200, { ...updated, removed, failed })
  })

  // POST /api/releases/:id/publish-note —— R27 external 同步至 GitHub/Gitee Release（幂等 PATCH）
  router.post('/api/releases/:id/publish-note', async (ctx: Ctx) => {
    const raw = (await readJsonBody(ctx.req)) as Record<string, unknown>
    const repoId = String(raw.repoId ?? '').trim()
    const providerRaw = String(raw.provider ?? '').trim().toLowerCase()
    const noteBody = typeof raw.body === 'string' ? raw.body : ''
    if (!repoId) throw apiError(400, 'VALIDATION', 'repoId 必填')
    if (!noteBody.trim()) throw apiError(400, 'VALIDATION', 'body 不能为空')
    let provider: ExternalReleaseProvider
    if (providerRaw === 'github' || providerRaw === 'gitee') provider = providerRaw as ExternalReleaseProvider
    else if (!providerRaw) {
      // 未传 provider 时尝试按 remote 自动推断，推断失败再 400
      provider = '' as ExternalReleaseProvider
    } else {
      throw apiError(400, 'VALIDATION', 'provider 必须为 github 或 gitee')
    }

    const record = await services.dataStore.readRecord(ctx.params.id)
    if (!record) throw apiError(404, 'NOT_FOUND', `发布记录不存在: ${ctx.params.id}`)

    const cfg = await services.loadCfg()
    // 定位所属项目：project 记录的 scopeId 即项目；repo 记录则反查归属项目
    let project: AppConfig['projects'][number] | undefined
    if (record.kind === 'project') {
      project = cfg.projects.find(p => p.id === record.scopeId)
    } else {
      project = cfg.projects.find(p => p.repos.some(r => r.id === record.scopeId))
      // repo 记录的同步：repoId 必须等于 scopeId 或属于同一项目
      if (!project && record.scopeId === repoId) {
        // 兼容：repoId 与 scopeId 同仓时允许查找其所属项目
        project = cfg.projects.find(p => p.repos.some(r => r.id === repoId))
      }
    }
    if (!project) throw apiError(404, 'NOT_FOUND', `发布记录所属项目不存在: ${record.scopeId}`)
    const repoDef = project.repos.find(r => r.id === repoId)
    if (!repoDef) throw apiError(404, 'NOT_FOUND', `仓库不存在于项目中: ${repoId}`)

    // token：credentials.json releaseTokens[provider]（兼容 githubToken/giteeToken）
    const cred = await store.loadCredentials()
    const tokens = (cred.releaseTokens ?? {}) as Record<string, string>
    // 兼容旧字段：若存量凭据直接写 githubToken/giteeToken 顶层
    const legacyMap = cred as unknown as Record<string, string>
    const token =
      tokens[provider] ??
      (provider === 'github' ? legacyMap['githubToken'] : undefined) ??
      (provider === 'gitee' ? legacyMap['giteeToken'] : undefined) ??
      ''
    if (!provider) {
      // 自动推断
      const remoteForInfer = repoDef.remote ?? (await git.remoteUrl(repoDef.path))
      const parsedInfer = release.parseRemoteUrl(remoteForInfer)
      if (!parsedInfer) throw apiError(400, 'VALIDATION', '无法推断 provider，请显式传入 github/gitee')
      provider = parsedInfer.provider
      const inferredToken = tokens[provider] ?? (legacyMap[`${provider}Token`] as string | undefined) ?? ''
      if (!inferredToken) throw apiError(400, 'VALIDATION', `未配置 ${provider} token，请在 credentials.json 配置 releaseTokens.${provider}`)
      // 用推断的 provider/token 覆盖
      const parsed2 = parsedInfer
      const tagName2 = record.version
      try {
        const res2 = await release.publishReleaseNote({
          owner: parsed2.owner,
          repo: parsed2.repo,
          tagName: tagName2,
          name: tagName2,
          body: noteBody,
          token: inferredToken,
          provider,
        })
        sendJson(ctx.res, 200, { ok: true, ...res2 })
        return
      } catch (e) {
        const err = e as { code?: string; message?: string; detail?: Record<string, unknown> }
        const status = err.code === 'UNAUTHORIZED' ? 502 : 502
        throw apiError(status, err.code ?? 'GIT_FAILED', err.message ?? 'Release 同步失败')
      }
    }
    if (!token || !String(token).trim()) {
      throw apiError(400, 'VALIDATION', `未配置 ${provider} token，请在 credentials.json 配置 releaseTokens.${provider}`)
    }

    // 远程解析 owner/repo
    let remoteUrl = repoDef.remote ?? ''
    if (!remoteUrl) {
      try {
        remoteUrl = await git.remoteUrl(repoDef.path)
      } catch {
        remoteUrl = ''
      }
    }
    if (!remoteUrl) throw apiError(400, 'VALIDATION', '仓库未配置 remote，无法解析 owner/repo')
    const parsed = release.parseRemoteUrl(remoteUrl)
    if (!parsed) throw apiError(400, 'VALIDATION', `无法解析 remote URL 的 owner/repo: ${remoteUrl}`)
    // 若显式 provider 与解析 provider 不一致，尊重显式 provider 仅用 owner/repo
    // （便于 mock 场景：remote 为本地地址但 provider 强制为 github）
    const owner = parsed.owner
    const repoName = parsed.repo
    const tagName = record.version

    try {
      const result = await release.publishReleaseNote({
        owner,
        repo: repoName,
        tagName,
        name: tagName,
        body: noteBody,
        token: String(token).trim(),
        provider,
      })
      sendJson(ctx.res, 200, { ok: true, ...result })
    } catch (e) {
      const err = e as { code?: string; message?: string; detail?: Record<string, unknown> }
      // 上游鉴权/网络失败统一 502，保持前端可区分本地校验 400
      const status = err.code === 'VALIDATION' ? 400 : 502
      throw apiError(status, (err.code as string) ?? 'GIT_FAILED', err.message ?? 'Release 同步失败')
    }
  })
}
