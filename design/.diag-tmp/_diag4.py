# -*- coding: utf-8 -*-
from playwright.sync_api import sync_playwright

URL = 'file:///G:/vibecoding/bxverse-opencode/design/bxverse-ultimate-cockpit.html'

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e.stack or e)))
    page.goto(URL, wait_until='load')
    page.wait_for_timeout(1000)
    for e in errs:
        print(e[:2000])
        print('---')
    b.close()
