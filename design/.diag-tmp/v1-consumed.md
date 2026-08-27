---
type: major
---

v1.0 首次 major 跨版本：bxverse 自身发版与产品发版同源化（dogfooding 闭环）。API 契约进入稳定期：shared/types.ts + shared/constants.ts 双冻结，后续走 1.x 维护更新路径。

**核心能力（v0.1.0 → v1.0.0 累计交付）**：

- **R1-R30**：项目/仓库级版本管理、双轨更新日志（internal/external）、R26 仓库级构建流水线（X.Y.Z + V 时间戳双格式 + manifestTarget 自动透传）、R27 external 日志分发（复制 / 导出 .md/.html / GitHub/Gitee Release 同 tag PATCH ）、R28 快速发布通道、 R29 webhook 通知、R30 prerelease 自定义
- **M5-08 首次使用引导**：四步引导 + 自动弹出 + 重看入口
- **M7 备份恢复产品化**：R19 bundle + 快照 + 产物备份 + 一等恢复（BX_HOME 白名单 + 冲突策略 overwrite + 版本号二次确认 + 恢复审计 restores）
- **M8 多项目看板与治理中枢**：脏仓 KPI + 相对时间 + 仓库治理菜单（编辑/移除）
- **M11 发布失败结构化恢复**：每仓结构化诊断（code/head/target/tag/tagSource/suggestions）+ 三出路（换版本号重试/接管续跑/回滚）+ 诊断包导出
- **M12 运维中心 OpsCenter**：一致性体检 + 数据迁移 + 引擎日志流级别过滤 + 关于 bxverse 自举版本
- **M13 驾驶舱增强**：近 8 周发布节奏柱状图 + 分支巡检入口
- **M14 命令面板增强**：fuzzy 匹配 + WIG a11y 收口
- **cli watchdog + update 子命令**：崩溃 3s 自动拉起；检查 npm registry 最新版本
- **零依赖自举 release**：`scripts/release.mjs` 聚合 `.changeset/*.md` → 自动 bump 6 个 package.json + 写 CHANGELOG.md

**质量门禁**：
- core 145 测试 / 19 文件
- typecheck 0 error（5 个包）
- build 全链成功
- e2e 三场景（中断续跑 / 向导六步含恢复演练 / 首次引导）全过

完整验收清单：`docs/v1-checklist.md`。
