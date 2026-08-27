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
  const win = lines.slice(644, 653).join('\\n');
  const errs = [];
  try {
    Vue.compile('<div>' + win + '</div>', { onError: e => errs.push({
      code: e.code, msg: e.message,
      line: e.loc ? e.loc.start.line : -1, col: e.loc ? e.loc.start.column : -1
    })});
    return { ok: true, errs };
  } catch (e) {
    return { thrown: String(e && e.message || e).slice(0, 300), errs, win: win.slice(0, 800) };
  }
}
"""

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page()
    page.goto('about:blank')
    page.add_script_tag(url='https://unpkg.com/vue@3/dist/vue.global.js')
    print(page.evaluate(JS, html))
    b.close()
