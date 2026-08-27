# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from playwright.sync_api import sync_playwright
BASE = "http://127.0.0.1:18999"
with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    page = b.new_page(viewport={"width": 1600, "height": 1000})
    page.on("pageerror", lambda e: print("PAGEERROR:", str(e)[:200]))
    page.goto(BASE, wait_until="networkidle")
    page.wait_for_timeout(1000)
    n = page.locator("text=发布测试项目").count()
    print("matches for 发布测试项目:", n)
    page.locator("text=发布测试项目").first.click()
    page.wait_for_timeout(1200)
    print("url:", page.url)
    body = page.inner_text("body")
    print("has 备份与对比:", "备份与对比" in body)
    print("tabs html:", page.locator(".n-tabs").evaluate("e=>e.outerHTML.slice(0,600)") if page.locator(".n-tabs").count() else "NO .n-tabs")
    b.close()
