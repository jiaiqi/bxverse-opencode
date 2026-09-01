---
type: minor
---

D 方向 · 升级日志聚合页：`GET /api/aggregate/{feed,timeline,export}` 3 端点（feed 倒序 / 时间线 day/week/month 分桶 / md+json 导出附件流）；web `UpgradeFeed.vue` 视图（粒度/范围/项目 3 组过滤 + Timeline mini + 导出 .md）+ `/feed` 路由 + 顶栏 + CommandPalette 入口
