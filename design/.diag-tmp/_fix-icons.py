import re, io

p = r'G:\vibecoding\bxverse-opencode\design\bxverse-ultimate-cockpit.html'
with io.open(p, 'r', encoding='utf-8') as f:
    html = f.read()

# 浏览器 HTML 解析器会把非 void 自定义元素的 <icon ... /> 当作开标签，
# 吞掉后续兄弟节点，破坏 v-if/v-else 相邻性（compiler-30）。统一改成显式闭合。
# 只处理 HTML 模板区（<script> 之前），JS 字符串里的模板由 Vue 编译器解析，自闭合是合法的。
script_pos = html.index('<script>', html.index('<div id="app"'))
head_part = html[:script_pos]
tail_part = html[script_pos:]

fixed, n = re.subn(r'<icon\b([^>]*?)\s*/>', r'<icon\1></icon>', head_part)
with io.open(p, 'w', encoding='utf-8', newline='\n') as f:
    f.write(fixed + tail_part)
print('replaced:', n)
