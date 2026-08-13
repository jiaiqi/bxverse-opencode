# -*- coding: utf-8 -*-
"""M4 发布向导六步端到端验证（fixture 仓库，隔离 BX_HOME）"""
import os, json, sys
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:18899"
SHOTS = r"C:\Users\24682\AppData\Local\Temp\opencode\bxverse-shots"
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
    page.click("text=发布新版本")
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

    browser.close()

print("console errors:", [e for e in errors if "Failed to load resource" not in e][:10])
print("M4 WIZARD E2E PASSED")
