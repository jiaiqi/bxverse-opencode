import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
from playwright.sync_api import sync_playwright
BASE = "http://127.0.0.1:18999"
with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    page = b.new_page()
    errs=[]
    page.on('pageerror', lambda e: errs.append(str(e)[:200]))
    page.goto(BASE, wait_until='networkidle')
    page.wait_for_timeout(1000)
    body=page.inner_text('body')
    print('has projects?', '业务' in body or '主产品线' in body)
    print('has 发布测试项目?', '发布测试项目' in body)
    b.close()
