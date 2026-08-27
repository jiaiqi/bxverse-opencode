# -*- coding: utf-8 -*-
import io
from playwright.sync_api import sync_playwright

URL = 'file:///G:/vibecoding/bxverse-opencode/design/bxverse-ultimate-cockpit.html'
html = io.open(URL.replace('file:///', ''), 'r', encoding='utf-8').read()

JS = """
(html) => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const tpl = doc.getElementById('app').innerHTML;
  const line = tpl.split('\\n')[647];
  const codes = [];
  for (let i = 0; i < line.length; i++) {
    const c = line.charCodeAt(i);
    if (c > 126 || c < 32) codes.push({ i, c, hex: '0x' + c.toString(16) });
  }
  return { len: line.length, nonAscii: codes.slice(0, 40) };
}
"""

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page()
    page.goto('about:blank')
    page.add_script_tag(url='https://unpkg.com/vue@3/dist/vue.global.js')
    print(page.evaluate(JS, html))
    b.close()
