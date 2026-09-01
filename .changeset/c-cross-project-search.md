---
type: minor
---

C 方向 · 跨项目搜索：`GET /api/cross/search?q=&type=commit|version|name` 端点（commit 用 fullHash 前缀 / version 精确含 v/V 容错 / name 子串匹配）；web `CrossProjectSearch.vue` + `/cross` 路由 + 顶栏 + CommandPalette 入口
