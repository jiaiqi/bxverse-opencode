#!/usr/bin/env python
import io
p = r'G:\vibecoding\bxverse-opencode\docs\development.md'
s = io.open(p, encoding='utf-8').read()
addition = '''

## 11. 自举 release 协议

bxverse 自身也用本仓库的 changeset 机制发版（dogfooding，零依赖）。

**`type` 三档**：`major | minor | patch`；多文件混用时取最大（major > minor > patch）。

**`scripts/release.mjs`（零依赖，Node 内置 API）**：
- `pnpm release:dry` 预览：扫描 `.changeset/*.md`（YAML frontmatter + Markdown body）→ 推断 bump → 打印 6 个 package.json 的 before/after + 生成的 CHANGELOG 段落
- `pnpm release` 正式：原子写入所有 package.json + 追加 CHANGELOG.md
- **不自动** git commit / npm publish —— 人审为终，与产品发布同源哲学
- 不引入第三方库（changesets / release-it / auto 等）

**工作流**：

```bash
# 1. 改代码 + 写一条 changeset
cat > .changeset/feat-xxx.md <<'EOF'
---
type: minor
---

描述这一轮的变更（用户可读，一行 80 字内最佳）
EOF

# 2. 预览
pnpm release:dry

# 3. 正式发版
pnpm release

# 4. 人工 review
git add -A && git commit -m "release: vX.Y.Z"
rm .changeset/feat-xxx.md   # 避免下次重复发布
```

完整字段定义：`.changeset/README.md`。变更记录：根 `CHANGELOG.md`。
'''
io.open(p, 'w', encoding='utf-8', newline='\n').write(s.rstrip() + addition + '\n')
print('done, size:', len(s) + len(addition))
