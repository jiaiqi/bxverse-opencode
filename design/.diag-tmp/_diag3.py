# -*- coding: utf-8 -*-
from playwright.sync_api import sync_playwright

URL = 'file:///G:/vibecoding/bxverse-opencode/design/bxverse-ultimate-cockpit.html'

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page()
    page.goto(URL, wait_until='load')
    page.wait_for_timeout(800)
    res = page.evaluate("""
      (() => {
        const app = document.getElementById('app');
        const out = { hasVueApp: !!app.__vue_app__, childCount: app.childElementCount };
        // 手动重编译模板看是否报错
        try {
          const tpl = app._tpl || null;
          out.note = 'children=' + app.childElementCount;
        } catch (e) { out.err = String(e); }
        return out;
      })()
    """)
    print(res)
    # 抓取 tailwind 生成器是否报错：检查 style 标签数量
    print(page.evaluate("document.querySelectorAll('style').length"))
    b.close()
