# -*- coding: utf-8 -*-
import io
from playwright.sync_api import sync_playwright

URL = 'file:///G:/vibecoding/bxverse-opencode/design/bxverse-ultimate-cockpit.html'
html = io.open(URL.replace('file:///', ''), 'r', encoding='utf-8').read()

JS = """
(html) => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const tpl = doc.getElementById('app').innerHTML;
  // 找到 webhook 开关按钮行
  const line = tpl.split('\\n').find(l => l.includes('@click="w.on=!w.on"'));
  const m = line.match(/:class="([^"]*)"/);
  const expr = m ? m[1] : '(none)';
  const codes = [];
  for (let i = 0; i < expr.length; i++) codes.push(expr.charCodeAt(i));
  let fn = 'ok';
  try { new Function('return (' + expr + ')'); } catch (e) { fn = String(e).slice(0, 200); }
  // 用 Vue 的表达式解析路径：包成 :class 绑定单独编译
  let vc = 'ok';
  try { Vue.compile('<button :class="' + expr + '"></button>'); } catch (e) { vc = String(e && e.message || e).slice(0, 200); }
  return { expr, codes: codes.join(','), fn, vc };
}
"""

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page()
    page.goto('about:blank')
    page.add_script_tag(url='https://unpkg.com/vue@3/dist/vue.global.js')
    print(page.evaluate(JS, html))
    b.close()
