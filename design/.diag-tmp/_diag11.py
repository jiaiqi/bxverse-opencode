# -*- coding: utf-8 -*-
import io
from playwright.sync_api import sync_playwright

URL = 'file:///G:/vibecoding/bxverse-opencode/design/bxverse-ultimate-cockpit.html'
html = io.open(URL.replace('file:///', ''), 'r', encoding='utf-8').read()

JS = """
(html) => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const tpl = doc.getElementById('app').innerHTML;
  const lines = tpl.split('\\n');
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    const win = lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 3)).join('\\n');
    try { Vue.compile('<div>' + win + '</div>'); }
    catch (e) {
      const m = String(e && e.message || e);
      if (m.includes('Invalid or unexpected token')) hits.push(i + 1);
    }
  }
  // 收敛为区间
  return { hitLines: hits.slice(0, 60), total: lines.length };
}
"""

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page()
    page.goto('about:blank')
    page.add_script_tag(url='https://unpkg.com/vue@3/dist/vue.global.js')
    res = page.evaluate(JS, html)
    print(res)
    b.close()
