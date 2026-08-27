# -*- coding: utf-8 -*-
# 探针：重试后 2.4.2 可见性
from playwright.sync_api import sync_playwright
URL = 'file:///G:/vibecoding/bxverse-opencode/design/bxverse-ultimate-cockpit.html'
with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={'width': 1440, 'height': 900})
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)[:200]))
    page.goto(URL, wait_until='networkidle'); page.wait_for_timeout(1000)
    page.click("header >> button:has-text('快速发布')"); page.wait_for_timeout(400)
    page.click("button:has-text('下一步：版本')"); page.wait_for_timeout(250)
    page.click("button:has-text('下一步：生成双轨日志')"); page.wait_for_timeout(300)
    page.click("button:has-text('确认当前轨')"); page.wait_for_timeout(150)
    page.click("button:has-text('对外 external')"); page.wait_for_timeout(150)
    page.click("button:has-text('确认当前轨')"); page.wait_for_timeout(150)
    page.click("button:has-text('下一步：dry-run')"); page.wait_for_timeout(300)
    page.check("label:has-text('故障演练') input")
    page.wait_for_timeout(2800)
    page.click("button:has-text('进入执行')")
    page.wait_for_selector("text=执行中断 · 1 仓失败", timeout=20000)
    page.click("button:has-text('改用下一版本号重试失败仓库')"); page.wait_for_timeout(600)
    print('after retry click, 2.4.2 in body:', page.evaluate("document.body.innerText.includes('2.4.2')"))
    print('toasts:', page.evaluate("[...document.querySelectorAll('.toast-in')].map(e=>e.innerText)"))
    print('header h3:', page.evaluate("document.querySelector('section h3') ? document.querySelector('section h3').innerText : 'n/a'"))
    page.wait_for_selector("text=发布完成", timeout=15000)
    page.wait_for_timeout(400)
    print('done page has 2.4.2:', page.evaluate("document.body.innerText.includes('2.4.2')"))
    print('errors:', errs if errs else 'NONE')
    b.close()
