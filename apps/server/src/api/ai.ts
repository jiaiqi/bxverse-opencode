// apps/server/src/api/ai.ts
// POST /api/ai/polish —— AI 日志润色（M5-02）
// 未启用 / 配置缺失时 400 短路；调用 core.polishLog（OpenAI 兼容，零依赖 fetch）；
// 失败抛 502，由前端呈现——绝不静默返回原文。

import type { AppConfig } from '@bxverse/shared'
import { polishLog } from '@bxverse/core'
import type { Ctx } from '../http/router'
import { apiError, readJsonBody, sendJson } from '../http/json'

export function register(
  router: import('../http/router').Router,
  services: { loadCfg: () => Promise<AppConfig> },
): void {
  router.post('/api/ai/polish', async (ctx: Ctx) => {
    const body = (await readJsonBody(ctx.req)) as Record<string, unknown>
    const text = typeof body.text === 'string' ? body.text : ''
    if (!text.trim()) throw apiError(400, 'VALIDATION', 'text 必填')

    const cfg = await services.loadCfg()
    if (!cfg.ai.enabled) throw apiError(400, 'AI_DISABLED', 'AI 润色未启用（请在设置页开启）')
    if (!cfg.ai.baseUrl || !cfg.ai.model) {
      throw apiError(400, 'AI_CONFIG', 'AI Base URL / 模型未配置（请在设置页填写）')
    }

    try {
      const content = await polishLog(cfg.ai, text)
      sendJson(ctx.res, 200, { ok: true, content })
    } catch (e) {
      throw apiError(502, 'AI_FAILED', (e as Error).message)
    }
  })
}
