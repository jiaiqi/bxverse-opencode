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
  const out = { rawLine: line };
  // 提取 button 标签的实际序列化结果
  const m = line.match(/<button[^>]*>/);
  out.serializedTag = m ? m[0] : null;
  // 单独编译该 button
  try { Vue.compile(line); out.singleCompile = 'ok'; }
  catch (e) { out.singleCompile = String(e && e.message || e).slice(0, 300); }
  // 表达式单独验证
  const expr = "w.on?'bg-wx-accent':'bg-[rgba(255,255,255,.12)]'";
  try { new Function('return (' + expr + ')'); out.exprFn = 'ok'; }
  catch (e) { out.exprFn = String(e).slice(0, 200); }
  return out;
}
"""

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page()
    page.goto('about:blank')
    page.add_script_tag(url='https://unpkg.com/vue@3/dist/vue.global.js')
    res = page.evaluate(JS, html)
    for k, v in res.items():
        print(k, '=>', v)
    b.close()
