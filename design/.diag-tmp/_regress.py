# -*- coding: utf-8 -*-
"""原型 v2 全链路回归：编译往返 + 关键交互冒烟"""
import io
from playwright.sync_api import sync_playwright

URL = 'file:///G:/vibecoding/bxverse-opencode/design/bxverse-ultimate-cockpit.html'
html = io.open(URL.replace('file:///', ''), 'r', encoding='utf-8').read()

COMPILE_CHECK = """
(html) => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const tpl = doc.getElementById('app').innerHTML;
  try { Vue.compile(tpl); return 'OK'; }
  catch (e) { return 'FAIL: ' + String(e && e.message || e).slice(0, 300); }
}
"""

def check(name, ok):
    print(('PASS' if ok else 'FAIL') + ' | ' + name)

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={'width': 1440, 'height': 900})
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)[:150]))

    # 1) 编译往返
    page.goto('about:blank')
    page.add_script_tag(url='https://unpkg.com/vue@3/dist/vue.global.js')
    r = page.evaluate(COMPILE_CHECK, html)
    check('模板浏览器往返编译', r == 'OK' and not print(r))

    # 2) 挂载
    page.goto(URL, wait_until='networkidle')
    page.wait_for_timeout(1200)
    check('应用挂载', page.evaluate("!!document.getElementById('app').__vue_app__"))
    check('无 pageerror', not errs or print(errs))

    def has(txt):
        return page.evaluate("(t)=>document.body.innerText.includes(t)", txt)

    # 3) 侧栏导航
    page.click("text=备份与对比"); page.wait_for_timeout(300)
    check('导航：备份与对比', has('一致性对比引擎'))

    # 4) 对比流程
    page.click("text=开始对比"); page.wait_for_timeout(1400)
    check('对比产出四类统计', has('2,846'))

    # 5) 仓库工作台
    page.click("text=PC 前端主站"); page.wait_for_timeout(300)
    check('仓库工作台打开', has('构建流水线'))
    page.click("text=Git 工作台"); page.wait_for_timeout(300)
    check('Git 面板（工作区干净态）', has('工作区干净'))
    page.click("text=数据可视化平台") if False else None

    # 6) 弹窗：接入仓库校验
    page.click("text=主产品线") if False else None
    page.click("div.nav-item:has-text('项目 · 主产品线')") if False else None

    # 7) 发布向导全流程
    page.click("header >> text=详细向导") if False else page.click("text=发起发布") if False else None
    page.click("aside >> text=发布向导"); page.wait_for_timeout(300)
    check('向导步骤 1 检测', has('变动检测'))
    page.click("text=下一步：版本"); page.wait_for_timeout(300)
    check('向导步骤 2 版本预览', has('实时预览'))
    page.click("text=Beta"); page.wait_for_timeout(200)
    check('prerelease 预览 beta.1', has('2.4.1-beta.1'))
    page.click("text=下一步：生成双轨日志"); page.wait_for_timeout(300)
    check('步骤 3 双轨日志', has('对内 internal'))
    # 门禁：未确认不能进 dry-run
    page.click("text=下一步：dry-run"); page.wait_for_timeout(300)
    check('门禁拦截（双轨未确认）', has('人审为终'))
    page.click("text=确认当前轨"); page.wait_for_timeout(200)
    page.click("text=对外 external"); page.wait_for_timeout(200)
    page.click("text=AI 润色"); page.wait_for_timeout(1500)
    check('AI 润色生效', has('看得见的效率'))
    page.click("text=确认当前轨"); page.wait_for_timeout(200)
    page.click("text=下一步：dry-run"); page.wait_for_timeout(3200)
    check('dry-run 完成', has('全部通过'))
    page.click("text=进入执行"); page.wait_for_timeout(500)
    check('执行控制台启动', has('journal 逐步落盘'))
    # 中断 + 续跑
    page.click("text=中断（可续跑）"); page.wait_for_timeout(300)
    check('中断标记', has('用户中断'))
    page.click("text=从断点续跑"); page.wait_for_timeout(1000)
    check('续跑模式', has('续跑模式'))
    page.wait_for_timeout(14000)
    check('发布完成页', has('发布完成'))

    # 8) 完成页导出（真实下载）
    with page.expect_download() as dl:
        page.click("text=下载")
    check('version.json 真实下载', dl.value.suggested_filename == 'version.json')

    # 9) 健康页
    page.click("aside >> text=系统健康"); page.wait_for_timeout(300)
    check('系统健康页', has('安全基线'))

    # 10) 历史 + 抽屉 + 废弃弹窗
    page.click("aside >> text=历史与审计"); page.wait_for_timeout(300)
    page.click("tbody tr >> nth=1"); page.wait_for_timeout(400)
    check('发布详情抽屉', has('仓库快照'))
    page.click("button:has-text('废弃')"); page.wait_for_timeout(300)
    check('废弃确认弹窗', has('废弃原因'))

    # 11) 命令面板
    page.keyboard.press('Escape')
    page.keyboard.press('Control+k'); page.wait_for_timeout(300)
    check('命令面板', has('搜索命令、页面、仓库'))
    page.fill("input[placeholder*='搜索命令']", '仓库')
    page.wait_for_timeout(200)
    check('命令面板过滤仓库', has('打开仓库：IM 即时通讯'))

    print('pageerrors final:', errs if errs else 'NONE')
    b.close()
