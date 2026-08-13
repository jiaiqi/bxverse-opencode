# bxverse 端到端测试（Playwright + Node）

本地应用端到端验证脚本（隔离 BX_HOME 与端口，不触碰真实数据）。

## 依赖

```bash
pip install playwright
playwright install chromium
```

## 用例

| 脚本 | 说明 | 运行前提 |
|---|---|---|
| `wizard-flow.py` + `prepare-fixture.mjs` | 发布向导六步全流程（检测→版本→双轨日志确认→预览→SSE 执行→完成） | server 已构建；`BX_PORT=18899` 启动 server 后依次执行 prepare → wizard |
| `resume.mjs` | 中断续跑演练：发布执行中 kill server → 重启 → 重新发起 → 幂等续跑不重复打标签 | 自管理 server 生命周期，直接 `node resume.mjs`（需设置 `BX_HOME` 与 `BX_PORT=18898`） |

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

注意：运行前确保端口未被占用；截图输出至 `%TEMP%\opencode\bxverse-shots\`。
