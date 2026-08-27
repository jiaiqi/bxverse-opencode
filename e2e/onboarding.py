# -*- coding: utf-8 -*-
"""M5-08 首次使用引导端到端验证（空 BX_HOME → 自动弹出；四步流转；完成/跳过落 localStorage；命令面板可重看）"""
import os, sys, tempfile
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BX_BASE") or "http://127.0.0.1:" + os.environ.get("BX_PORT", "18998")
SHOTS = os.path.join(tempfile.gettempdir(), "bxverse-shots")
os.makedirs(SHOTS, exist_ok=True)

errors = []

def body(page):
    return page.inner_text("body")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1600, "height": 1000})
    page.on("console", lambda m: errors.append(f"{m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"PAGEERROR: {e}"))

    # 1. 空数据目录首次启动 → 自动弹出引导
    page.goto(BASE, wait_until="networkidle")
    page.wait_for_timeout(1500)
    assert "欢迎使用 BX 版本管理台" in body(page), "首次启动未自动弹出新手引导"
    page.screenshot(path=os.path.join(SHOTS, "ob-0-welcome.png"))

    # 2. 第 2 步：令牌保护（脱敏展示 + 复制/轮换按钮）
    page.click(".n-modal button:has-text('下一步')")
    page.wait_for_timeout(400)
    assert "保护你的服务" in body(page) and "复制令牌" in body(page), "令牌步骤缺失"
    assert "••••" in body(page), "令牌未脱敏展示"
    page.screenshot(path=os.path.join(SHOTS, "ob-1-token.png"))

    # 3. 第 3 步：建项目/接仓库（内嵌既有对话框入口）
    page.click(".n-modal button:has-text('下一步')")
    page.wait_for_timeout(400)
    assert "创建项目并接入仓库" in body(page) and "接入仓库" in body(page), "建项目步骤缺失"
    page.click(".n-modal button:has-text('新建项目')")
    page.wait_for_timeout(500)
    assert "项目名称" in body(page), "新建项目对话框未打开"
    page.keyboard.press("Escape")
    page.wait_for_timeout(400)
    page.screenshot(path=os.path.join(SHOTS, "ob-2-project.png"))

    # 4. 第 4 步：首次发布（无项目时按钮禁用 + pnpm seed 提示）
    page.click(".n-modal button:has-text('下一步')")
    page.wait_for_timeout(400)
    assert "完成第一次发布" in body(page) and "pnpm seed" in body(page), "首次发布步骤缺失"
    page.screenshot(path=os.path.join(SHOTS, "ob-3-release.png"))

    # 5. 完成 → 关闭且落 localStorage；刷新后不再自动弹出
    page.click(".n-modal button:has-text('完成')")
    page.wait_for_timeout(600)
    assert "欢迎使用 BX 版本管理台" not in body(page), "完成后引导未关闭"
    done = page.evaluate("localStorage.getItem('bxverse.onboarding.done')")
    assert done == "1", f"完成标记未写入 localStorage: {done}"
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(1200)
    assert "欢迎使用 BX 版本管理台" not in body(page), "刷新后引导重复自动弹出"

    # 6. 命令面板可重看
    page.keyboard.press("Control+k")
    page.wait_for_timeout(500)
    # 命令面板 input 的 aria-label 形如「搜索命令、项目、仓库（共 N 项）」，用 [placeholder] 兼容
    page.fill("input[placeholder*='搜索命令']", "引导")
    page.wait_for_timeout(400)
    page.click("text=重看新手引导")
    page.wait_for_timeout(500)
    assert "欢迎使用 BX 版本管理台" in body(page), "命令面板重看引导失败"
    page.click(".n-modal button:has-text('跳过引导')")
    page.wait_for_timeout(500)
    assert "欢迎使用 BX 版本管理台" not in body(page), "跳过引导未生效"

    browser.close()

crit = [e for e in errors if e.startswith("PAGEERROR")]
if crit:
    print("CONSOLE/PAGE ERRORS:")
    for e in crit:
        print(" ", e[:200])
    sys.exit(1)
print("onboarding e2e: ALL PASSED")
