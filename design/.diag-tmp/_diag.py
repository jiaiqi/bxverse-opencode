# -*- coding: utf-8 -*-
"""抓取原型页面的控制台错误与渲染状态（一次性诊断脚本）"""
from playwright.sync_api import sync_playwright

URL = 'file:///G:/vibecoding/bxverse-opencode/design/bxverse-ultimate-cockpit.html'

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page()
    msgs = []
    page.on('console', lambda m: msgs.append(f'[{m.type}] {m.text[:300]}'))
    page.on('pageerror', lambda e: msgs.append(f'[pageerror] {str(e)[:300]}'))
    page.goto(URL, wait_until='networkidle')
    page.wait_for_timeout(1500)
    app_html = page.evaluate("document.getElementById('app').innerHTML.length")
    h1 = page.evaluate("var h=document.querySelector('h1'); h ? h.textContent : '(no h1)'")
    print('APP_HTML_LEN:', app_html)
    print('H1:', h1)
    print('--- console ---')
    for m in msgs:
        print(m)
    b.close()
