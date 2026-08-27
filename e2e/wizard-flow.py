# -*- coding: utf-8 -*-
"""M4 发布向导六步端到端验证（fixture 仓库，隔离 BX_HOME）"""
import os, json, sys, tempfile
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BX_BASE") or "http://127.0.0.1:" + os.environ.get("BX_PORT", "18899")
SHOTS = os.path.join(tempfile.gettempdir(), "bxverse-shots")
os.makedirs(SHOTS, exist_ok=True)

errors = []

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1600, "height": 1000})
    page.on("console", lambda m: errors.append(f"{m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"PAGEERROR: {e}"))

    page.goto(BASE, wait_until="networkidle")
    page.wait_for_timeout(1000)

    # 进入发布向导
    page.click("text=发布测试项目")
    page.wait_for_timeout(800)
    page.click("button:has-text('统一发版')")
    page.wait_for_timeout(2500)

    # 步骤 1：检测
    body = page.inner_text("body")
    assert "有变动" in body, "步骤1 未检测到变动"
    page.screenshot(path=os.path.join(SHOTS, "w1-detect.png"), full_page=True)
    page.click("button:has-text('下一步')")
    page.wait_for_timeout(3500)

    # 步骤 2：版本号（feat → minor → v0.2.0）
    body = page.inner_text("body")
    assert "v0.2.0" in body, f"步骤2 版本号错误: {body[:400]}"
    page.screenshot(path=os.path.join(SHOTS, "w2-version.png"), full_page=True)
    page.click("button:has-text('下一步')")
    page.wait_for_timeout(1000)

    # 步骤 3：双轨日志确认
    # 对外日志：确认
    page.click(".n-button:has-text('确认'):visible >> nth=0")
    page.wait_for_timeout(400)
    # 对内日志：编辑 → 确认
    page.click("button:has-text('编辑')")
    page.wait_for_timeout(500)
    page.click(".n-button:has-text('确认') >> nth=1")
    page.wait_for_timeout(500)
    body = page.inner_text("body")
    assert body.count("已确认") >= 2, f"日志未全部确认: {body[:500]}"
    page.screenshot(path=os.path.join(SHOTS, "w3-logs.png"), full_page=True)
    page.click("button:has-text('下一步')")
    page.wait_for_timeout(800)

    # 步骤 4：dry-run 清单
    body = page.inner_text("body")
    assert "git tag" in body and "version.json" in body, "步骤4 清单缺失"
    assert "执行发布" in body
    # 开启源码备份（默认关闭；步骤 7 恢复演练需要备份产物）
    page.click("xpath=//span[normalize-space()='源码备份']/preceding-sibling::div[contains(@class,'n-switch')]")
    page.wait_for_timeout(300)
    assert "git bundle" in page.inner_text("body"), "开启源码备份后 dry-run 清单未出现备份行"
    page.screenshot(path=os.path.join(SHOTS, "w4-preview.png"), full_page=True)

    # 步骤 5：执行 + SSE 控制台
    page.click("button:has-text('执行发布')")
    page.wait_for_timeout(2000)
    body = page.inner_text("body")
    assert "repo-start" in body or "发布" in body, "步骤5 控制台未出现"
    # 等待完成（最多 90s）
    done = False
    for _ in range(60):
        body = page.inner_text("body")
        if "统一发布完成" in body:
            done = True
            break
        page.wait_for_timeout(2000)
    assert done, "发布未完成（90s 超时）"
    body = page.inner_text("body")
    assert "v0.2.0" in body, "完成页版本号缺失"
    page.screenshot(path=os.path.join(SHOTS, "w5-done.png"), full_page=True)

    # ── 步骤 7（M7 恢复收口）：备份页恢复向导全流程 ──
    page.goto(BASE, wait_until="networkidle")
    page.wait_for_timeout(800)
    page.locator("a[href^='/project/']").first.click()
    page.wait_for_timeout(1000)
    assert "/project/" in page.url, f"未导航到项目详情: {page.url}"
    page.click(".n-tabs-tab:has-text('备份与对比')")
    # 备份面板异步加载：轮询直至出现备份条目或空态
    for _ in range(15):
        body = page.inner_text("body")
        if "源码 bundle" in body or "暂无备份" in body:
            break
        page.wait_for_timeout(1000)
    assert "源码 bundle" in body and "源码快照" in body, f"备份列表缺失 url={page.url} len={len(body)} body={body!r}"

    # 打开恢复对话框：默认路径已预填（BX_HOME/restores/…），未输版本号时按钮禁用
    page.click("button[aria-label='恢复'] >> nth=0")
    page.wait_for_timeout(600)
    modal = page.locator(".n-modal")
    target_val = modal.locator("input:not([type='radio']):not([type='checkbox'])").nth(0).input_value()
    assert "restores" in target_val.replace("/", "\\"), f"默认恢复路径未预填: {target_val}"
    confirm_btn = modal.locator("button:has-text('开始恢复')")
    assert confirm_btn.is_disabled(), "未输版本号时恢复按钮应禁用"

    # 二次确认：从备份卡片读版本号填入（显示值即 meta.version）
    ver = page.locator(".code-text.text-13px").first.inner_text().strip()
    modal.locator("input:not([type='radio']):not([type='checkbox'])").nth(1).fill(ver)
    page.wait_for_timeout(300)
    assert not confirm_btn.is_disabled(), "输入版本号后恢复按钮应解锁"
    page.screenshot(path=os.path.join(SHOTS, "w6-restore-dialog.png"))
    confirm_btn.click()
    # 成功以「对话框关闭」为准（toast 默认 3s 消散，不作断言依据）
    try:
        page.wait_for_selector(".n-modal", state="hidden", timeout=10000)
        first_ok = True
    except Exception:
        first_ok = False
    assert first_ok, "恢复未成功（对话框未关闭）"

    # 文件系统断言：bundle 克隆落地（含 .git）
    bx_home = os.environ.get("BX_HOME", "")
    if bx_home:
        assert os.path.isdir(os.path.join(target_val, ".git")), f"bundle 恢复未落地: {target_val}"

    # 冲突策略：同目录再恢复 source-archive —— 非空默认拒绝；勾 overwrite 后成功并写审计 chip
    page.click("button[aria-label='恢复'] >> nth=0")
    page.wait_for_timeout(600)
    modal = page.locator(".n-modal")
    modal.locator("input:not([type='radio']):not([type='checkbox'])").nth(0).fill(target_val)
    modal.locator(".n-radio:has-text('源码快照')").click()
    page.wait_for_timeout(200)
    modal.locator("input:not([type='radio']):not([type='checkbox'])").nth(1).fill(ver)
    page.wait_for_timeout(200)
    modal.locator("button:has-text('开始恢复')").click()
    page.wait_for_timeout(2500)
    body = page.inner_text("body")
    assert "必须为空目录" in body, "非空目录未拒绝恢复"
    page.locator(".n-checkbox:has-text('覆盖同名文件')").click()
    page.wait_for_timeout(200)
    page.locator(".n-modal button:has-text('开始恢复')").click()
    # 成功以「对话框关闭」为准（toast 会消散，不作断言依据）
    try:
        page.wait_for_selector(".n-modal", state="hidden", timeout=10000)
        restored_ok = True
    except Exception:
        restored_ok = False
    assert restored_ok, "overwrite 恢复未成功（对话框未关闭）"
    if bx_home:
        assert os.path.isfile(os.path.join(target_val, "src", "wizard.ts")), "快照恢复未落地"
    page.wait_for_timeout(1500)
    assert "已恢复" in page.inner_text("body"), "恢复审计 chip 未出现"
    page.screenshot(path=os.path.join(SHOTS, "w7-restore-done.png"), full_page=True)

    browser.close()

print("console errors:", [e for e in errors if "Failed to load resource" not in e][:10])
print("M4 WIZARD E2E PASSED")
