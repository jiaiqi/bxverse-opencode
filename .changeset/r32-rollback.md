---
type: minor
---

R32 · 升级后回退到历史版本（端到端 0 入侵）：4 步 RollbackWizard（选 release → 影响面预览 → 版本与日志确认 → 执行）+ 3 入口（ProjectDetail/RepoDetail/CommandPalette）；3 门禁（confirmed 必填 + riskLevel='block' 409 拒绝 + 业务仓 0 入侵）；附 `docs/r32-rollback-guide.md` l-pc-front 迁移指南
