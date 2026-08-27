# -*- coding: utf-8 -*-
from playwright.sync_api import sync_playwright

JS = """
() => {
  const cases = [
    ['<button :class="w.on?\\'bg-wx-accent\\':\\'bg-[rgba(255,255,255,.12)]\\'"></button>', 'bind-class only'],
    ['<button @click="w.on=!w.on"></button>', 'click only'],
    ['<button class="w-9 h-5 rounded-full relative check-ring"></button>', 'static class only'],
    ['<button :class="w.on?\\'a\\':\\'bg-[rgba(255,255,255,.12)]\\'"></button>', 'bind-class simple a'],
    ['<button :class="w.on?\\'bg-wx-accent\\':\\'bg-x\\'"></button>', 'bind-class no bracket'],
    ['<button @click="w.on=!w.on" :class="w.on?\\'bg-wx-accent\\':\\'bg-[rgba(255,255,255,.12)]\\'"></button>', 'click+bind'],
    ['<div :class="\\'bg-[rgba(255,255,255,.12)]\\'"></div>', 'single bracket branch'],
  ];
  return cases.map(([t, label]) => {
    try { Vue.compile(t); return label + ': OK'; }
    catch (e) { return label + ': FAIL ' + String(e && e.message || e).slice(0, 120); }
  });
}
"""

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page()
    page.goto('about:blank')
    page.add_script_tag(url='https://unpkg.com/vue@3/dist/vue.global.js')
    for r in page.evaluate(JS):
        print(r)
    b.close()
