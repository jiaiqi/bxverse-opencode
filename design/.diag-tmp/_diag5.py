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
      col: e.loc ? e.loc.start.column : -1,
      ctx: e.loc ? tpl.split('\\n')[tpl.slice(0, e.loc.start.offset).split('\\n').length - 1].slice(0, 220) : ''
    })});
  } catch (e) {
    return { thrown: String(e).slice(0, 300), errs };
  }
  return { ok: true, errs };
}
"""

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page()
    page.goto(URL, wait_until='load')
    page.wait_for_timeout(500)
    res = page.evaluate(JS, html)
    for e in res.get('errs', []):
        print(e)
    if 'thrown' in res:
        print('THROWN:', res['thrown'])
    if res.get('ok') and not res['errs']:
        print('COMPILE OK (browser round-trip)')
    b.close()
