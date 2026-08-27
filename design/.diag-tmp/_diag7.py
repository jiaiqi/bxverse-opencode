# -*- coding: utf-8 -*-
import io
from playwright.sync_api import sync_playwright

URL = 'file:///G:/vibecoding/bxverse-opencode/design/bxverse-ultimate-cockpit.html'
html = io.open(URL.replace('file:///', ''), 'r', encoding='utf-8').read()

JS = """
(html) => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const tpl = doc.getElementById('app').innerHTML;
  const errs = [];
  try {
    Vue.compile(tpl, { onError: e => errs.push({
      code: e.code, msg: e.message,
      line: e.loc ? tpl.slice(0, e.loc.start.offset).split('\\n').length : -1,
      ctx: e.loc ? tpl.split('\\n')[tpl.slice(0, e.loc.start.offset).split('\\n').length - 1].slice(0, 240) : ''
    })});
    return { compiled: true, errs };
  } catch (e) {
    return { compiled: false, thrown: String(e && e.message || e).slice(0, 500), errs };
  }
}
"""

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page()
    page.goto('about:blank')
    page.add_script_tag(url='https://unpkg.com/vue@3/dist/vue.global.js')  # dev 版
    res = page.evaluate(JS, html)
    print(res)
    b.close()
