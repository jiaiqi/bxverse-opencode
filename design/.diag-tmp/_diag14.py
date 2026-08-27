# -*- coding: utf-8 -*-
from playwright.sync_api import sync_playwright

URL = 'file:///G:/vibecoding/bxverse-opencode/design/bxverse-ultimate-cockpit.html'

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={'width': 1440, 'height': 900})
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)[:200]))
    page.goto(URL, wait_until='networkidle')
    page.wait_for_timeout(1500)
    print('mounted:', page.evaluate("!!document.getElementById('app').__vue_app__"))
    print('h1:', page.evaluate("var h=document.querySelector('h1'); h?h.textContent:'(none)'"))
    print('kpi cards:', page.evaluate("document.querySelectorAll('.glass').length"))
    print('pageerrors:', errs if errs else 'NONE')
    # 交互冒烟：点进发布向导
    page.click("text=发布向导")
    page.wait_for_timeout(400)
    print('wizard steps:', page.evaluate("document.body.innerText.includes('变动检测')"))
    b.close()
