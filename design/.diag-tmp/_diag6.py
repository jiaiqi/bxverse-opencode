# -*- coding: utf-8 -*-
import io, re
from playwright.sync_api import sync_playwright

URL = 'file:///G:/vibecoding/bxverse-opencode/design/bxverse-ultimate-cockpit.html'
html = io.open(URL.replace('file:///', ''), 'r', encoding='utf-8').read()

JS = """
(html) => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const tpl = doc.getElementById('app').innerHTML;
  // 按注释分隔符切块，逐块编译
  const chunks = tpl.split(/<!--\\s*═+/);
  const bad = [];
  chunks.forEach((c, i) => {
    if (!c.trim()) return;
    try { Vue.compile('<div>' + c + '</div>'); }
    catch (e) { bad.push({ i, err: String(e).slice(0, 120), head: c.trim().slice(0, 120) }); }
  });
  return { total: chunks.length, bad };
}
"""

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page()
    page.goto(URL, wait_until='load')
    page.wait_for_timeout(500)
    res = page.evaluate(JS, html)
    print('chunks:', res['total'])
    for x in res['bad']:
        print('BAD chunk', x['i'], '|', x['err'])
        print('  head:', x['head'])
    if not res['bad']:
        print('no bad chunk?!')
    b.close()
