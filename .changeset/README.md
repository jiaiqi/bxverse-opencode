# 变更记录（changeset）

本目录是 bxverse 自身的 release notes 源。每条 `*.md` 文件代表一次即将发布的变更条目。
`scripts/release.mjs` 启动时会扫描本目录并合成新版本 CHANGELOG。

## 文件格式

文件名：`<时间戳-或 slug>.md`，例如 `phase3-dogfooding.md`。
内容（YAML frontmatter + Markdown body）：

```markdown
---
type: major | minor | patch
---

变更描述（用户可读，建议一行 80 字内，多行可加空行）
```

- `major`：不兼容变更（影响自举版本提升 major）
- `minor`：新增功能（提升 minor）
- `patch`：修复与维护（提升 patch）

缺省 `type: patch`。多文件混用时取最大（major > minor > patch）。

## 工作流

```bash
# 1. 改代码
# 2. 写一条 .changeset/<slug>.md 描述变更
# 3. 跑 release 脚本（dry-run 预览）
node scripts/release.mjs --dry-run
# 4. 确认无误后正式发版
node scripts/release.mjs
# 5. git add -A && git commit -m "release: vX.Y.Z"
# 6. 人工 review 后删除已消费的 *.md，避免下次重复发布
```

## 约束

- **不引入新依赖**：本约定是 bxverse 自举的一部分，本身用 `scripts/release.mjs` 零依赖实现
- **人审门禁**：脚本不自动 commit/publish，留给人 review（与产品发布同源哲学）
- **可重复执行**：`--dry-run` 任意次，正式跑会原子写所有 package.json + CHANGELOG.md
