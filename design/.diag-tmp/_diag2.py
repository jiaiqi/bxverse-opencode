# -*- coding: utf-8 -*-
from playwright.sync_api import sync_playwright

URL = 'file:///G:/vibecoding/bxverse-opencode/design/bxverse-ultimate-cockpit.html'

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page()
    page.goto(URL, wait_until='load')
    info = page.evaluate("""
      Array.from(document.scripts).map((s, i) => {
        if (s.src) return { i, src: s.src };
        const t = s.textContent;
        try { new Function(t); return { i, len: t.length, ok: true }; }
        catch (e) { return { i, len: t.length, ok: false, err: String(e).slice(0, 200) }; }
      })
    """)
    for r in info:
        print(r)
    b.close()
