---
type: minor
---

Phase 3 自举分发：cli 启用看门狗模式（`bx-manager start --watchdog`，崩溃 3s 自动拉起）+ 新增 `bx-manager update`（检查 npm registry 最新版本）；`scripts/release.mjs` 零依赖发版脚本（聚合 `.changeset/*.md` → 自动 bump 所有 package.json + 写 CHANGELOG.md）
