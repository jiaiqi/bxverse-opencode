# bxverse 端到端测试（Playwright + Node）

本地应用端到端验证脚本（隔离 BX_HOME 与端口，不触碰真实数据）。

## 一键运行

```bash
pnpm build      # 需要 server 与 web 产物
pnpm test:e2e   # 即 node e2e/run.mjs：依次跑「中断续跑」与「六步向导」
```

`run.mjs` 会为每个场景创建独立临时 `BX_HOME`，向导场景自动在 18999 端口起停 server；
未安装 Python + Playwright 时自动跳过向导场景（不视为失败）。

## 单独运行

| 脚本 | 说明 | 运行前提 |
|---|---|---|
| `wizard-flow.py` + `prepare-fixture.mjs` | 发布向导六步全流程（检测→版本→双轨日志确认→预览→SSE 执行→完成） | server 已构建；`BX_PORT=18899` 启动 server 后依次执行 prepare → wizard |
| `resume.mjs` | 中断续跑演练：发布执行中 kill server → 重启 → 重新发起 → 幂等续跑不重复打标签 | 自管理 server 生命周期，直接 `node resume.mjs`（需设置 `BX_HOME`，端口默认 18898 可用 `BX_PORT` 覆盖） |
| `onboarding.py` | 首次使用引导（M5-08）：空 BX_HOME 首启自动弹出 → 四步流转 → 完成标记落 localStorage → 刷新不再弹 → 命令面板重看 | 由 `run.mjs` 统一编排（自带空 BX_HOME + `BX_PORT=18998`）；单跑需自起空数据目录 server |

所有脚本均支持环境变量覆盖地址/端口：`BX_BASE`（完整 base URL）或 `BX_PORT`。

## 运行示例（PowerShell）

```powershell
# 向导全流程
$env:BX_HOME = "$env:TEMP\bxverse-e2e-home"; $env:BX_PORT = "18899"
Start-Process node "apps/server/dist/index.js"
node e2e/prepare-fixture.mjs
python e2e/wizard-flow.py

# 中断续跑
$env:BX_HOME = "$env:TEMP\bxverse-e2e-resume-home"
node e2e/resume.mjs
```

注意：运行前确保端口未被占用；截图输出至系统临时目录 `%TEMP%\bxverse-shots\`。

> R26 流水线回归：fixture 含 package.json 仓库 → 向导选择 X.Y.Z/VYYMMDDHHmm → 验证清单落盘与受控提交
